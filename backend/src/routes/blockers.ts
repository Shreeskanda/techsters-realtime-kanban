import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  getTaskWithWorkspace,
  getWorkspaceMembership,
  filterBlockerForUser,
  emitBlockerSocketEvent,
} from "../lib/workspaceAuth";
import { recordHealthSnapshotAndBroadcast } from "../lib/health";

export const blockerRouter = Router();
blockerRouter.use(authenticate);

const createBlockerSchema = z.object({
  type: z.enum([
    "STUCK",
    "TECHNICAL_ASSISTANCE",
    "WAITING_FOR_PERSON",
    "UNCLEAR_REQUIREMENTS",
    "NEEDS_RESOURCES",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  privacy: z.enum(["PRIVATE_ADMINS", "TEAM", "REPORTER_AND_ADMINS"]).default("PRIVATE_ADMINS"),
  explanation: z.string().max(3000).optional(),
});

const updateBlockerSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  privacy: z.enum(["PRIVATE_ADMINS", "TEAM", "REPORTER_AND_ADMINS"]).optional(),
  resolutionNote: z.string().max(2000).optional(),
});

const blockerInclude = {
  reporter: { select: { id: true, name: true, email: true } },
  acknowledgedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, column: { select: { name: true, boardId: true } } } },
  workspace: { select: { id: true, name: true } },
};

// GET /api/tasks/:taskId/blockers – privacy-filtered blockers for one task
blockerRouter.get("/tasks/:taskId/blockers", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const blockers = await prisma.taskBlocker.findMany({
      where: { taskId },
      include: blockerInclude,
      orderBy: { createdAt: "desc" },
    });

    const visible = blockers
      .map((b) => filterBlockerForUser(b, req.userId!, member.role))
      .filter((b): b is NonNullable<typeof b> => b !== null);

    return res.json(visible);
  } catch (err) {
    console.error("Failed to fetch task blockers:", err);
    return res.status(500).json({ error: "Failed to fetch task blockers" });
  }
});

// GET /api/workspaces/:workspaceId/blockers – privacy-filtered blockers for a workspace
blockerRouter.get("/workspaces/:workspaceId/blockers", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const member = await getWorkspaceMembership(req.userId!, workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const includeResolved = req.query.includeResolved === "true";

    const blockers = await prisma.taskBlocker.findMany({
      where: {
        workspaceId,
        ...(includeResolved ? {} : { status: { not: "RESOLVED" } }),
      },
      include: blockerInclude,
      orderBy: { createdAt: "desc" },
    });

    const visible = blockers
      .map((b) => filterBlockerForUser(b, req.userId!, member.role))
      .filter((b): b is NonNullable<typeof b> => b !== null);

    return res.json(visible);
  } catch (err) {
    console.error("Failed to fetch workspace blockers:", err);
    return res.status(500).json({ error: "Failed to fetch blockers" });
  }
});

// GET /api/blockers/active – active unresolved blockers across all authorized workspaces
blockerRouter.get("/blockers/active", async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.userId! },
      select: { workspaceId: true, role: true },
    });
    if (memberships.length === 0) return res.json([]);

    const roleByWs = new Map(memberships.map((m) => [m.workspaceId, m.role]));
    const wsIds = memberships.map((m) => m.workspaceId);

    const blockers = await prisma.taskBlocker.findMany({
      where: {
        workspaceId: { in: wsIds },
        status: { not: "RESOLVED" },
      },
      include: blockerInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const visible = blockers
      .map((b) => filterBlockerForUser(b, req.userId!, roleByWs.get(b.workspaceId) || "VIEWER"))
      .filter((b): b is NonNullable<typeof b> => b !== null);

    return res.json(visible);
  } catch (err) {
    console.error("Failed to fetch active blockers:", err);
    return res.status(500).json({ error: "Failed to fetch active blockers" });
  }
});

// POST /api/tasks/:taskId/blockers – report a silent blocker (ADMIN/MEMBER only)
blockerRouter.post("/tasks/:taskId/blockers", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member || member.role === "VIEWER") {
      return res.status(403).json({ error: "VIEWERs cannot report blockers" });
    }

    const parsed = createBlockerSchema.parse(req.body);
    const trimmedExplanation = parsed.explanation?.trim() || null;

    // Duplicate protection within 5 seconds
    const fiveSecAgo = new Date(Date.now() - 5000);
    const duplicate = await prisma.taskBlocker.findFirst({
      where: {
        taskId,
        reporterId: req.userId!,
        type: parsed.type,
        status: "OPEN",
        explanation: trimmedExplanation,
        createdAt: { gte: fiveSecAgo },
      },
      include: blockerInclude,
    });
    if (duplicate) {
      return res.status(200).json(filterBlockerForUser(duplicate, req.userId!, member.role));
    }

    const [blocker] = await prisma.$transaction([
      prisma.taskBlocker.create({
        data: {
          type: parsed.type,
          severity: parsed.severity,
          privacy: parsed.privacy,
          explanation: trimmedExplanation,
          taskId,
          workspaceId: found.workspaceId,
          reporterId: req.userId!,
        },
        include: blockerInclude,
      }),
      prisma.task.update({
        where: { id: taskId },
        data: { updatedAt: new Date() },
      }),
    ]);

    // Log metadata only for private blockers to preserve silent privacy
    await prisma.activityLog.create({
      data: {
        action: "blocker_created",
        userId: req.userId!,
        workspaceId: found.workspaceId,
        taskId,
        details: {
          type: blocker.type,
          severity: blocker.severity,
          privacy: blocker.privacy,
        },
      },
    });

    await emitBlockerSocketEvent("blocker_created", blocker, found.workspaceId);
    await recordHealthSnapshotAndBroadcast(found.workspaceId);

    return res.status(201).json(filterBlockerForUser(blocker, req.userId!, member.role));
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    console.error("Failed to create blocker:", err);
    return res.status(500).json({ error: "Failed to report blocker" });
  }
});

// PATCH /api/blockers/:id – acknowledge or resolve blocker (reporter or workspace ADMIN)
blockerRouter.patch("/blockers/:id", async (req: AuthRequest, res) => {
  try {
    const blockerId = req.params.id as string;
    const existing = await prisma.taskBlocker.findUnique({
      where: { id: blockerId },
      include: blockerInclude,
    });
    if (!existing) return res.status(404).json({ error: "Blocker not found" });

    const member = await getWorkspaceMembership(req.userId!, existing.workspaceId);
    if (!member || member.role === "VIEWER") {
      return res.status(403).json({ error: "Forbidden – insufficient permissions" });
    }

    const isAdmin = member.role === "ADMIN";
    const isReporter = existing.reporterId === req.userId!;

    if (!isAdmin && !isReporter) {
      return res.status(403).json({ error: "Only the reporter or a workspace Admin can update this blocker" });
    }

    const parsed = updateBlockerSchema.parse(req.body);
    if (parsed.status === "ACKNOWLEDGED" && !isAdmin) {
      return res.status(403).json({ error: "Only authorized Administrators can acknowledge blockers" });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};
    if (parsed.severity) updateData.severity = parsed.severity;
    if (parsed.privacy && (isReporter || isAdmin)) updateData.privacy = parsed.privacy;
    if (parsed.resolutionNote !== undefined) updateData.resolutionNote = parsed.resolutionNote.trim() || null;

    if (parsed.status === "ACKNOWLEDGED" && existing.status === "OPEN") {
      updateData.status = "ACKNOWLEDGED";
      updateData.acknowledgedAt = now;
      updateData.acknowledgedById = req.userId!;
    } else if (parsed.status === "RESOLVED" && existing.status !== "RESOLVED") {
      updateData.status = "RESOLVED";
      updateData.resolvedAt = now;
      updateData.resolvedById = req.userId!;
      if (!existing.acknowledgedAt && isAdmin) {
        updateData.acknowledgedAt = now;
        updateData.acknowledgedById = req.userId!;
      }
    } else if (parsed.status === "OPEN" && isAdmin) {
      updateData.status = "OPEN";
      updateData.resolvedAt = null;
      updateData.resolvedById = null;
    }

    const updated = await prisma.taskBlocker.update({
      where: { id: blockerId },
      data: updateData,
      include: blockerInclude,
    });

    await prisma.task.update({
      where: { id: existing.taskId },
      data: { updatedAt: now },
    });

    const isResolvedNow = parsed.status === "RESOLVED" && existing.status !== "RESOLVED";
    const logAction = isResolvedNow
      ? "blocker_resolved"
      : parsed.status === "ACKNOWLEDGED"
        ? "blocker_acknowledged"
        : "blocker_updated";

    await prisma.activityLog.create({
      data: {
        action: logAction,
        userId: req.userId!,
        workspaceId: existing.workspaceId,
        taskId: existing.taskId,
        details: {
          blockerId: updated.id,
          type: updated.type,
          status: updated.status,
          severity: updated.severity,
          privacy: updated.privacy,
        },
      },
    });

    await emitBlockerSocketEvent(
      isResolvedNow ? "blocker_resolved" : "blocker_updated",
      updated,
      existing.workspaceId
    );
    await recordHealthSnapshotAndBroadcast(existing.workspaceId);

    return res.json(filterBlockerForUser(updated, req.userId!, member.role));
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    console.error("Failed to update blocker:", err);
    return res.status(500).json({ error: "Failed to update blocker" });
  }
});

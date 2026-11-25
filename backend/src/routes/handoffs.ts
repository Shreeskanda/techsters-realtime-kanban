import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getIO } from "../lib/io";
import { getTaskWithWorkspace, getWorkspaceMembership } from "../lib/workspaceAuth";

export const handoffRouter = Router();
handoffRouter.use(authenticate);

const createHandoffSchema = z.object({
  toUserId: z.string().min(1),
  completedSummary: z.string().min(1).max(4000),
  remainingWork: z.string().min(1).max(4000),
  problemsEncountered: z.string().max(4000).optional(),
  technicalDecisions: z.string().max(4000).optional(),
  firstStepRecommended: z.string().min(1).max(4000),
  importantLinks: z.array(z.string().max(500)).optional().default([]),
});

const ackSchema = z.object({
  note: z.string().max(2000).optional(),
});

const handoffInclude = {
  fromUser: { select: { id: true, name: true, email: true } },
  toUser: { select: { id: true, name: true, email: true } },
  acknowledgment: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  task: {
    select: {
      id: true,
      title: true,
      priority: true,
      columnId: true,
      column: { select: { name: true, boardId: true } },
      memoryEntries: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" as const },
        take: 5,
      },
    },
  },
  workspace: {
    select: {
      id: true,
      name: true,
      boards: { select: { id: true, name: true }, take: 1 },
    },
  },
};

// GET /api/tasks/:taskId/handoffs – chronological handoff history for a task
handoffRouter.get("/tasks/:taskId/handoffs", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const handoffs = await prisma.taskHandoff.findMany({
      where: { taskId },
      include: handoffInclude,
      orderBy: { createdAt: "asc" },
    });

    return res.json(handoffs);
  } catch (err) {
    console.error("Failed to fetch task handoffs:", err);
    return res.status(500).json({ error: "Failed to fetch handoffs" });
  }
});

// GET /api/handoffs/pending – pending unacknowledged handoffs received by current user
handoffRouter.get("/handoffs/pending", async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.userId! },
      select: { workspaceId: true },
    });
    const wsIds = memberships.map((m) => m.workspaceId);
    if (wsIds.length === 0) return res.json([]);

    const handoffs = await prisma.taskHandoff.findMany({
      where: {
        toUserId: req.userId!,
        workspaceId: { in: wsIds },
        acknowledgment: { is: null },
      },
      include: handoffInclude,
      orderBy: { createdAt: "desc" },
    });

    return res.json(handoffs);
  } catch (err) {
    console.error("Failed to fetch pending handoffs:", err);
    return res.status(500).json({ error: "Failed to fetch pending handoffs" });
  }
});

// GET /api/workspaces/:workspaceId/handoffs – recent handoffs in a workspace
handoffRouter.get("/workspaces/:workspaceId/handoffs", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const member = await getWorkspaceMembership(req.userId!, workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const handoffs = await prisma.taskHandoff.findMany({
      where: { workspaceId },
      include: handoffInclude,
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return res.json(handoffs);
  } catch (err) {
    console.error("Failed to fetch workspace handoffs:", err);
    return res.status(500).json({ error: "Failed to fetch workspace handoffs" });
  }
});

// POST /api/tasks/:taskId/handoffs – authorized task handover + reassignment
handoffRouter.post("/tasks/:taskId/handoffs", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member || member.role === "VIEWER") {
      return res.status(403).json({ error: "VIEWERs cannot create handoffs" });
    }

    const parsed = createHandoffSchema.parse(req.body);

    // Verify receiver is an active authorized member of the same workspace
    const targetMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: parsed.toUserId, workspaceId: found.workspaceId } },
      include: { user: { select: { id: true, name: true, isActive: true } } },
    });
    if (!targetMember) {
      return res.status(400).json({ error: "Cannot hand off task: target user is not a member of this workspace." });
    }
    if (!targetMember.user.isActive) {
      return res.status(400).json({ error: "Cannot hand off task: target member account is deactivated." });
    }
    if (targetMember.role === "VIEWER") {
      return res.status(400).json({ error: "Cannot hand off editable work to a read-only VIEWER." });
    }

    const importantLinks = (parsed.importantLinks || []).map((l) => l.trim()).filter(Boolean);

    // Duplicate prevention within 5 seconds
    const fiveSecAgo = new Date(Date.now() - 5000);
    const duplicate = await prisma.taskHandoff.findFirst({
      where: {
        taskId,
        fromUserId: req.userId!,
        toUserId: parsed.toUserId,
        completedSummary: parsed.completedSummary.trim(),
        remainingWork: parsed.remainingWork.trim(),
        createdAt: { gte: fiveSecAgo },
      },
      include: handoffInclude,
    });
    if (duplicate) {
      return res.status(200).json(duplicate);
    }

    const [handoff, updatedTask] = await prisma.$transaction([
      prisma.taskHandoff.create({
        data: {
          taskId,
          workspaceId: found.workspaceId,
          fromUserId: req.userId!,
          toUserId: parsed.toUserId,
          completedSummary: parsed.completedSummary.trim(),
          remainingWork: parsed.remainingWork.trim(),
          problemsEncountered: parsed.problemsEncountered?.trim() || null,
          technicalDecisions: parsed.technicalDecisions?.trim() || null,
          firstStepRecommended: parsed.firstStepRecommended.trim(),
          importantLinks,
        },
        include: handoffInclude,
      }),
      prisma.task.update({
        where: { id: taskId },
        data: { assigneeId: parsed.toUserId, updatedAt: new Date() },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true } },
          column: true,
          _count: { select: { comments: true, memoryEntries: true } },
        },
      }),
      prisma.activityLog.create({
        data: {
          action: "handoff_created",
          userId: req.userId!,
          workspaceId: found.workspaceId,
          taskId,
          details: {
            toUser: targetMember.user.name,
            firstStep: parsed.firstStepRecommended.trim().slice(0, 140),
          },
        },
      }),
    ]);

    try {
      const io = getIO();
      io.to(found.workspaceId).emit("task_updated", { task: updatedTask, workspaceId: found.workspaceId });
      io.to(found.workspaceId).emit("handoff_created", {
        handoff,
        taskId,
        workspaceId: found.workspaceId,
        toUserId: parsed.toUserId,
      });
      io.to(`user:${parsed.toUserId}`).emit("handoff_created", {
        handoff,
        taskId,
        workspaceId: found.workspaceId,
        toUserId: parsed.toUserId,
      });
    } catch {
      // ignore if socket not initialized
    }

    return res.status(201).json(handoff);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    console.error("Failed to create handoff:", err);
    return res.status(500).json({ error: "Failed to create task handoff" });
  }
});

// POST /api/handoffs/:id/acknowledge – receiver acknowledges the handoff
handoffRouter.post("/handoffs/:id/acknowledge", async (req: AuthRequest, res) => {
  try {
    const handoffId = req.params.id as string;
    const handoff = await prisma.taskHandoff.findUnique({
      where: { id: handoffId },
      include: { acknowledgment: true },
    });
    if (!handoff) return res.status(404).json({ error: "Handoff not found" });

    const member = await getWorkspaceMembership(req.userId!, handoff.workspaceId);
    if (!member || member.role === "VIEWER") {
      return res.status(403).json({ error: "VIEWERs cannot acknowledge handoffs" });
    }

    if (handoff.toUserId !== req.userId!) {
      return res.status(403).json({ error: "Only the receiving member can acknowledge this handoff" });
    }

    if (handoff.acknowledgment) {
      const existing = await prisma.taskHandoff.findUnique({
        where: { id: handoffId },
        include: handoffInclude,
      });
      return res.status(200).json(existing);
    }

    const parsed = ackSchema.parse(req.body || {});

    try {
      await prisma.$transaction([
        prisma.taskHandoffAcknowledgment.create({
          data: {
            handoffId,
            userId: req.userId!,
            note: parsed.note?.trim() || null,
          },
        }),
        prisma.activityLog.create({
          data: {
            action: "handoff_acknowledged",
            userId: req.userId!,
            workspaceId: handoff.workspaceId,
            taskId: handoff.taskId,
            details: {
              handoffId,
              note: parsed.note?.trim() || undefined,
            },
          },
        }),
      ]);
    } catch (txErr: any) {
      // Concurrent double-click unique constraint check (P2002)
      if (txErr.code !== "P2002") throw txErr;
    }

    const updated = await prisma.taskHandoff.findUnique({
      where: { id: handoffId },
      include: handoffInclude,
    });

    try {
      const io = getIO();
      io.to(handoff.workspaceId).emit("handoff_acknowledged", {
        handoff: updated,
        handoffId,
        taskId: handoff.taskId,
        workspaceId: handoff.workspaceId,
      });
      io.to(`user:${handoff.fromUserId}`).emit("handoff_acknowledged", {
        handoff: updated,
        handoffId,
        taskId: handoff.taskId,
        workspaceId: handoff.workspaceId,
      });
    } catch {
      // ignore if socket not initialized
    }

    return res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    console.error("Failed to acknowledge handoff:", err);
    return res.status(500).json({ error: "Failed to acknowledge handoff" });
  }
});

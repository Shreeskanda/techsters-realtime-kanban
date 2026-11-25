import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getIO } from "../lib/io";
import { getTaskWithWorkspace, getWorkspaceMembership } from "../lib/workspaceAuth";

export const memoryRouter = Router();
memoryRouter.use(authenticate);

const createMemorySchema = z.object({
  originalProblem: z.string().max(4000).optional(),
  expectedOutcome: z.string().max(4000).optional(),
  workCompleted: z.string().max(4000).optional(),
  approachesAttempted: z.string().max(4000).optional(),
  technicalDecisions: z.string().max(4000).optional(),
  outstandingQuestions: z.string().max(4000).optional(),
  nextRecommendedAction: z.string().max(4000).optional(),
  supportingLinks: z.array(z.string().max(500)).optional().default([]),
});

function cleanText(val?: string): string | null {
  const trimmed = val?.trim();
  return trimmed ? trimmed : null;
}

// GET /api/tasks/:taskId/memory – chronological Task Memory Capsule timeline
memoryRouter.get("/tasks/:taskId/memory", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied – not a workspace member" });

    const entries = await prisma.taskMemoryEntry.findMany({
      where: { taskId },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return res.json(entries);
  } catch (err) {
    console.error("Failed to fetch task memory:", err);
    return res.status(500).json({ error: "Failed to fetch task memory entries" });
  }
});

// POST /api/tasks/:taskId/memory – append immutable Task Memory entry (ADMIN/MEMBER only)
memoryRouter.post("/tasks/:taskId/memory", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member || member.role === "VIEWER") {
      return res.status(403).json({ error: "VIEWERs cannot modify task memory" });
    }

    const parsed = createMemorySchema.parse(req.body);
    const cleanedLinks = (parsed.supportingLinks || []).map((l) => l.trim()).filter(Boolean);

    const dataPayload = {
      originalProblem: cleanText(parsed.originalProblem),
      expectedOutcome: cleanText(parsed.expectedOutcome),
      workCompleted: cleanText(parsed.workCompleted),
      approachesAttempted: cleanText(parsed.approachesAttempted),
      technicalDecisions: cleanText(parsed.technicalDecisions),
      outstandingQuestions: cleanText(parsed.outstandingQuestions),
      nextRecommendedAction: cleanText(parsed.nextRecommendedAction),
      supportingLinks: cleanedLinks,
    };

    const hasContent =
      Boolean(
        dataPayload.originalProblem ||
          dataPayload.expectedOutcome ||
          dataPayload.workCompleted ||
          dataPayload.approachesAttempted ||
          dataPayload.technicalDecisions ||
          dataPayload.outstandingQuestions ||
          dataPayload.nextRecommendedAction
      ) || cleanedLinks.length > 0;

    if (!hasContent) {
      return res.status(400).json({ error: "Please fill in at least one memory field before saving." });
    }

    // Prevent rapid double-submit duplicates within 5 seconds
    const fiveSecAgo = new Date(Date.now() - 5000);
    const duplicate = await prisma.taskMemoryEntry.findFirst({
      where: {
        taskId,
        authorId: req.userId!,
        createdAt: { gte: fiveSecAgo },
        originalProblem: dataPayload.originalProblem,
        workCompleted: dataPayload.workCompleted,
        nextRecommendedAction: dataPayload.nextRecommendedAction,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    if (duplicate) {
      return res.status(200).json(duplicate);
    }

    const [entry] = await prisma.$transaction([
      prisma.taskMemoryEntry.create({
        data: {
          ...dataPayload,
          taskId,
          workspaceId: found.workspaceId,
          authorId: req.userId!,
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.task.update({
        where: { id: taskId },
        data: { updatedAt: new Date() },
      }),
      prisma.activityLog.create({
        data: {
          action: "task_memory_added",
          userId: req.userId!,
          workspaceId: found.workspaceId,
          taskId,
          details: {
            summary:
              dataPayload.nextRecommendedAction ||
              dataPayload.workCompleted ||
              dataPayload.technicalDecisions ||
              dataPayload.originalProblem ||
              "Added memory capsule entry",
          },
        },
      }),
    ]);

    try {
      getIO().to(found.workspaceId).emit("task_memory_updated", {
        taskId,
        workspaceId: found.workspaceId,
        entry,
      });
    } catch {
      // ignore if socket not initialized
    }

    return res.status(201).json(entry);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    console.error("Failed to create task memory:", err);
    return res.status(500).json({ error: "Failed to save task memory entry" });
  }
});

// GET /api/memories/recent – recently updated task memories across user's workspaces
memoryRouter.get("/memories/recent", async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.userId! },
      select: { workspaceId: true },
    });
    const wsIds = memberships.map((m) => m.workspaceId);
    if (wsIds.length === 0) return res.json([]);

    const workspaceIdFilter = req.query.workspaceId as string | undefined;
    if (workspaceIdFilter && !wsIds.includes(workspaceIdFilter)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const entries = await prisma.taskMemoryEntry.findMany({
      where: { workspaceId: workspaceIdFilter ? workspaceIdFilter : { in: wsIds } },
      include: {
        author: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true, columnId: true } },
        workspace: { select: { id: true, name: true, boards: { select: { id: true, name: true }, take: 1 } } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    return res.json(entries);
  } catch (err) {
    console.error("Failed to fetch recent memories:", err);
    return res.status(500).json({ error: "Failed to fetch recent task memories" });
  }
});

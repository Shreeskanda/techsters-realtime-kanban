import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getIO } from "../lib/io";
import { filterBlockerForUser, getTaskWithWorkspace, getWorkspaceMembership } from "../lib/workspaceAuth";
import { recordHealthSnapshotAndBroadcast } from "../lib/health";

export const taskRouter = Router();

taskRouter.use(authenticate);

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  expectedHours: z.number().int().min(1).max(2000).optional(),
  labels: z.array(z.string()).optional(),
  columnId: z.string(),
  assigneeId: z.string().optional(),
  workspaceId: z.string(),
});

const patchTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().optional().nullable().transform((v) => (v ? new Date(v) : v === null ? null : undefined)),
  expectedHours: z.number().int().min(1).max(2000).optional().nullable(),
  labels: z.array(z.string()).optional(),
  columnId: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  position: z.number().optional(),
  workspaceId: z.string().optional(),
});

// POST /api/tasks
taskRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { workspaceId, columnId, ...rest } = createTaskSchema.parse(req.body);

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member || member.role === "VIEWER") return res.status(403).json({ error: "VIEWERs cannot create tasks" });

    if (rest.assigneeId) {
      const targetMember = await getWorkspaceMembership(rest.assigneeId, workspaceId);
      if (!targetMember) {
        return res.status(400).json({ error: "Assignee is not an authorized member of this workspace" });
      }
    }

    const position = await prisma.task.count({ where: { columnId } });
    const task = await prisma.task.create({
      data: { ...rest, columnId, creatorId: req.userId!, position },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { comments: true, memoryEntries: true } },
      },
    });

    await prisma.activityLog.create({
      data: { action: "task_created", userId: req.userId!, workspaceId, taskId: task.id, details: { title: task.title } },
    });

    getIO().to(workspaceId).emit("task_created", { task, workspaceId });
    await recordHealthSnapshotAndBroadcast(workspaceId);
    return res.status(201).json(task);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to create task" });
  }
});

// PATCH /api/tasks/:id
taskRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const existing = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const workspaceId = existing.column.board.workspaceId;
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member || member.role === "VIEWER") return res.status(403).json({ error: "VIEWERs cannot edit tasks" });

    const { workspaceId: _wid, ...data } = patchTaskSchema.parse(req.body);
    if (data.assigneeId) {
      const targetMember = await getWorkspaceMembership(data.assigneeId, workspaceId);
      if (!targetMember) {
        return res.status(400).json({ error: "Cannot assign task to a user outside this workspace" });
      }
    }

    const isMoved = data.columnId && data.columnId !== existing.columnId;
    const isReassigned = data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId;

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        column: true,
        _count: { select: { comments: true, memoryEntries: true } },
      },
    });

    const action = isMoved ? "task_moved" : "task_updated";
    await prisma.activityLog.create({
      data: {
        action,
        userId: req.userId!,
        workspaceId,
        taskId: task.id,
        details: {
          ...(data as object),
          ...(isReassigned ? { previousAssigneeId: existing.assigneeId } : {}),
        },
      },
    });

    const event = isMoved ? "task_moved" : "task_updated";
    const io = getIO();
    const target = isReassigned && data.assigneeId ? io.to(workspaceId).to(`user:${data.assigneeId}`) : io.to(workspaceId);
    target.emit(event, { task, workspaceId });
    await recordHealthSnapshotAndBroadcast(workspaceId);
    return res.json(task);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to update task" });
  }
});

// DELETE /api/tasks/:id
taskRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const existing = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const workspaceId = existing.column.board.workspaceId;
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member || member.role !== "ADMIN") return res.status(403).json({ error: "Only ADMINs can delete tasks" });

    await prisma.task.delete({ where: { id: taskId } });
    await prisma.activityLog.create({
      data: { action: "task_deleted", userId: req.userId!, workspaceId, details: { title: existing.title } },
    });

    getIO().to(workspaceId).emit("task_deleted", { taskId, workspaceId });
    await recordHealthSnapshotAndBroadcast(workspaceId);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete task" });
  }
});

// GET /api/tasks/:id/timeline – unified chronological history (status changes, comments, memory, blockers, handoffs)
taskRouter.get("/:id/timeline", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const found = await getTaskWithWorkspace(taskId);
    if (!found) return res.status(404).json({ error: "Task not found" });

    const member = await getWorkspaceMembership(req.userId!, found.workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const [logs, comments, memories, blockers, handoffs] = await Promise.all([
      prisma.activityLog.findMany({
        where: { taskId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.comment.findMany({
        where: { taskId },
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.taskMemoryEntry.findMany({
        where: { taskId },
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.taskBlocker.findMany({
        where: { taskId },
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          acknowledgedBy: { select: { id: true, name: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.taskHandoff.findMany({
        where: { taskId },
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser: { select: { id: true, name: true, email: true } },
          acknowledgment: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    type TimelineItem = {
      id: string;
      kind: "activity" | "comment" | "memory" | "blocker" | "handoff" | "handoff_ack";
      timestamp: string;
      actor: { id: string; name: string };
      title: string;
      body?: string | null;
      meta?: Record<string, unknown>;
    };

    const items: TimelineItem[] = [];

    // Activity logs excluding events directly duplicated by rich entries
    const redundantActions = new Set([
      "comment_added",
      "task_memory_added",
      "blocker_created",
      "blocker_acknowledged",
      "blocker_resolved",
      "blocker_updated",
      "handoff_created",
      "handoff_acknowledged",
    ]);

    for (const log of logs) {
      if (redundantActions.has(log.action)) continue;
      items.push({
        id: `log-${log.id}`,
        kind: "activity",
        timestamp: log.createdAt.toISOString(),
        actor: log.user,
        title: log.action.replace(/_/g, " "),
        body: log.details ? JSON.stringify(log.details) : null,
        meta: { action: log.action, details: log.details },
      });
    }

    for (const c of comments) {
      items.push({
        id: `comment-${c.id}`,
        kind: "comment",
        timestamp: c.createdAt.toISOString(),
        actor: c.author,
        title: "Commented on task",
        body: c.content,
      });
    }

    for (const m of memories) {
      items.push({
        id: `memory-${m.id}`,
        kind: "memory",
        timestamp: m.createdAt.toISOString(),
        actor: m.author,
        title: "Added Task Memory Capsule entry",
        body: m.nextRecommendedAction || m.workCompleted || m.technicalDecisions || m.originalProblem || "Memory recorded",
        meta: { entryId: m.id },
      });
    }

    for (const b of blockers) {
      const visible = filterBlockerForUser(b, req.userId!, member.role);
      if (!visible) continue;
      items.push({
        id: `blocker-${b.id}`,
        kind: "blocker",
        timestamp: b.createdAt.toISOString(),
        actor: visible.reporter ? { id: visible.reporter.id, name: visible.reporter.name } : { id: "private", name: "Member" },
        title: `Reported ${b.severity} blocker (${b.type.replace(/_/g, " ")})`,
        body: visible.isPrivateRedacted ? "Private explanation visible to admins only" : visible.explanation,
        meta: { status: b.status, privacy: b.privacy, severity: b.severity, resolvedAt: b.resolvedAt },
      });
    }

    for (const h of handoffs) {
      items.push({
        id: `handoff-${h.id}`,
        kind: "handoff",
        timestamp: h.createdAt.toISOString(),
        actor: h.fromUser,
        title: `Handed off task to ${h.toUser.name}`,
        body: `First step: ${h.firstStepRecommended}`,
        meta: { toUser: h.toUser.name, acknowledged: !!h.acknowledgment },
      });
      if (h.acknowledgment) {
        items.push({
          id: `handoff-ack-${h.acknowledgment.id}`,
          kind: "handoff_ack",
          timestamp: h.acknowledgment.acknowledgedAt.toISOString(),
          actor: h.acknowledgment.user,
          title: "Acknowledged handoff",
          body: h.acknowledgment.note,
        });
      }
    }

    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return res.json(items);
  } catch (err) {
    console.error("Failed to fetch unified task timeline:", err);
    return res.status(500).json({ error: "Failed to fetch timeline" });
  }
});

// GET /api/tasks?workspaceId=
taskRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const { workspaceId } = req.query as { workspaceId: string };
    if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const tasks = await prisma.task.findMany({
      where: { column: { board: { workspaceId } } },
      include: {
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        column: true,
        _count: { select: { comments: true, memoryEntries: true } },
      },
      orderBy: [{ column: { position: "asc" } }, { position: "asc" }],
    });
    return res.json(tasks);
  } catch {
    return res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getIO } from "../lib/io";

export const taskRouter = Router();

taskRouter.use(authenticate);

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
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

    const position = await prisma.task.count({ where: { columnId } });
    const task = await prisma.task.create({
      data: { ...rest, columnId, creatorId: req.userId!, position },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });

    await prisma.activityLog.create({
      data: { action: "task_created", userId: req.userId!, workspaceId, taskId: task.id, details: { title: task.title } },
    });

    getIO().to(workspaceId).emit("task_created", { task, workspaceId });
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
    const isMoved = data.columnId && data.columnId !== existing.columnId;

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        column: true,
        _count: { select: { comments: true } },
      },
    });

    const action = isMoved ? "task_moved" : "task_updated";
    await prisma.activityLog.create({
      data: { action, userId: req.userId!, workspaceId, taskId: task.id, details: data as object },
    });

    const event = isMoved ? "task_moved" : "task_updated";
    getIO().to(workspaceId).emit(event, { task, workspaceId });
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
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete task" });
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
      },
      orderBy: [{ column: { position: "asc" } }, { position: "asc" }],
    });
    return res.json(tasks);
  } catch {
    return res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

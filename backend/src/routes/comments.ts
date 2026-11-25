import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { io } from "../server";

export const commentRouter = Router();

commentRouter.use(authenticate);

const commentSchema = z.object({ content: z.string().min(1).max(2000) });

// POST /api/tasks/:id/comments
commentRouter.post("/:id/comments", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const workspaceId = task.column.board.workspaceId;
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member || member.role === "VIEWER") return res.status(403).json({ error: "VIEWERs cannot comment" });

    const { content } = commentSchema.parse(req.body);
    const comment = await prisma.comment.create({
      data: { content, taskId, authorId: req.userId! },
      include: { author: { select: { id: true, name: true, email: true } } },
    });

    await prisma.activityLog.create({
      data: { action: "comment_added", userId: req.userId!, workspaceId, taskId, details: { content } },
    });

    io.to(workspaceId).emit("new_comment", { comment, taskId, workspaceId });
    return res.status(201).json(comment);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to add comment" });
  }
});

// GET /api/tasks/:id/comments
commentRouter.get("/:id/comments", async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId: task.column.board.workspaceId } },
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return res.json(comments);
  } catch {
    return res.status(500).json({ error: "Failed to fetch comments" });
  }
});

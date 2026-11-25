import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

export const boardRouter = Router();

boardRouter.use(authenticate);

const createBoardSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().optional(),
  workspaceId: z.string(),
});

// POST /api/boards
boardRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, description, workspaceId } = createBoardSchema.parse(req.body);

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member || member.role === "VIEWER") return res.status(403).json({ error: "Only ADMIN or MEMBER can create boards" });

    const board = await prisma.board.create({
      data: {
        name, description, workspaceId,
        columns: {
          create: [
            { name: "TO DO", position: 0 },
            { name: "IN PROGRESS", position: 1 },
            { name: "DONE", position: 2 },
          ],
        },
      },
      include: {
        columns: {
          include: {
            tasks: {
              include: {
                assignee: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                _count: { select: { comments: true } },
              },
            },
          },
          orderBy: { position: "asc" },
        },
      },
    });

    return res.status(201).json(board);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to create board" });
  }
});

// GET /api/boards/:id
boardRouter.get("/:id", async (req: AuthRequest, res) => {
  try {
    const boardId = req.params.id as string;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          orderBy: { position: "asc" },
          include: {
            tasks: {
              orderBy: { position: "asc" },
              include: {
                assignee: { select: { id: true, name: true, email: true } },
                creator: { select: { id: true, name: true } },
                _count: { select: { comments: true } },
              },
            },
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            members: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!board) return res.status(404).json({ error: "Board not found" });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId: board.workspaceId } },
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    return res.json(board);
  } catch {
    return res.status(500).json({ error: "Failed to fetch board" });
  }
});

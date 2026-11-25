import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

export const columnRouter = Router();

columnRouter.use(authenticate);

const createColumnSchema = z.object({ name: z.string().min(1).max(60) });
const patchColumnSchema = z.object({ name: z.string().min(1).max(60).optional(), position: z.number().optional() });

// POST /api/boards/:id/columns
columnRouter.post("/:id/columns", async (req: AuthRequest, res) => {
  try {
    const boardId = req.params.id as string;
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) return res.status(404).json({ error: "Board not found" });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId: board.workspaceId } },
    });
    if (!member || member.role === "VIEWER") return res.status(403).json({ error: "Insufficient permissions" });

    const { name } = createColumnSchema.parse(req.body);
    const count = await prisma.column.count({ where: { boardId: board.id } });
    const column = await prisma.column.create({ data: { name, boardId: board.id, position: count } });
    return res.status(201).json(column);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to create column" });
  }
});

// PATCH /api/columns/:id
columnRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const columnId = req.params.id as string;
    const col = await prisma.column.findUnique({ where: { id: columnId }, include: { board: true } });
    if (!col) return res.status(404).json({ error: "Column not found" });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId: col.board.workspaceId } },
    });
    if (!member || member.role === "VIEWER") return res.status(403).json({ error: "Insufficient permissions" });

    const data = patchColumnSchema.parse(req.body);
    const updated = await prisma.column.update({ where: { id: columnId }, data });
    return res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to update column" });
  }
});

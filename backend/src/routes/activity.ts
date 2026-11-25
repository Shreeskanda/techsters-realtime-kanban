import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

export const activityRouter = Router();

activityRouter.use(authenticate);

// GET /api/workspaces/:id/activity
activityRouter.get("/:id/activity", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const logs = await prisma.activityLog.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(logs);
  } catch {
    return res.status(500).json({ error: "Failed to fetch activity" });
  }
});

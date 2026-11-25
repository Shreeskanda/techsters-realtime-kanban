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

    const rawLogs = await prisma.activityLog.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Enforce Silent Blocker Radar privacy in workspace activity history
    const logs = rawLogs
      .map((log) => {
        if (!log.action.startsWith("blocker_") || member.role === "ADMIN" || log.userId === req.userId!) {
          return log;
        }
        const privacy = (log.details as Record<string, unknown> | null)?.privacy;
        if (privacy === "REPORTER_AND_ADMINS") {
          return null;
        }
        if (privacy === "PRIVATE_ADMINS" || !privacy) {
          return {
            ...log,
            userId: "private",
            user: { id: "private", name: "Workspace Member (Private)", email: "" },
          };
        }
        return log;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    return res.json(logs);
  } catch {
    return res.status(500).json({ error: "Failed to fetch activity" });
  }
});

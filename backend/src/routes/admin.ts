// Admin-specific stats, join requests, activity log & feedback dashboard endpoint
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

export const adminRouter = Router();
adminRouter.use(authenticate);

// GET /api/admin/stats – global platform stats visible to admins
adminRouter.get("/stats", async (req: AuthRequest, res) => {
  try {
    const actor = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { systemRole: true },
    });

    const myAdminWorkspaces = await prisma.workspaceMember.findMany({
      where: { userId: req.userId!, role: "ADMIN" },
      select: { workspaceId: true },
    });
    const wsIds = myAdminWorkspaces.map((m) => m.workspaceId);

    if (actor?.systemRole !== "ADMIN" && wsIds.length === 0) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const [
      totalUsers,
      totalWorkspaces,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      pendingJoinRequests,
      recentActivity,
      tasksByPriority,
      feedbacks,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count({ where: { id: { in: wsIds } } }),
      prisma.task.count({ where: { column: { board: { workspaceId: { in: wsIds } } } } }),
      prisma.task.count({ where: { column: { name: "DONE", board: { workspaceId: { in: wsIds } } } } }),
      prisma.task.count({ where: { column: { name: "IN PROGRESS", board: { workspaceId: { in: wsIds } } } } }),
      prisma.task.count({ where: { column: { name: "TO DO", board: { workspaceId: { in: wsIds } } } } }),
      prisma.joinRequest.findMany({
        where: { workspaceId: { in: wsIds }, status: "PENDING" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.findMany({
        where: { workspaceId: { in: wsIds } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          task: { select: { id: true, title: true } },
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.task.groupBy({
        by: ["priority"],
        where: { column: { board: { workspaceId: { in: wsIds } } } },
        _count: true,
      }),
      prisma.projectFeedback.findMany({
        where: { workspaceId: { in: wsIds } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const avgRating = feedbacks.length
      ? Number((feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1))
      : null;

    return res.json({
      totalUsers,
      totalWorkspaces,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      pendingRequests: pendingJoinRequests.length,
      pendingJoinRequests,
      recentActivity,
      tasksByPriority,
      feedbacks,
      avgRating,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

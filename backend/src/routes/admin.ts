// Admin-specific stats, user activation management, join requests, activity log & feedback dashboard endpoint
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getIO } from "../lib/io";
import { getOnlineUserIds, isUserOnline } from "../lib/presence";

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
      activeUsersCount,
      inactiveUsersCount,
      totalWorkspaces,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      pendingJoinRequests,
      recentActivity,
      tasksByPriority,
      feedbacks,
      unresolvedBlockersCount,
      pendingHandoffsCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
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
      prisma.taskBlocker.count({
        where: { workspaceId: { in: wsIds }, status: { not: "RESOLVED" } },
      }),
      prisma.taskHandoff.count({
        where: { workspaceId: { in: wsIds }, acknowledgment: { is: null } },
      }),
    ]);

    const avgRating = feedbacks.length
      ? Number((feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1))
      : null;

    return res.json({
      totalUsers,
      activeUsersCount,
      inactiveUsersCount,
      onlineUsersCount: getOnlineUserIds().length,
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
      unresolvedBlockersCount,
      pendingHandoffsCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

// GET /api/admin/users – member & user activation status directory (System ADMIN only)
adminRouter.get("/users", async (req: AuthRequest, res) => {
  try {
    if (req.systemRole !== "ADMIN") {
      return res.status(403).json({ error: "System Admin access required" });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        systemRole: true,
        isActive: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ systemRole: "asc" }, { createdAt: "desc" }],
    });

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const enriched = users.map((u) => {
      const online = isUserOnline(u.id);
      const recentlyActive = !!u.lastSeenAt && u.lastSeenAt.getTime() >= fiveMinutesAgo;
      return {
        ...u,
        isOnline: online,
        presenceStatus: !u.isActive
          ? "DEACTIVATED"
          : online
            ? "ONLINE"
            : recentlyActive
              ? "RECENTLY_ACTIVE"
              : u.lastLoginAt
                ? "OFFLINE"
                : "NEVER_LOGGED_IN",
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error("Failed to fetch admin user activation list:", err);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

// PATCH /api/admin/users/:id/activate – reactivate user account
adminRouter.patch("/users/:id/activate", async (req: AuthRequest, res) => {
  try {
    if (req.systemRole !== "ADMIN") {
      return res.status(403).json({ error: "System Admin access required" });
    }

    const targetId = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        systemRole: true,
        isActive: true,
        lastLoginAt: true,
        lastSeenAt: true,
      },
    });

    try {
      getIO().to("admin_lobby").emit("user_status_changed", { userId: targetId, isActive: true });
    } catch {
      // ignore socket errors
    }

    return res.json(updated);
  } catch (err) {
    console.error("Failed to activate user:", err);
    return res.status(500).json({ error: "Failed to activate user" });
  }
});

// PATCH /api/admin/users/:id/deactivate – deactivate user account & terminate live sockets
adminRouter.patch("/users/:id/deactivate", async (req: AuthRequest, res) => {
  try {
    if (req.systemRole !== "ADMIN") {
      return res.status(403).json({ error: "System Admin access required" });
    }

    const targetId = req.params.id as string;
    if (targetId === req.userId) {
      return res.status(400).json({ error: "You cannot deactivate your own active administrator account." });
    }

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        email: true,
        systemRole: true,
        isActive: true,
        lastLoginAt: true,
        lastSeenAt: true,
      },
    });

    try {
      const io = getIO();
      io.to(`user:${targetId}`).emit("account_deactivated", { message: "Your account has been deactivated by an administrator." });
      io.in(`user:${targetId}`).disconnectSockets(true);
      io.to("admin_lobby").emit("user_status_changed", { userId: targetId, isActive: false });
    } catch {
      // ignore socket errors
    }

    return res.json(updated);
  } catch (err) {
    console.error("Failed to deactivate user:", err);
    return res.status(500).json({ error: "Failed to deactivate user" });
  }
});

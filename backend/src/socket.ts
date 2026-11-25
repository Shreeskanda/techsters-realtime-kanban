// Socket.IO integration – TechSters Collaborative Kanban
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma";
import { markUserConnected, markUserDisconnected } from "./lib/presence";

interface AuthSocket extends Socket {
  userId?: string;
}

export function setupSocketIO(io: SocketIOServer) {
  // Authenticate every socket connection and check active account status
  io.use(async (socket: AuthSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, isActive: true },
      });
      if (!user || !user.isActive) {
        return next(new Error("Account deactivated or unavailable"));
      }
      socket.userId = user.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthSocket) => {
    const userId = socket.userId;
    console.log(`🔌 Socket connected: ${socket.id} (user: ${userId})`);

    if (userId) {
      socket.join(`user:${userId}`);
      markUserConnected(userId, socket.id);
      io.to("admin_lobby").emit("user_presence_changed", { userId, isOnline: true });
      // Update lastSeenAt asynchronously without delaying socket event handler registration
      void prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }

    // Join all admin workspace rooms + admin lobby presence channel
    socket.on("join_admin_lobby", async () => {
      try {
        if (!socket.userId) return;
        const actor = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { systemRole: true },
        });
        const adminMemberships = await prisma.workspaceMember.findMany({
          where: { userId: socket.userId, role: "ADMIN" },
          select: { workspaceId: true },
        });
        if (actor?.systemRole === "ADMIN" || adminMemberships.length > 0) {
          socket.join("admin_lobby");
        }
        for (const m of adminMemberships) {
          socket.join(m.workspaceId);
        }
        socket.emit("admin_lobby_joined", { workspaceIds: adminMemberships.map((m) => m.workspaceId) });
      } catch {
        socket.emit("error", { message: "Failed to join admin lobby" });
      }
    });

    // Join a workspace room (strictly verifying workspace membership)
    socket.on("join_workspace", async ({ workspaceId }: { workspaceId: string }) => {
      try {
        if (!workspaceId || !socket.userId) return;
        const member = await prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: socket.userId, workspaceId } },
        });
        if (!member) {
          socket.emit("error", { message: "Not a workspace member" });
          return;
        }
        socket.join(workspaceId);
        socket.emit("workspace_joined", { workspaceId, role: member.role });
      } catch {
        socket.emit("error", { message: "Failed to join workspace" });
      }
    });

    // Leave workspace
    socket.on("leave_workspace", ({ workspaceId }: { workspaceId: string }) => {
      if (workspaceId) socket.leave(workspaceId);
    });

    socket.on("disconnect", async () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      if (userId) {
        markUserDisconnected(userId, socket.id);
        io.to("admin_lobby").emit("user_presence_changed", { userId, isOnline: false });
        await prisma.user
          .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }
    });
  });
}

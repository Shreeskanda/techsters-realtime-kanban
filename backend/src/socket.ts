// Socket.IO integration – TechSters Collaborative Kanban
// Author: Integration Engineer (Person 4)
// Branch: feature/integration

import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma";

interface AuthSocket extends Socket {
  userId?: string;
}

export function setupSocketIO(io: SocketIOServer) {
  // Authenticate every socket connection
  io.use(async (socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthSocket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join a workspace room (after verifying membership)
    socket.on("join_workspace", async ({ workspaceId }: { workspaceId: string }) => {
      try {
        const member = await prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: socket.userId!, workspaceId } },
        });
        if (!member) {
          socket.emit("error", { message: "Not a workspace member" });
          return;
        }
        socket.join(workspaceId);
        socket.emit("workspace_joined", { workspaceId });
        console.log(`  → User ${socket.userId} joined workspace room: ${workspaceId}`);
      } catch {
        socket.emit("error", { message: "Failed to join workspace" });
      }
    });

    // Leave workspace
    socket.on("leave_workspace", ({ workspaceId }: { workspaceId: string }) => {
      socket.leave(workspaceId);
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

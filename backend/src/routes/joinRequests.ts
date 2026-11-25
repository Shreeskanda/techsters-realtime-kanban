import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { io } from "../server";

export const joinRouter = Router();
joinRouter.use(authenticate);

// GET /api/join-requests/my/status – user checks their own request statuses
joinRouter.get("/my/status", async (req: AuthRequest, res) => {
  try {
    const requests = await prisma.joinRequest.findMany({
      where: { userId: req.userId! },
      include: { workspace: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json(requests);
  } catch {
    return res.status(500).json({ error: "Failed to fetch statuses" });
  }
});

// POST /api/join-requests/:workspaceId – request access to a project
joinRouter.post("/:workspaceId", async (req: AuthRequest, res) => {
  try {
    const { workspaceId } = req.params as { workspaceId: string };
    const { message } = z.object({ message: z.string().max(500).optional() }).parse(req.body || {});

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: "Project not found" });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (member) return res.status(409).json({ error: "Already a member of this project" });

    const existing = await prisma.joinRequest.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (existing && existing.status === "PENDING") {
      return res.status(409).json({ error: "Join request already pending admin approval" });
    }

    const request = await prisma.joinRequest.upsert({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
      update: { status: "PENDING", message: message || null },
      create: { userId: req.userId!, workspaceId, message: message || null },
      include: {
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "join_requested",
        userId: req.userId!,
        workspaceId,
        details: { project: workspace.name, message: message || "" },
      },
    });

    // Notify workspace room and all workspace admins directly
    io.to(workspaceId).emit("join_request_received", { request });
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: "ADMIN" },
      select: { userId: true },
    });
    for (const admin of admins) {
      io.to(`user:${admin.userId}`).emit("join_request_received", { request });
    }

    return res.status(201).json(request);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error" });
    return res.status(500).json({ error: "Failed to submit join request" });
  }
});

// GET /api/join-requests/:workspaceId – admin sees all pending requests for workspace
joinRouter.get("/:workspaceId", async (req: AuthRequest, res) => {
  try {
    const { workspaceId } = req.params as { workspaceId: string };
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member || member.role !== "ADMIN") return res.status(403).json({ error: "ADMIN only" });

    const requests = await prisma.joinRequest.findMany({
      where: { workspaceId, status: "PENDING" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(requests);
  } catch {
    return res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// PATCH /api/join-requests/:id – approve or reject
joinRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    const { action, role } = z
      .object({
        action: z.enum(["APPROVED", "REJECTED"]),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
      })
      .parse(req.body);

    const request = await prisma.joinRequest.findUnique({
      where: { id },
      include: { workspace: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!request) return res.status(404).json({ error: "Request not found" });

    const me = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId: request.workspaceId } },
    });
    if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "ADMIN only" });

    const updated = await prisma.joinRequest.update({
      where: { id },
      data: { status: action },
      include: {
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    if (action === "APPROVED") {
      const assignedRole = role || "MEMBER";
      const membership = await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: request.userId, workspaceId: request.workspaceId } },
        update: { role: assignedRole },
        create: { userId: request.userId, workspaceId: request.workspaceId, role: assignedRole },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      await prisma.activityLog.create({
        data: {
          action: "join_approved",
          userId: req.userId!,
          workspaceId: request.workspaceId,
          details: { userName: request.user.name, role: assignedRole },
        },
      });

      io.to(request.workspaceId).emit("member_added", { member: membership });
      io.to(request.workspaceId).emit("join_request_approved", {
        userId: request.userId,
        workspaceId: request.workspaceId,
      });
      io.to(`user:${request.userId}`).emit("join_request_approved", {
        userId: request.userId,
        workspaceId: request.workspaceId,
      });
    } else {
      await prisma.activityLog.create({
        data: {
          action: "join_rejected",
          userId: req.userId!,
          workspaceId: request.workspaceId,
          details: { userName: request.user.name },
        },
      });
      io.to(`user:${request.userId}`).emit("join_request_rejected", {
        userId: request.userId,
        workspaceId: request.workspaceId,
      });
    }

    return res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error" });
    return res.status(500).json({ error: "Failed to process request" });
  }
});

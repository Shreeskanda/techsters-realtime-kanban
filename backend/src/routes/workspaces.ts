import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getIO } from "../lib/io";

export const workspaceRouter = Router();

workspaceRouter.use(authenticate);

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

// GET /api/workspaces/public – list all projects so members in 2nd portal can view/request access
workspaceRouter.get("/public", async (_req: AuthRequest, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        createdAt: true,
        _count: { select: { members: true, boards: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(workspaces);
  } catch {
    return res.status(500).json({ error: "Failed to list public projects" });
  }
});

// POST /api/workspaces – any authenticated user can create a project (creator becomes workspace ADMIN)
workspaceRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, description } = createWorkspaceSchema.parse(req.body);
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();

    const workspace = await prisma.workspace.create({
      data: {
        name,
        description,
        slug,
        members: { create: { userId: req.userId!, role: "ADMIN" } },
        boards: {
          create: {
            name: "Main Board",
            description: "Default Kanban board",
            columns: {
              create: [
                { name: "TO DO", position: 0 },
                { name: "IN PROGRESS", position: 1 },
                { name: "DONE", position: 2 },
              ],
            },
          },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        boards: { select: { id: true, name: true } },
        _count: { select: { boards: true, members: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "project_created",
        userId: req.userId!,
        workspaceId: workspace.id,
        details: { name: workspace.name },
      },
    });

    return res.status(201).json(workspace);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to create workspace" });
  }
});

// GET /api/workspaces
workspaceRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: { members: { some: { userId: req.userId! } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        boards: { select: { id: true, name: true } },
        _count: { select: { boards: true, members: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(workspaces);
  } catch {
    return res.status(500).json({ error: "Failed to fetch workspaces" });
  }
});

// GET /api/workspaces/:id
workspaceRouter.get("/:id", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        boards: true,
      },
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });
    return res.json(workspace);
  } catch {
    return res.status(500).json({ error: "Failed to fetch workspace" });
  }
});

// POST /api/workspaces/:id/members
workspaceRouter.post("/:id/members", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;
    const me = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "Only ADMINs can invite members" });

    const { email, role } = inviteMemberSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!target) return res.status(404).json({ error: "User not found" });

    const existing = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: target.id, workspaceId } },
    });
    if (existing) return res.status(409).json({ error: "User already a member" });

    const membership = await prisma.workspaceMember.create({
      data: { userId: target.id, workspaceId, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Clear any pending join request if one existed
    await prisma.joinRequest.updateMany({
      where: { userId: target.id, workspaceId, status: "PENDING" },
      data: { status: "APPROVED" },
    });

    await prisma.activityLog.create({
      data: {
        action: "member_invited",
        userId: req.userId!,
        workspaceId,
        details: { invitedUser: target.name, role },
      },
    });

    getIO().to(workspaceId).emit("member_added", { member: membership });
    getIO().to(`user:${target.id}`).emit("join_request_approved", { userId: target.id, workspaceId });
    return res.status(201).json(membership);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to invite member" });
  }
});

// PATCH /api/workspaces/:id/members/:userId – update member role (ADMIN only)
workspaceRouter.patch("/:id/members/:userId", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const me = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "Only ADMINs can assign roles" });

    const { role } = z.object({ role: z.enum(["ADMIN", "MEMBER", "VIEWER"]) }).parse(req.body);
    const updated = await prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await prisma.activityLog.create({
      data: {
        action: "role_updated",
        userId: req.userId!,
        workspaceId,
        details: { targetUser: updated.user.name, role },
      },
    });

    getIO().to(workspaceId).emit("member_updated", { member: updated });
    return res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error" });
    return res.status(500).json({ error: "Failed to update member role" });
  }
});

// DELETE /api/workspaces/:id/members/:userId
workspaceRouter.delete("/:id/members/:userId", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const me = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!me || me.role !== "ADMIN") return res.status(403).json({ error: "Only ADMINs can remove members" });

    await prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    });
    getIO().to(workspaceId).emit("member_removed", { userId: targetUserId });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to remove member" });
  }
});

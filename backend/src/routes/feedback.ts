import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { io } from "../server";

export const feedbackRouter = Router();
feedbackRouter.use(authenticate);

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  category: z.enum(["GENERAL", "UX_DESIGN", "COLLABORATION", "PERFORMANCE", "FEATURE_REQUEST"]).default("GENERAL"),
  message: z.string().min(3).max(1000),
  workspaceId: z.string(),
});

// POST /api/feedback – logged-in user submits project feedback
feedbackRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { rating, category, message, workspaceId } = feedbackSchema.parse(req.body);

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: "Project not found" });

    const feedback = await prisma.projectFeedback.create({
      data: { rating, category, message, userId: req.userId!, workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "feedback_submitted",
        userId: req.userId!,
        workspaceId,
        details: { rating, category },
      },
    });

    io.to(workspaceId).emit("feedback_received", { feedback });
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: "ADMIN" },
      select: { userId: true },
    });
    for (const admin of admins) {
      io.to(`user:${admin.userId}`).emit("feedback_received", { feedback });
    }

    return res.status(201).json(feedback);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// GET /api/feedback?workspaceId= – admin views feedback
feedbackRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const { workspaceId } = req.query as { workspaceId?: string };

    if (workspaceId) {
      const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
      });
      if (!member || member.role !== "ADMIN") return res.status(403).json({ error: "ADMIN only" });

      const feedbacks = await prisma.projectFeedback.findMany({
        where: { workspaceId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json(feedbacks);
    }

    const myAdminWs = await prisma.workspaceMember.findMany({
      where: { userId: req.userId!, role: "ADMIN" },
      select: { workspaceId: true },
    });
    const feedbacks = await prisma.projectFeedback.findMany({
      where: { workspaceId: { in: myAdminWs.map((m) => m.workspaceId) } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(feedbacks);
  } catch {
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

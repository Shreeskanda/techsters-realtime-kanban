import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getWorkspaceMembership } from "../lib/workspaceAuth";
import { computeWorkspaceHealth, recordHealthSnapshotAndBroadcast } from "../lib/health";

export const healthRouter = Router();
healthRouter.use(authenticate);

// GET /api/workspaces/:workspaceId/health – deterministic Project Health Pulse calculation
healthRouter.get("/workspaces/:workspaceId/health", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const member = await getWorkspaceMembership(req.userId!, workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const report = await computeWorkspaceHealth(workspaceId);
    if (!report) return res.status(404).json({ error: "Workspace not found" });

    return res.json(report);
  } catch (err) {
    console.error("Failed to compute project health:", err);
    return res.status(500).json({ error: "Failed to compute project health" });
  }
});

// GET /api/workspaces/:workspaceId/health/history – historical snapshots
healthRouter.get("/workspaces/:workspaceId/health/history", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const member = await getWorkspaceMembership(req.userId!, workspaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const limit = Math.min(30, Number(req.query.limit) || 14);
    const snapshots = await prisma.projectHealthSnapshot.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json(snapshots.reverse());
  } catch (err) {
    console.error("Failed to fetch health history:", err);
    return res.status(500).json({ error: "Failed to fetch health history" });
  }
});

// POST /api/workspaces/:workspaceId/health/snapshot – capture point-in-time snapshot (ADMIN only)
healthRouter.post("/workspaces/:workspaceId/health/snapshot", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const member = await getWorkspaceMembership(req.userId!, workspaceId);
    if (!member || member.role !== "ADMIN") {
      return res.status(403).json({ error: "Only workspace ADMINs can record manual health snapshots" });
    }

    const report = await recordHealthSnapshotAndBroadcast(workspaceId, true);
    if (!report) return res.status(404).json({ error: "Workspace not found" });

    return res.status(201).json(report);
  } catch (err) {
    console.error("Failed to create health snapshot:", err);
    return res.status(500).json({ error: "Failed to capture health snapshot" });
  }
});

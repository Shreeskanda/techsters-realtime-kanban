import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

export const exportRouter = Router();

exportRouter.use(authenticate);

// GET /api/workspaces/:id/export
exportRouter.get("/:id/export", async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const tasks = await prisma.task.findMany({
      where: { column: { board: { workspaceId } } },
      include: {
        assignee: { select: { name: true, email: true } },
        creator: { select: { name: true } },
        column: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ column: { position: "asc" } }, { position: "asc" }],
    });

    const headers = ["ID", "Title", "Status", "Priority", "Assignee", "Creator", "Labels", "Due Date", "Comments", "Created At"];
    const rows = tasks.map((t) => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      t.column?.name || "",
      t.priority,
      t.assignee?.name || "",
      t.creator?.name || "",
      (t.labels || []).join("; "),
      t.dueDate ? t.dueDate.toISOString().split("T")[0] : "",
      String(t._count?.comments || 0),
      t.createdAt.toISOString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="tasks-export-${Date.now()}.csv"`);
    return res.send(csv);
  } catch {
    return res.status(500).json({ error: "Export failed" });
  }
});

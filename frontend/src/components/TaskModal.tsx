import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { Task, Comment, WorkspaceMember, Column } from "../lib/api";

interface Props {
  task: Task;
  workspaceId: string;
  userRole: string;
  columns: Column[];
  members: WorkspaceMember[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}

export default function TaskModal({
  task,
  workspaceId,
  userRole,
  columns,
  members,
  onClose,
  onUpdate,
  onDelete,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    columnId: task.columnId,
    dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    labels: (task.labels || []).join(", "),
    assigneeId: task.assigneeId || "",
  });
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.tasks.getComments(task.id).then(setComments);
  }, [task.id]);

  // Real-time comments while modal is open
  useEffect(() => {
    const socket = connectSocket();
    const onNewComment = ({ comment, taskId }: { comment: Comment; taskId: string }) => {
      if (taskId === task.id) {
        setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
      }
    };
    socket.on("new_comment", onNewComment);
    return () => {
      socket.off("new_comment", onNewComment);
    };
  }, [task.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.tasks.update(task.id, {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        columnId: form.columnId,
        dueDate: form.dueDate || undefined,
        labels: form.labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        assigneeId: form.assigneeId || undefined,
        workspaceId,
      });
      onUpdate(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const c = await api.tasks.addComment(task.id, newComment.trim());
      setComments((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
      setNewComment("");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task permanently?")) return;
    setDeleting(true);
    try {
      await api.tasks.delete(task.id);
      onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  };

  const priorityBadge: Record<string, string> = {
    LOW: "badge-gray",
    MEDIUM: "badge-orange",
    HIGH: "badge-purple",
    URGENT: "badge-red",
  };

  const statusName = columns.find((c) => c.id === task.columnId)?.name || task.column?.name || "—";

  return (
    <div className="overlay">
      <div className="modal modal-lg">
        <div className="modal-header" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            {editing ? (
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            ) : (
              <div className="modal-title" style={{ fontSize: 18 }}>
                {task.title}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <span className={`badge ${priorityBadge[task.priority] || "badge-gray"}`}>{task.priority}</span>
              <span className="badge badge-blue">{statusName}</span>
              {task.labels?.map((label) => (
                <span key={label} className="task-label">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {userRole !== "VIEWER" && !editing && (
              <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">
                Edit
              </button>
            )}
            {userRole === "ADMIN" && (
              <button onClick={handleDelete} disabled={deleting} className="btn btn-danger btn-sm">
                {deleting ? "..." : "Delete"}
              </button>
            )}
            <button onClick={onClose} className="modal-close" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="field-label">Status Column</label>
                <select
                  className="input sm"
                  value={form.columnId}
                  onChange={(e) => setForm((f) => ({ ...f, columnId: e.target.value }))}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Priority</label>
                <select
                  className="input sm"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Task["priority"] }))}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>
              <div>
                <label className="field-label">Due Date</label>
                <input
                  type="date"
                  className="input sm"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Assignee</label>
                <select
                  className="input sm"
                  value={form.assigneeId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Labels (comma separated)</label>
                <input
                  className="input sm"
                  placeholder="frontend, auth, sprint-1"
                  value={form.labels}
                  onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                <div className="stat-label">Assignee</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                  {task.assignee?.name || "Unassigned"}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                <div className="stat-label">Due Date</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                <div className="stat-label">Reporter</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                  {task.creator?.name || "—"}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                <div className="stat-label">Created</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                  {new Date(task.createdAt).toLocaleDateString()}
                </div>
              </div>
              {task.description && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div className="stat-label">Description</div>
                  <div style={{ fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.5 }}>
                    {task.description}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comments Thread */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
            <h3 style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 12 }}>
              Comments ({comments.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {comments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No comments yet.</div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div className="user-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>
                        {c.author.name[0]}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{c.author.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--text-secondary)", paddingLeft: 30 }}>{c.content}</div>
                  </div>
                ))
              )}
            </div>

            {userRole !== "VIEWER" && (
              <form onSubmit={handleComment} style={{ display: "flex", gap: 8 }}>
                <input
                  className="input sm"
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button type="submit" disabled={posting} className="btn btn-primary btn-sm">
                  {posting ? "..." : "Post"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

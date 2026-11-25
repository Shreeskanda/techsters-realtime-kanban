import React, { useState } from "react";
import { api } from "../lib/api";
import type { Task, WorkspaceMember } from "../lib/api";

interface Props {
  columnId: string;
  workspaceId: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onCreate: (task: Task) => void;
}

export default function CreateTaskModal({ columnId, workspaceId, members, onClose, onCreate }: Props) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as Task["priority"],
    dueDate: "",
    expectedHours: "",
    labels: "",
    assigneeId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const task = await api.tasks.create({
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        expectedHours: form.expectedHours ? Number(form.expectedHours) : undefined,
        labels: form.labels ? form.labels.split(",").map((l) => l.trim()).filter(Boolean) : [],
        assigneeId: form.assigneeId || undefined,
        columnId,
        workspaceId,
      });
      onCreate(task);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div className="modal-title">Create New Task</div>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="field-label">Title *</label>
              <input
                className="input"
                placeholder="e.g. Configure Redis session cache"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="field-label">Description</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Acceptance criteria and implementation notes..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label className="field-label">Priority</label>
                <select
                  className="input sm"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Task["priority"] }))}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
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
                <label className="field-label">Est. Hours</label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  className="input sm"
                  placeholder="e.g. 8"
                  value={form.expectedHours}
                  onChange={(e) => setForm((f) => ({ ...f, expectedHours: e.target.value }))}
                />
              </div>
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
                    {m.user.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Labels (comma-separated)</label>
              <input
                className="input sm"
                placeholder="frontend, security, sprint-1"
                value={form.labels}
                onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { Task, Comment, WorkspaceMember } from "../lib/api";

interface Props {
  task: Task;
  workspaceId: string;
  userRole: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}

export default function TaskModal({ task, workspaceId, userRole, members, onClose, onUpdate, onDelete }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    labels: task.labels.join(", "),
    assigneeId: task.assigneeId || "",
  });
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.tasks.getComments(task.id).then(setComments);
  }, [task.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.tasks.update(task.id, {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        labels: form.labels.split(",").map((l) => l.trim()).filter(Boolean),
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
      const c = await api.tasks.addComment(task.id, newComment);
      setComments((prev) => [...prev, c]);
      setNewComment("");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.tasks.delete(task.id);
      onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  };

  const priorityColors: Record<string, string> = {
    LOW: "bg-slate-700 text-slate-400",
    MEDIUM: "bg-yellow-900/60 text-yellow-300",
    HIGH: "bg-orange-900/60 text-orange-300",
    URGENT: "bg-red-900/60 text-red-300",
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-700">
          <div className="flex-1 mr-4">
            {editing ? (
              <input
                className="input text-lg font-bold"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            ) : (
              <h2 className="text-xl font-bold text-white">{task.title}</h2>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-1 rounded font-medium ${priorityColors[task.priority]}`}>
                {task.priority}
              </span>
              {task.labels?.map((label) => (
                <span key={label} className="text-xs bg-blue-900/40 text-blue-300 px-2 py-1 rounded">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {userRole !== "VIEWER" && !editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary text-sm">Edit</button>
            )}
            {userRole === "ADMIN" && (
              <button onClick={handleDelete} disabled={deleting} className="btn-danger text-sm">
                {deleting ? "..." : "Delete"}
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none ml-2">×</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata */}
          {editing ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                <select className="input text-sm" value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Task["priority"] }))}>
                  <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Due Date</label>
                <input type="date" className="input text-sm" value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Assignee</label>
                <select className="input text-sm" value={form.assigneeId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Labels</label>
                <input className="input text-sm" placeholder="label1, label2" value={form.labels}
                  onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea className="input resize-none h-24 text-sm" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="col-span-2 flex gap-2">
                <button onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-900 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">Assignee</p>
                <p className="text-slate-200">{task.assignee?.name || "Unassigned"}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">Due Date</p>
                <p className="text-slate-200">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">Created by</p>
                <p className="text-slate-200">{task.creator?.name || "—"}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">Status</p>
                <p className="text-slate-200">{task.column?.name || "—"}</p>
              </div>
              {task.description && (
                <div className="col-span-2 bg-slate-900 rounded-lg p-3">
                  <p className="text-slate-500 text-xs mb-1">Description</p>
                  <p className="text-slate-300 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="font-semibold text-slate-200 mb-3">Comments ({comments.length})</h3>
            <div className="space-y-3 mb-4">
              {comments.length === 0 ? (
                <p className="text-slate-500 text-sm">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="bg-slate-900 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {c.author.name[0]}
                      </span>
                      <span className="text-sm font-medium text-slate-300">{c.author.name}</span>
                      <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-300 ml-8">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            {userRole !== "VIEWER" && (
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button type="submit" disabled={posting} className="btn-primary text-sm px-4">
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

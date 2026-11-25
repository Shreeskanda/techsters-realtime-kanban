import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { Workspace, WorkspaceMember, ActivityLog } from "../lib/api";

interface Props {
  workspace: Workspace;
  onSelectBoard: (boardId: string) => void;
  userRole: string;
  currentUserId: string;
}

export default function WorkspacePage({ workspace, onSelectBoard, userRole, currentUserId }: Props) {
  const [ws, setWs] = useState<Workspace>(workspace);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);

  useEffect(() => {
    api.workspaces.get(workspace.id).then(setWs);
    api.workspaces.getActivity(workspace.id).then(setActivity);
  }, [workspace.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteMsg("");
    try {
      const m = await api.workspaces.inviteMember(ws.id, { email: inviteEmail, role: inviteRole }) as WorkspaceMember;
      setWs((w) => ({ ...w, members: [...w.members, m] }));
      setInviteEmail("");
      setInviteMsg("✅ Member invited successfully!");
    } catch (err: any) {
      setInviteMsg(`❌ ${err.message}`);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    await api.workspaces.removeMember(ws.id, userId);
    setWs((w) => ({ ...w, members: w.members.filter((m) => m.user.id !== userId) }));
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    setCreatingBoard(true);
    try {
      const board = await api.boards.create({ name: newBoardName, workspaceId: ws.id });
      setWs((w) => ({ ...w, boards: [...(w.boards || []), { id: board.id, name: board.name }] }));
      setNewBoardName("");
    } finally {
      setCreatingBoard(false);
    }
  };

  const actionLabels: Record<string, string> = {
    task_created: "created task",
    task_updated: "updated task",
    task_moved: "moved task",
    task_deleted: "deleted task",
    comment_added: "commented on",
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{ws.name}</h1>
          {ws.description && <p className="text-slate-400 text-sm mt-1">{ws.description}</p>}
        </div>
        {userRole !== "VIEWER" && (
          <button
            onClick={() => { api.workspaces.export(ws.id).catch(console.error); }}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            📥 Export CSV
          </button>
        )}
      </div>

      {/* Boards */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Boards ({ws.boards?.length || 0})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {ws.boards?.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBoard(b.id)}
              className="p-4 bg-slate-900 hover:bg-blue-900/30 border border-slate-700 hover:border-blue-600 rounded-lg text-left transition-all"
            >
              <p className="font-medium text-slate-200">📌 {b.name}</p>
            </button>
          ))}
        </div>
        {userRole !== "VIEWER" && (
          <form onSubmit={handleCreateBoard} className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="New board name..."
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
            />
            <button type="submit" disabled={creatingBoard} className="btn-primary text-sm">
              {creatingBoard ? "..." : "Create"}
            </button>
          </form>
        )}
      </div>

      {/* Members */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Team Members ({ws.members?.length || 0})</h2>
        <div className="space-y-2 mb-4">
          {ws.members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                  {m.user.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{m.user.name}</p>
                  <p className="text-xs text-slate-500">{m.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded font-medium ${
                  m.role === "ADMIN" ? "bg-purple-900/60 text-purple-300" :
                  m.role === "MEMBER" ? "bg-blue-900/60 text-blue-300" :
                  "bg-slate-700 text-slate-400"
                }`}>{m.role}</span>
                {userRole === "ADMIN" && m.user.id !== currentUserId && (
                  <button
                    onClick={() => handleRemoveMember(m.user.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Invite */}
        {userRole === "ADMIN" && (
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Invite Member</h3>
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <select className="input w-32 text-sm" value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}>
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button type="submit" disabled={inviting} className="btn-primary text-sm px-4">
                  {inviting ? "..." : "Invite"}
                </button>
              </div>
              {inviteMsg && <p className="text-sm">{inviteMsg}</p>}
            </form>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-slate-500 text-sm">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 20).map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-2 hover:bg-slate-900 rounded-lg transition-colors">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                  {log.user.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">{log.user.name}</span>{" "}
                    {actionLabels[log.action] || log.action}
                    {log.task && <span className="text-blue-400"> "{log.task.title}"</span>}
                  </p>
                  <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

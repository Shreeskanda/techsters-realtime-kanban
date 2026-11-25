import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { Workspace, WorkspaceMember, ActivityLog, JoinRequest } from "../lib/api";

interface Props {
  workspace: Workspace;
  onSelectBoard: (boardId: string) => void;
  userRole: string;
  currentUserId: string;
}

const ACTION_LABELS: Record<string, string> = {
  task_created: "created task",
  task_updated: "updated task",
  task_moved: "moved task",
  task_deleted: "deleted task",
  comment_added: "commented on",
  project_created: "created project",
  member_invited: "invited member",
  role_updated: "updated role",
  join_requested: "requested to join",
  join_approved: "approved join request",
  join_rejected: "declined join request",
  feedback_submitted: "submitted feedback",
};

export default function WorkspacePage({ workspace, onSelectBoard, userRole, currentUserId }: Props) {
  const [ws, setWs] = useState<Workspace>(workspace);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);

  const loadWorkspace = useCallback(async () => {
    const [fullWs, logs] = await Promise.all([
      api.workspaces.get(workspace.id),
      api.workspaces.getActivity(workspace.id),
    ]);
    setWs(fullWs);
    setActivity(logs);
    if (userRole === "ADMIN") {
      api.joinRequests.list(workspace.id).then(setJoinRequests).catch(() => {});
    }
  }, [workspace.id, userRole]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteStatus(null);
    try {
      const m = (await api.workspaces.inviteMember(ws.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })) as WorkspaceMember;
      setWs((w) => ({ ...w, members: [...w.members, m] }));
      setInviteEmail("");
      setInviteStatus({ ok: true, msg: "Member added to workspace." });
    } catch (err: unknown) {
      setInviteStatus({ ok: false, msg: err instanceof Error ? err.message : "Invite failed" });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: "ADMIN" | "MEMBER" | "VIEWER") => {
    const updated = await api.workspaces.updateMemberRole(ws.id, userId, role);
    setWs((w) => ({
      ...w,
      members: w.members.map((m) => (m.user.id === userId ? { ...m, role: updated.role } : m)),
    }));
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    await api.workspaces.removeMember(ws.id, userId);
    setWs((w) => ({ ...w, members: w.members.filter((m) => m.user.id !== userId) }));
  };

  const handleJoinAction = async (reqId: string, action: "APPROVED" | "REJECTED") => {
    await api.joinRequests.action(reqId, action, "MEMBER");
    await loadWorkspace();
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    setCreatingBoard(true);
    try {
      const board = await api.boards.create({ name: newBoardName.trim(), workspaceId: ws.id });
      setWs((w) => ({ ...w, boards: [...(w.boards || []), { id: board.id, name: board.name }] }));
      setNewBoardName("");
    } finally {
      setCreatingBoard(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 className="page-title">{ws.name}</h1>
            <span className={`role-chip-${userRole}`}>{userRole}</span>
          </div>
          {ws.description && <p className="page-sub">{ws.description}</p>}
        </div>
        {userRole !== "VIEWER" && (
          <button
            onClick={() => api.workspaces.export(ws.id).catch(console.error)}
            className="btn btn-secondary"
          >
            Export Tasks CSV
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Boards Section */}
        <div className="card">
          <h2 style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 14 }}>
            Kanban Boards ({ws.boards?.length || 0})
          </h2>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            {ws.boards?.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelectBoard(b.id)}
                className="project-item"
                style={{ textAlign: "left" }}
              >
                <div className="project-item-name">▥ {b.name}</div>
                <div className="project-item-desc">Open Kanban board →</div>
              </button>
            ))}
          </div>

          {userRole !== "VIEWER" && (
            <form onSubmit={handleCreateBoard} style={{ display: "flex", gap: 8, maxWidth: 460 }}>
              <input
                className="input sm"
                placeholder="New board name (e.g. Sprint 2)..."
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
              />
              <button type="submit" disabled={creatingBoard} className="btn btn-primary btn-sm">
                {creatingBoard ? "..." : "+ Create Board"}
              </button>
            </form>
          )}
        </div>

        {/* Pending Join Requests (Admin Only) */}
        {userRole === "ADMIN" && joinRequests.length > 0 && (
          <div className="card">
            <h2 style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 14 }}>
              Pending Join Requests ({joinRequests.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {joinRequests.map((req) => (
                <div key={req.id} className="join-row">
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
                      {req.user.name} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>({req.user.email})</span>
                    </div>
                    {req.message && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{req.message}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleJoinAction(req.id, "APPROVED")}>
                      Approve
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleJoinAction(req.id, "REJECTED")}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Members & Role Assignment */}
        <div className="card">
          <h2 style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 14 }}>
            Team Members ({ws.members?.length || 0})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {ws.members?.map((m) => (
              <div key={m.id} className="join-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="user-avatar">{m.user.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{m.user.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.user.email}</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {userRole === "ADMIN" && m.user.id !== currentUserId ? (
                    <select
                      className="input sm"
                      style={{ width: 110 }}
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user.id, e.target.value as "ADMIN" | "MEMBER" | "VIEWER")}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  ) : (
                    <span className={`role-chip-${m.role}`}>{m.role}</span>
                  )}

                  {userRole === "ADMIN" && m.user.id !== currentUserId && (
                    <button onClick={() => handleRemoveMember(m.user.id)} className="btn btn-danger btn-sm">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {userRole === "ADMIN" && (
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
                Invite Registered Member
              </div>
              <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input sm"
                  style={{ flex: 1, minWidth: 220 }}
                  type="email"
                  placeholder="teammate@techsters.dev"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <select
                  className="input sm"
                  style={{ width: 120 }}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "MEMBER" | "VIEWER")}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button type="submit" disabled={inviting} className="btn btn-primary btn-sm">
                  {inviting ? "..." : "Invite Member"}
                </button>
              </form>
              {inviteStatus && (
                <div className={`alert ${inviteStatus.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: 10 }}>
                  {inviteStatus.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Workspace Activity History */}
        <div className="card">
          <h2 style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 14 }}>Workspace Activity History</h2>
          {activity.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No activity recorded yet.</div>
          ) : (
            <div>
              {activity.slice(0, 25).map((log) => (
                <div key={log.id} className="activity-row">
                  <div className="activity-avatar">{log.user.name[0]}</div>
                  <div>
                    <div className="activity-text">
                      <strong style={{ color: "var(--text-primary)" }}>{log.user.name}</strong>{" "}
                      {ACTION_LABELS[log.action] || log.action}
                      {log.task && <span className="activity-task"> &ldquo;{log.task.title}&rdquo;</span>}
                    </div>
                    <div className="activity-time">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

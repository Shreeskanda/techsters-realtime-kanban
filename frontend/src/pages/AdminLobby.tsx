import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { AdminStats, Workspace } from "../lib/api";

interface Props {
  onSelectWorkspace: (w: Workspace) => void;
  onSelectBoard: (boardId: string, workspaceId: string, boardName?: string, workspace?: Workspace) => void;
  onPendingCountChange?: (count: number) => void;
}

type LobbyTab = "overview" | "requests" | "logs" | "feedback";

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  task_created: { label: "Created Task", tone: "badge-blue" },
  task_updated: { label: "Updated Task", tone: "badge-gray" },
  task_moved: { label: "Moved Task", tone: "badge-purple" },
  task_deleted: { label: "Deleted Task", tone: "badge-red" },
  comment_added: { label: "Commented", tone: "badge-blue" },
  project_created: { label: "Created Project", tone: "badge-green" },
  member_invited: { label: "Invited Member", tone: "badge-green" },
  role_updated: { label: "Updated Role", tone: "badge-purple" },
  join_requested: { label: "Requested Join", tone: "badge-orange" },
  join_approved: { label: "Approved Join", tone: "badge-green" },
  join_rejected: { label: "Declined Join", tone: "badge-red" },
  feedback_submitted: { label: "Submitted Feedback", tone: "badge-orange" },
};

export default function AdminLobby({ onSelectWorkspace, onSelectBoard, onPendingCountChange }: Props) {
  const [tab, setTab] = useState<LobbyTab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [logSearch, setLogSearch] = useState("");
  const [logActionFilter, setLogActionFilter] = useState("ALL");
  const [fbCategoryFilter, setFbCategoryFilter] = useState("ALL");

  // Create Project Modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // Role choice per pending join request
  const [roleSelection, setRoleSelection] = useState<Record<string, "MEMBER" | "VIEWER">>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, ws] = await Promise.all([api.admin.stats(), api.workspaces.list()]);
      setStats(s);
      setWorkspaces(ws);
      onPendingCountChange?.(s.pendingRequests);
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates inside Admin Lobby
  useEffect(() => {
    const socket = connectSocket();
    socket.emit("join_admin_lobby");

    const refresh = () => loadData();
    socket.on("join_request_received", refresh);
    socket.on("feedback_received", refresh);
    socket.on("task_created", refresh);
    socket.on("task_moved", refresh);
    socket.on("task_updated", refresh);
    socket.on("task_deleted", refresh);
    socket.on("new_comment", refresh);

    return () => {
      socket.off("join_request_received", refresh);
      socket.off("feedback_received", refresh);
      socket.off("task_created", refresh);
      socket.off("task_moved", refresh);
      socket.off("task_updated", refresh);
      socket.off("task_deleted", refresh);
      socket.off("new_comment", refresh);
    };
  }, [loadData]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErr("");
    setCreating(true);
    try {
      await api.workspaces.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await loadData();
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleRequestAction = async (id: string, action: "APPROVED" | "REJECTED") => {
    setProcessingId(id);
    try {
      const role = roleSelection[id] || "MEMBER";
      await api.joinRequests.action(id, action, action === "APPROVED" ? role : undefined);
      await loadData();
    } finally {
      setProcessingId(null);
    }
  };

  if (loading || !stats) {
    return <div className="page" style={{ color: "var(--text-secondary)" }}>Loading executive lobby...</div>;
  }

  const totalTasks = stats.totalTasks || 0;
  const completionPct = totalTasks > 0 ? Math.round((stats.completedTasks / totalTasks) * 100) : 0;
  const todoPct = totalTasks > 0 ? (stats.todoTasks / totalTasks) * 100 : 0;
  const inProgPct = totalTasks > 0 ? (stats.inProgressTasks / totalTasks) * 100 : 0;
  const donePct = totalTasks > 0 ? (stats.completedTasks / totalTasks) * 100 : 0;

  const filteredLogs = stats.recentActivity.filter((log) => {
    const matchesAction = logActionFilter === "ALL" || log.action === logActionFilter;
    const hay = `${log.user.name} ${log.action} ${log.task?.title || ""} ${log.workspace?.name || ""}`.toLowerCase();
    const matchesSearch = !logSearch.trim() || hay.includes(logSearch.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const filteredFeedback = stats.feedbacks.filter(
    (fb) => fbCategoryFilter === "ALL" || fb.category === fbCategoryFilter
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Sub-Navigation Tabs */}
      <div className="tabs-bar">
        <button className={`tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
          Dashboard Overview
        </button>
        <button className={`tab-btn ${tab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>
          Join Requests
          {stats.pendingRequests > 0 && <span className="tab-count alert-dot">{stats.pendingRequests}</span>}
        </button>
        <button className={`tab-btn ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>
          Log History
          <span className="tab-count">{stats.recentActivity.length}</span>
        </button>
        <button className={`tab-btn ${tab === "feedback" ? "active" : ""}`} onClick={() => setTab("feedback")}>
          Project Feedback
          <span className="tab-count">{stats.feedbacks.length}</span>
        </button>
      </div>

      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Admin Control Lobby</h1>
            <p className="page-sub">
              Manage organization projects, approve member join requests, audit log history, and review user feedback.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="live-pill">
              <span className="live-dot" /> Real-Time Telemetry
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Create Project
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Projects</div>
            <div className="stat-value">{stats.totalWorkspaces}</div>
            <div className="stat-sub">{stats.totalUsers} registered users</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Task Velocity</div>
            <div className="stat-value">{completionPct}%</div>
            <div className="stat-sub">
              {stats.completedTasks} / {stats.totalTasks} tasks completed
            </div>
          </div>
          <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setTab("requests")}>
            <div className="stat-label">Pending Requests</div>
            <div className="stat-value" style={{ color: stats.pendingRequests > 0 ? "var(--accent-orange)" : "var(--text-primary)" }}>
              {stats.pendingRequests}
            </div>
            <div className="stat-sub">Awaiting admin approval</div>
          </div>
          <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setTab("feedback")}>
            <div className="stat-label">Feedback Score</div>
            <div className="stat-value" style={{ color: "var(--accent-orange)" }}>
              {stats.avgRating !== null ? `${stats.avgRating} ★` : "—"}
            </div>
            <div className="stat-sub">{stats.feedbacks.length} project reviews</div>
          </div>
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Pipeline Progress & Priority Distribution */}
            <div className="grid-2">
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14.5, color: "var(--text-primary)" }}>Pipeline Task Distribution</h3>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{totalTasks} total</span>
                </div>
                <div className="progress-track" style={{ marginBottom: 14 }}>
                  <div className="progress-seg-todo" style={{ width: `${todoPct}%` }} />
                  <div className="progress-seg-inprog" style={{ width: `${inProgPct}%` }} />
                  <div className="progress-seg-done" style={{ width: `${donePct}%` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-secondary)" }}>● To Do: <strong style={{ color: "var(--text-primary)" }}>{stats.todoTasks}</strong></span>
                  <span style={{ color: "var(--accent)" }}>● In Progress: <strong style={{ color: "var(--text-primary)" }}>{stats.inProgressTasks}</strong></span>
                  <span style={{ color: "var(--accent-green)" }}>● Done: <strong style={{ color: "var(--text-primary)" }}>{stats.completedTasks}</strong></span>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14.5, color: "var(--text-primary)", marginBottom: 14 }}>Priority Breakdown</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {["URGENT", "HIGH", "MEDIUM", "LOW"].map((prio) => {
                    const count = stats.tasksByPriority.find((p) => p.priority === prio)?._count ?? 0;
                    const badgeClass =
                      prio === "URGENT" ? "badge-red" : prio === "HIGH" ? "badge-orange" : prio === "MEDIUM" ? "badge-blue" : "badge-gray";
                    return (
                      <div key={prio} style={{ flex: 1, minWidth: 90, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px" }}>
                        <span className={`badge ${badgeClass}`}>{prio}</span>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginTop: 8 }}>{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Projects */}
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>Managed Projects ({workspaces.length})</h2>
              </div>
              <div className="grid-3">
                {workspaces.map((ws) => (
                  <div key={ws.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span
                          style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}
                          onClick={() => onSelectWorkspace(ws)}
                        >
                          {ws.name}
                        </span>
                        <span className="role-chip-ADMIN">ADMIN</span>
                      </div>
                      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
                        {ws.description || "Project workspace"}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {ws.boards.slice(0, 2).map((b) => (
                          <button
                            key={b.id}
                            className="btn btn-secondary btn-sm"
                            style={{ justifyContent: "space-between", width: "100%" }}
                            onClick={() => onSelectBoard(b.id, ws.id, b.name, ws)}
                          >
                            <span>{b.name}</span>
                            <span style={{ color: "var(--accent)" }}>Open Board →</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {ws._count?.members ?? ws.members?.length ?? 0} members
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => onSelectWorkspace(ws)}>
                        Manage Team & Logs
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick Previews: Pending Requests + Recent Log History + Recent Feedback */}
            <div className="grid-2">
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14.5, color: "var(--text-primary)" }}>
                    Pending Access Requests ({stats.pendingRequests})
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTab("requests")}>
                    View all →
                  </button>
                </div>
                {stats.pendingJoinRequests.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" }}>
                    No pending project access requests.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {stats.pendingJoinRequests.slice(0, 4).map((req) => (
                      <div key={req.id} className="join-row" style={{ gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {req.user.name} <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>({req.user.email})</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--accent)" }}>Project: {req.workspace.name}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={processingId === req.id}
                            onClick={() => handleRequestAction(req.id, "APPROVED")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={processingId === req.id}
                            onClick={() => handleRequestAction(req.id, "REJECTED")}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14.5, color: "var(--text-primary)" }}>Recent Log History</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTab("logs")}>
                    Full Audit Log →
                  </button>
                </div>
                {stats.recentActivity.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" }}>
                    No recent activity recorded.
                  </div>
                ) : (
                  <div>
                    {stats.recentActivity.slice(0, 5).map((log) => (
                      <div key={log.id} className="activity-row">
                        <div className="activity-avatar">{log.user.name[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="activity-text">
                            <strong style={{ color: "var(--text-primary)" }}>{log.user.name}</strong>{" "}
                            <span>{ACTION_LABELS[log.action]?.label || log.action}</span>
                            {log.task && <span className="activity-task"> &ldquo;{log.task.title}&rdquo;</span>}
                            {log.workspace && <span style={{ color: "var(--text-muted)" }}> · {log.workspace.name}</span>}
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
        )}

        {/* JOIN REQUESTS TAB */}
        {tab === "requests" && (
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 16, color: "var(--text-primary)" }}>
              Member Access Requests ({stats.pendingJoinRequests.length})
            </h2>
            {stats.pendingJoinRequests.length === 0 ? (
              <div className="empty-state">All join requests have been processed.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {stats.pendingJoinRequests.map((req) => (
                  <div key={req.id} className="join-row" style={{ gap: 14, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 240 }}>
                      <div className="activity-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                        {req.user.name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                          {req.user.name} <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--text-secondary)" }}>{req.user.email}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--accent)", marginTop: 2 }}>
                          Requested access to: <strong>{req.workspace.name}</strong>
                        </div>
                        {req.message && (
                          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>
                            &ldquo;{req.message}&rdquo;
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                          Requested {new Date(req.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        className="input sm"
                        style={{ width: 115 }}
                        value={roleSelection[req.id] || "MEMBER"}
                        onChange={(e) =>
                          setRoleSelection((prev) => ({
                            ...prev,
                            [req.id]: e.target.value as "MEMBER" | "VIEWER",
                          }))
                        }
                      >
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={processingId === req.id}
                        onClick={() => handleRequestAction(req.id, "APPROVED")}
                      >
                        {processingId === req.id ? "..." : "Approve Access"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={processingId === req.id}
                        onClick={() => handleRequestAction(req.id, "REJECTED")}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LOG HISTORY TAB */}
        {tab === "logs" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>Audit Log History ({filteredLogs.length})</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input sm"
                  style={{ width: 220 }}
                  placeholder="Search user, task, project..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
                <select
                  className="input sm"
                  style={{ width: 170 }}
                  value={logActionFilter}
                  onChange={(e) => setLogActionFilter(e.target.value)}
                >
                  <option value="ALL">All Actions</option>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="empty-state">No log entries match your filter.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Project</th>
                      <th>Target / Details</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => {
                      const meta = ACTION_LABELS[log.action] || { label: log.action, tone: "badge-gray" };
                      return (
                        <tr key={log.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="activity-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                                {log.user.name[0]}
                              </div>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{log.user.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${meta.tone}`}>{meta.label}</span>
                          </td>
                          <td>{log.workspace?.name || "—"}</td>
                          <td>
                            {log.task?.title ? (
                              <span className="activity-task">{log.task.title}</span>
                            ) : log.details ? (
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                {Object.entries(log.details)
                                  .filter(([, v]) => v !== null && v !== "")
                                  .map(([k, v]) => `${k}: ${String(v)}`)
                                  .join(" · ") || "—"}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {tab === "feedback" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>
                User Project Feedback ({filteredFeedback.length})
              </h2>
              <select
                className="input sm"
                style={{ width: 180 }}
                value={fbCategoryFilter}
                onChange={(e) => setFbCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                <option value="GENERAL">General</option>
                <option value="UX_DESIGN">UX & Design</option>
                <option value="COLLABORATION">Collaboration</option>
                <option value="PERFORMANCE">Performance</option>
                <option value="FEATURE_REQUEST">Feature Request</option>
              </select>
            </div>

            {filteredFeedback.length === 0 ? (
              <div className="empty-state">No feedback received yet.</div>
            ) : (
              <div className="grid-2">
                {filteredFeedback.map((fb) => (
                  <div key={fb.id} className="feedback-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="feedback-stars">
                        {"★".repeat(fb.rating)}
                        <span style={{ color: "var(--text-muted)" }}>{"★".repeat(5 - fb.rating)}</span>
                      </div>
                      <span className="badge badge-blue">{fb.category.replace("_", " ")}</span>
                    </div>
                    <p style={{ fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 }}>{fb.message}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-secondary)" }}>
                      <span>
                        <strong style={{ color: "var(--text-primary)" }}>{fb.user.name}</strong>
                        {fb.workspace ? ` · ${fb.workspace.name}` : ""}
                      </span>
                      <span>{new Date(fb.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreate && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Create New Project</div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                  Automatically initializes a Main Board with TO DO, IN PROGRESS, and DONE columns.
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="field-label">Project Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. Cloud Platform v2"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    minLength={2}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="field-label">Description</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Goals, scope, or team overview..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                {createErr && <div className="alert alert-error">{createErr}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn btn-primary">
                  {creating ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

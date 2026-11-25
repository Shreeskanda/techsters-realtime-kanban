import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import { useAuthStore } from "../store/authStore";
import CollaborationWidgets from "../components/CollaborationWidgets";
import AssignMembersModal from "../components/AssignMembersModal";
import type { TaskModalTab } from "../components/TaskModal";
import type { AdminStats, AdminUserStatus, Workspace } from "../lib/api";

interface Props {
  onSelectWorkspace: (w: Workspace) => void;
  onSelectBoard: (
    boardId: string,
    workspaceId: string,
    boardName?: string,
    workspace?: Workspace,
    taskId?: string,
    initialTab?: TaskModalTab
  ) => void;
  onPendingCountChange?: (count: number) => void;
  onWorkspaceListChanged?: () => void;
  onDeletedWorkspace?: (workspaceId: string) => void;
}

type LobbyTab = "overview" | "users" | "requests" | "logs" | "feedback";

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  task_created: { label: "Created Task", tone: "badge-blue" },
  task_updated: { label: "Updated Task", tone: "badge-gray" },
  task_moved: { label: "Moved Task", tone: "badge-purple" },
  task_deleted: { label: "Deleted Task", tone: "badge-red" },
  comment_added: { label: "Commented", tone: "badge-blue" },
  task_memory_added: { label: "Added Task Memory", tone: "badge-blue" },
  blocker_created: { label: "Reported Blocker", tone: "badge-red" },
  blocker_acknowledged: { label: "Ack Blocker", tone: "badge-orange" },
  blocker_resolved: { label: "Resolved Blocker", tone: "badge-green" },
  blocker_updated: { label: "Updated Blocker", tone: "badge-orange" },
  handoff_created: { label: "Sent Handoff", tone: "badge-purple" },
  handoff_acknowledged: { label: "Ack Handoff", tone: "badge-green" },
  project_created: { label: "Created Project", tone: "badge-green" },
  member_invited: { label: "Invited Member", tone: "badge-green" },
  role_updated: { label: "Updated Role", tone: "badge-purple" },
  join_requested: { label: "Requested Join", tone: "badge-orange" },
  join_approved: { label: "Approved Join", tone: "badge-green" },
  join_rejected: { label: "Declined Join", tone: "badge-red" },
  feedback_submitted: { label: "Submitted Feedback", tone: "badge-orange" },
};

const PRESENCE_META: Record<
  AdminUserStatus["presenceStatus"],
  { label: string; badgeClass: string }
> = {
  ONLINE: { label: "Online Now", badgeClass: "badge-green" },
  RECENTLY_ACTIVE: { label: "Recently Active", badgeClass: "badge-blue" },
  OFFLINE: { label: "Offline", badgeClass: "badge-gray" },
  NEVER_LOGGED_IN: { label: "Never Logged In", badgeClass: "badge-orange" },
  DEACTIVATED: { label: "Deactivated", badgeClass: "badge-red" },
};

export default function AdminLobby({
  onSelectWorkspace,
  onSelectBoard,
  onPendingCountChange,
  onWorkspaceListChanged,
  onDeletedWorkspace,
}: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<LobbyTab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [users, setUsers] = useState<AdminUserStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign / Delete Modals
  const [assignProjectTarget, setAssignProjectTarget] = useState<Workspace | null>(null);
  const [assignUserTarget, setAssignUserTarget] = useState<AdminUserStatus | null>(null);
  const [assignUserWsId, setAssignUserWsId] = useState("");
  const [assignUserRole, setAssignUserRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [assignUserBusy, setAssignUserBusy] = useState(false);
  const [assignUserMsg, setAssignUserMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deletingWsId, setDeletingWsId] = useState<string | null>(null);

  // Filters
  const [logSearch, setLogSearch] = useState("");
  const [logActionFilter, setLogActionFilter] = useState("ALL");
  const [fbCategoryFilter, setFbCategoryFilter] = useState("ALL");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"ALL" | "ACTIVE" | "DEACTIVATED" | "ONLINE">("ALL");
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [userActionErr, setUserActionErr] = useState("");

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
      const [s, ws, usrList] = await Promise.all([
        api.admin.stats(),
        api.workspaces.list(),
        api.admin.users().catch(() => [] as AdminUserStatus[]),
      ]);
      setStats(s);
      setWorkspaces(ws);
      setUsers(usrList);
      onPendingCountChange?.(s.pendingRequests);
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30_000);
    return () => clearInterval(timer);
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
    socket.on("user_presence_changed", refresh);
    socket.on("user_status_changed", refresh);
    socket.on("blocker_created", refresh);
    socket.on("blocker_resolved", refresh);
    socket.on("handoff_created", refresh);
    socket.on("handoff_acknowledged", refresh);
    socket.on("workspace_deleted", refresh);
    socket.on("member_added", refresh);
    socket.on("member_removed", refresh);

    return () => {
      socket.off("join_request_received", refresh);
      socket.off("feedback_received", refresh);
      socket.off("task_created", refresh);
      socket.off("task_moved", refresh);
      socket.off("task_updated", refresh);
      socket.off("task_deleted", refresh);
      socket.off("new_comment", refresh);
      socket.off("user_presence_changed", refresh);
      socket.off("user_status_changed", refresh);
      socket.off("blocker_created", refresh);
      socket.off("blocker_resolved", refresh);
      socket.off("handoff_created", refresh);
      socket.off("handoff_acknowledged", refresh);
      socket.off("workspace_deleted", refresh);
      socket.off("member_added", refresh);
      socket.off("member_removed", refresh);
    };
  }, [loadData]);

  const handleToggleUserActivation = async (u: AdminUserStatus) => {
    setUserActionErr("");
    setTogglingUserId(u.id);
    try {
      if (u.isActive) {
        await api.admin.deactivateUser(u.id);
      } else {
        await api.admin.activateUser(u.id);
      }
      await loadData();
    } catch (err: unknown) {
      setUserActionErr(err instanceof Error ? err.message : "Failed to update user activation status");
    } finally {
      setTogglingUserId(null);
    }
  };

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
      onWorkspaceListChanged?.();
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (ws: Workspace) => {
    if (!confirm(`Delete project "${ws.name}" and all its boards/tasks permanently?`)) return;
    setDeletingWsId(ws.id);
    try {
      await api.workspaces.delete(ws.id);
      await loadData();
      onDeletedWorkspace?.(ws.id);
    } catch (err: unknown) {
      setUserActionErr(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingWsId(null);
    }
  };

  const openAssignUserModal = (u: AdminUserStatus) => {
    setAssignUserTarget(u);
    setAssignUserMsg(null);
    const availableWs = workspaces.find(
      (w) => !u.memberships.some((m) => m.workspace.id === w.id)
    );
    setAssignUserWsId(availableWs?.id || "");
    setAssignUserRole("MEMBER");
  };

  const handleAssignUserToProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserTarget || !assignUserWsId) return;
    setAssignUserBusy(true);
    setAssignUserMsg(null);
    try {
      await api.workspaces.inviteMember(assignUserWsId, {
        email: assignUserTarget.email,
        role: assignUserRole,
      });
      setAssignUserMsg({ ok: true, msg: `Assigned ${assignUserTarget.name} as ${assignUserRole}.` });
      await loadData();
      onWorkspaceListChanged?.();
    } catch (err: unknown) {
      setAssignUserMsg({
        ok: false,
        msg: err instanceof Error ? err.message : "Failed to assign project",
      });
    } finally {
      setAssignUserBusy(false);
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

  const filteredUsers = users.filter((u) => {
    const matchesText =
      !userSearch.trim() ||
      `${u.name} ${u.email} ${u.systemRole}`.toLowerCase().includes(userSearch.toLowerCase());
    if (!matchesText) return false;
    if (userFilter === "ACTIVE") return u.isActive;
    if (userFilter === "DEACTIVATED") return !u.isActive;
    if (userFilter === "ONLINE") return u.isOnline || u.presenceStatus === "RECENTLY_ACTIVE";
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Sub-Navigation Tabs */}
      <div className="tabs-bar">
        <button className={`tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
          Dashboard Overview
        </button>
        <button className={`tab-btn ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>
          Member &amp; User Activation
          <span className="tab-count">{users.length || stats.totalUsers}</span>
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
              Monitor project health pulses, member &amp; user activation statuses, silent blockers, handoffs, and organization workspaces.
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
            <div className="stat-sub">
              {stats.unresolvedBlockersCount ?? 0} open blockers · {stats.pendingHandoffsCount ?? 0} pending handoffs
            </div>
          </div>
          <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setTab("users")}>
            <div className="stat-label">Account Activation</div>
            <div className="stat-value" style={{ color: "var(--accent-green)" }}>
              {stats.activeUsersCount ?? stats.totalUsers}
              <span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500 }}> / {stats.totalUsers}</span>
            </div>
            <div className="stat-sub">
              {stats.onlineUsersCount ?? 0} online now · {stats.inactiveUsersCount ?? 0} deactivated
            </div>
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
            <div className="stat-sub">
              Feedback: {stats.avgRating !== null ? `${stats.avgRating} ★` : "—"} ({stats.feedbacks.length})
            </div>
          </div>
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Member & User Activation Status right on Admin Login */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 15.5, color: "var(--text-primary)" }}>
                    Member &amp; User Activation Status
                  </h2>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Live login presence and account activation state for all registered Admins and Members.
                  </p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setTab("users")}>
                  Manage All Users ({users.length}) →
                </button>
              </div>

              {userActionErr && <div className="alert alert-error" style={{ marginBottom: 12 }}>{userActionErr}</div>}

              {users.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No registered users found.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Account Status</th>
                        <th>Session Presence</th>
                        <th>Last Login</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.slice(0, 8).map((u) => {
                        const pres = PRESENCE_META[u.presenceStatus];
                        const isSelf = u.id === currentUser?.id;
                        return (
                          <tr key={u.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div className="activity-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>
                                  {u.name[0]}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.name}</div>
                                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`role-chip-${u.systemRole === "ADMIN" ? "ADMIN" : "MEMBER"}`}>
                                {u.systemRole}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${u.isActive ? "badge-green" : "badge-red"}`}>
                                {u.isActive ? "Active" : "Deactivated"}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${pres.badgeClass}`}>{pres.label}</span>
                            </td>
                            <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                              {u.lastLoginAt
                                ? new Date(u.lastLoginAt).toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Never"}
                            </td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {isSelf ? (
                                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Current Admin</span>
                              ) : (
                                <div style={{ display: "inline-flex", gap: 6 }}>
                                  {u.isActive && workspaces.length > 0 && (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => openAssignUserModal(u)}
                                    >
                                      Assign Project
                                    </button>
                                  )}
                                  <button
                                    className={`btn btn-sm ${u.isActive ? "btn-danger" : "btn-primary"}`}
                                    disabled={togglingUserId === u.id}
                                    onClick={() => handleToggleUserActivation(u)}
                                  >
                                    {togglingUserId === u.id
                                      ? "..."
                                      : u.isActive
                                        ? "Deactivate"
                                        : "Activate"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* TechSters 2.0 Signature Widgets (Project Health Pulse, Active Blockers, Pending Handoffs, Recent Memories) */}
            <CollaborationWidgets
              workspaces={workspaces}
              currentUserId={currentUser?.id || ""}
              onOpenBoard={(bId, wsId, bName, wsObj, taskId, tabName) =>
                onSelectBoard(bId, wsId, bName, wsObj, taskId, tabName as TaskModalTab | undefined)
              }
            />

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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border-subtle)", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {ws._count?.members ?? ws.members?.length ?? 0} members
                      </span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setAssignProjectTarget(ws)}
                        >
                          Assign Members
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => onSelectWorkspace(ws)}>
                          Manage
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={deletingWsId === ws.id}
                          onClick={() => handleDeleteProject(ws)}
                        >
                          {deletingWsId === ws.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick Previews: Pending Requests + Recent Log History */}
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

        {/* MEMBER & USER ACTIVATION TAB */}
        {tab === "users" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>
                  Member &amp; User Activation Console ({filteredUsers.length})
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Inspect member login timestamps, live online connections, and activate or deactivate platform access.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input sm"
                  style={{ width: 220 }}
                  placeholder="Search name, email, role..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                <select
                  className="input sm"
                  style={{ width: 160 }}
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value as typeof userFilter)}
                >
                  <option value="ALL">All Accounts</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="DEACTIVATED">Deactivated Only</option>
                  <option value="ONLINE">Online / Recently Active</option>
                </select>
              </div>
            </div>

            {userActionErr && <div className="alert alert-error" style={{ marginBottom: 14 }}>{userActionErr}</div>}

            {filteredUsers.length === 0 ? (
              <div className="empty-state">No users match your filter.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Member / User</th>
                      <th>Platform Role</th>
                      <th>Activation</th>
                      <th>Live Status</th>
                      <th>Workspaces</th>
                      <th>Last Login</th>
                      <th>Last Seen</th>
                      <th style={{ textAlign: "right" }}>Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const pres = PRESENCE_META[u.presenceStatus];
                      const isSelf = u.id === currentUser?.id;
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="activity-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                                {u.name[0]}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.name}</div>
                                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`role-chip-${u.systemRole === "ADMIN" ? "ADMIN" : "MEMBER"}`}>
                              {u.systemRole}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${u.isActive ? "badge-green" : "badge-red"}`}>
                              {u.isActive ? "Activated" : "Deactivated"}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${pres.badgeClass}`}>{pres.label}</span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {u.memberships.length === 0
                              ? "No projects yet"
                              : u.memberships.map((m) => `${m.workspace.name} (${m.role})`).join(", ")}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : "—"}
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {isSelf ? (
                              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>You</span>
                            ) : (
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                {u.isActive && workspaces.length > 0 && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => openAssignUserModal(u)}
                                  >
                                    Assign Project
                                  </button>
                                )}
                                <button
                                  className={`btn btn-sm ${u.isActive ? "btn-danger" : "btn-primary"}`}
                                  disabled={togglingUserId === u.id}
                                  onClick={() => handleToggleUserActivation(u)}
                                >
                                  {togglingUserId === u.id
                                    ? "..."
                                    : u.isActive
                                      ? "Deactivate"
                                      : "Activate"}
                                </button>
                              </div>
                            )}
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
      {/* Assign Members to Project Modal */}
      {assignProjectTarget && (
        <AssignMembersModal
          workspaceId={assignProjectTarget.id}
          workspaceName={assignProjectTarget.name}
          currentUserId={currentUser?.id || ""}
          onClose={() => setAssignProjectTarget(null)}
          onChanged={() => {
            loadData();
            onWorkspaceListChanged?.();
          }}
        />
      )}

      {/* Assign Specific User to Project Modal */}
      {assignUserTarget && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setAssignUserTarget(null); }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Assign Project to Member</div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3 }}>
                  {assignUserTarget.name} ({assignUserTarget.email})
                </div>
              </div>
              <button className="modal-close" onClick={() => setAssignUserTarget(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleAssignUserToProject}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {assignUserMsg && (
                  <div className={`alert ${assignUserMsg.ok ? "alert-success" : "alert-error"}`}>
                    {assignUserMsg.msg}
                  </div>
                )}
                <div>
                  <label className="field-label">Select Project *</label>
                  <select
                    className="input"
                    value={assignUserWsId}
                    onChange={(e) => setAssignUserWsId(e.target.value)}
                    required
                  >
                    {workspaces.map((w) => {
                      const existing = assignUserTarget.memberships.find((m) => m.workspace.id === w.id);
                      return (
                        <option key={w.id} value={w.id} disabled={!!existing}>
                          {w.name} {existing ? `(Already ${existing.role})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="field-label">Workspace Role</label>
                  <select
                    className="input"
                    value={assignUserRole}
                    onChange={(e) => setAssignUserRole(e.target.value as "ADMIN" | "MEMBER" | "VIEWER")}
                  >
                    <option value="MEMBER">MEMBER (Edit &amp; Collaborate)</option>
                    <option value="ADMIN">ADMIN (Manage Team &amp; Settings)</option>
                    <option value="VIEWER">VIEWER (Read-Only)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAssignUserTarget(null)}>
                  Close
                </button>
                <button type="submit" disabled={assignUserBusy || !assignUserWsId} className="btn btn-primary">
                  {assignUserBusy ? "Assigning..." : "Assign Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

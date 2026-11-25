import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import { useAuthStore } from "../store/authStore";
import JoinRequestModal from "../components/JoinRequestModal";
import CollaborationWidgets from "../components/CollaborationWidgets";
import AssignMembersModal from "../components/AssignMembersModal";
import type { TaskModalTab } from "../components/TaskModal";
import type { PublicWorkspace, Workspace, JoinRequest } from "../lib/api";

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
  onWorkspaceListChanged?: () => void;
  onDeletedWorkspace?: (workspaceId: string) => void;
}

type LobbyTab = "my-projects" | "pulse" | "directory" | "requests";

export default function MemberLobby({
  onSelectWorkspace,
  onSelectBoard,
  onWorkspaceListChanged,
  onDeletedWorkspace,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<LobbyTab>("my-projects");
  const [publicProjects, setPublicProjects] = useState<PublicWorkspace[]>([]);
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([]);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  // Create / Assign / Delete state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [assignTarget, setAssignTarget] = useState<Workspace | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Join Request Modal
  const [requestTarget, setRequestTarget] = useState<PublicWorkspace | null>(null);

  const loadLobby = useCallback(async () => {
    try {
      const [pub, mine, reqs] = await Promise.all([
        api.workspaces.listPublic(),
        api.workspaces.list(),
        api.joinRequests.myStatus().catch(() => [] as JoinRequest[]),
      ]);
      setPublicProjects(pub);
      setMyWorkspaces(mine);
      setMyRequests(reqs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLobby();
  }, [loadLobby]);

  useEffect(() => {
    const socket = connectSocket();
    const onApproved = () => {
      setNotice("Access approved! You can now enter the project.");
      loadLobby();
      setTimeout(() => setNotice(""), 5000);
    };
    const onRejected = () => {
      setNotice("A join request was declined by the project admin.");
      loadLobby();
      setTimeout(() => setNotice(""), 5000);
    };
    const onHandoff = () => {
      setNotice("You received a new task handoff! Check the Collaboration Pulse tab.");
      setTimeout(() => setNotice(""), 6000);
    };
    socket.on("join_request_approved", onApproved);
    socket.on("join_request_rejected", onRejected);
    socket.on("handoff_created", onHandoff);
    socket.on("workspace_deleted", loadLobby);
    socket.on("member_added", loadLobby);
    socket.on("member_removed", loadLobby);
    return () => {
      socket.off("join_request_approved", onApproved);
      socket.off("join_request_rejected", onRejected);
      socket.off("handoff_created", onHandoff);
      socket.off("workspace_deleted", loadLobby);
      socket.off("member_added", loadLobby);
      socket.off("member_removed", loadLobby);
    };
  }, [loadLobby]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateErr("");
    setCreating(true);
    try {
      const ws = await api.workspaces.create({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await loadLobby();
      onWorkspaceListChanged?.();
      onSelectWorkspace(ws);
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (ws: Workspace) => {
    if (!confirm(`Delete project "${ws.name}" and all its boards/tasks permanently?`)) return;
    setDeletingId(ws.id);
    try {
      await api.workspaces.delete(ws.id);
      await loadLobby();
      onDeletedWorkspace?.(ws.id);
      setNotice(`Deleted project "${ws.name}".`);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  };

  const myWsMap = new Map(myWorkspaces.map((w) => [w.id, w]));
  const reqMap = new Map(myRequests.map((r) => [r.workspace.id, r]));
  const pendingCount = myRequests.filter((r) => r.status === "PENDING").length;

  const handleProjectClick = (proj: PublicWorkspace) => {
    const existing = myWsMap.get(proj.id);
    if (existing) {
      if (existing.boards && existing.boards.length > 0) {
        onSelectBoard(existing.boards[0].id, existing.id, existing.boards[0].name, existing);
      } else {
        onSelectWorkspace(existing);
      }
      return;
    }
    const req = reqMap.get(proj.id);
    if (req?.status === "PENDING") {
      setNotice(`Your request to join "${proj.name}" is pending Admin approval.`);
      return;
    }
    setRequestTarget(proj);
  };

  const filteredMine = myWorkspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredPublic = publicProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="page" style={{ color: "var(--text-secondary)" }}>Loading member &amp; user lobby...</div>;
  }

  return (
    <div className="page">
      {notice && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <span>ℹ</span>
          <span>{notice}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Member &amp; User Lobby</h1>
          <p className="page-sub">
            Welcome, {user?.name} · Create projects, track Health Pulse &amp; Blockers, acknowledge handoffs, or request access.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input sm"
            style={{ width: 220 }}
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Project
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">My Projects</div>
          <div className="stat-value">{myWorkspaces.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Organization Directory</div>
          <div className="stat-value">{publicProjects.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Join Requests</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
      </div>

      {/* Lobby Tabs */}
      <div className="tabs-bar" style={{ marginBottom: 20, padding: 0, background: "transparent" }}>
        <button
          className={`tab-btn ${tab === "my-projects" ? "active" : ""}`}
          onClick={() => setTab("my-projects")}
        >
          My Projects ({myWorkspaces.length})
        </button>
        <button
          className={`tab-btn ${tab === "pulse" ? "active" : ""}`}
          onClick={() => setTab("pulse")}
        >
          Health, Blockers &amp; Handoffs
        </button>
        <button
          className={`tab-btn ${tab === "directory" ? "active" : ""}`}
          onClick={() => setTab("directory")}
        >
          Project Directory ({publicProjects.length})
        </button>
        <button
          className={`tab-btn ${tab === "requests" ? "active" : ""}`}
          onClick={() => setTab("requests")}
        >
          My Requests ({myRequests.length})
        </button>
      </div>

      {/* Tab 1: My Projects + inline widgets */}
      {tab === "my-projects" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {filteredMine.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "36px 24px" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                No projects yet
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
                Create your own project workspace or browse the Project Directory to request access.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  + Create First Project
                </button>
                <button className="btn btn-secondary" onClick={() => setTab("directory")}>
                  Browse Project Directory
                </button>
              </div>
            </div>
          ) : (
            <div className="grid-3">
              {filteredMine.map((ws) => {
                const role =
                  ws.members?.find((m) => m.userId === user?.id || m.user?.id === user?.id)?.role || "MEMBER";
                return (
                  <div key={ws.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div
                          style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}
                          onClick={() => onSelectWorkspace(ws)}
                        >
                          {ws.name}
                        </div>
                        {ws.description && (
                          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                            {ws.description}
                          </div>
                        )}
                      </div>
                      <span className={`role-chip-${role}`}>{role}</span>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {ws._count?.boards ?? ws.boards?.length ?? 0} boards ·{" "}
                      {ws._count?.members ?? ws.members?.length ?? 0} members
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
                      {ws.boards?.slice(0, 3).map((b) => (
                        <button
                          key={b.id}
                          onClick={() => onSelectBoard(b.id, ws.id, b.name, ws)}
                          className="btn btn-secondary btn-sm"
                          style={{ justifyContent: "space-between", width: "100%" }}
                        >
                          <span>{b.name}</span>
                          <span style={{ color: "var(--accent)" }}>Board →</span>
                        </button>
                      ))}
                      <button
                        onClick={() => onSelectWorkspace(ws)}
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: "center", width: "100%" }}
                      >
                        Manage Workspace
                      </button>
                      {role === "ADMIN" && (
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, justifyContent: "center" }}
                            onClick={() => setAssignTarget(ws)}
                          >
                            Assign Members
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={deletingId === ws.id}
                            onClick={() => handleDeleteProject(ws)}
                          >
                            {deletingId === ws.id ? "..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {myWorkspaces.length > 0 && (
            <CollaborationWidgets
              workspaces={myWorkspaces}
              currentUserId={user?.id || ""}
              onOpenBoard={(bId, wsId, bName, wsObj, taskId, tabName) =>
                onSelectBoard(bId, wsId, bName, wsObj, taskId, tabName as TaskModalTab | undefined)
              }
            />
          )}
        </div>
      )}

      {/* Tab 2: Dedicated Pulse & Collaboration Widgets */}
      {tab === "pulse" && (
        <CollaborationWidgets
          workspaces={myWorkspaces}
          currentUserId={user?.id || ""}
          onOpenBoard={(bId, wsId, bName, wsObj, taskId, tabName) =>
            onSelectBoard(bId, wsId, bName, wsObj, taskId, tabName as TaskModalTab | undefined)
          }
        />
      )}

      {/* Tab 3: Project Directory */}
      {tab === "directory" && (
        <>
          {filteredPublic.length === 0 ? (
            <div className="empty-state">No organization projects found yet. Create the first one!</div>
          ) : (
            <div className="grid-3">
              {filteredPublic.map((proj) => {
                const isMember = myWsMap.has(proj.id);
                const req = reqMap.get(proj.id);
                const isPending = req?.status === "PENDING";
                const isRejected = req?.status === "REJECTED";

                return (
                  <div
                    key={proj.id}
                    className="card"
                    style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" }}>
                          {proj.name}
                        </span>
                        {isMember ? (
                          <span className="badge badge-green">Joined</span>
                        ) : isPending ? (
                          <span className="badge badge-orange">Pending</span>
                        ) : isRejected ? (
                          <span className="badge badge-red">Declined</span>
                        ) : (
                          <span className="badge badge-gray">Restricted</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                        {proj.description || "Requires workspace invitation or admin approval"}
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: 10,
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {proj._count.members} members · {proj._count.boards} boards
                      </span>
                      {isMember ? (
                        <button className="btn btn-primary btn-sm" onClick={() => handleProjectClick(proj)}>
                          Enter →
                        </button>
                      ) : isPending ? (
                        <button className="btn btn-secondary btn-sm" disabled>
                          Request Sent ⏳
                        </button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleProjectClick(proj)}>
                          {isRejected ? "Re-request Access" : "Login / Request"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab 4: My Join Requests */}
      {tab === "requests" && (
        <>
          {myRequests.length === 0 ? (
            <div className="empty-state">You haven&apos;t sent any project join requests yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myRequests.map((req) => (
                <div
                  key={req.id}
                  className="card"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                      {req.workspace.name}
                    </div>
                    {req.message && (
                      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3 }}>
                        &ldquo;{req.message}&rdquo;
                      </div>
                    )}
                  </div>
                  <span
                    className={`badge ${
                      req.status === "APPROVED"
                        ? "badge-green"
                        : req.status === "REJECTED"
                          ? "badge-red"
                          : "badge-orange"
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Project Modal */}
      {showCreate && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">Create New Project</div>
              <button className="modal-close" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="field-label">Project Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Operations & Inventory"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Description (optional)</label>
                  <input
                    className="input"
                    placeholder="Department, scope, or team objective"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                {createErr && <div className="alert alert-error">{createErr}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">
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

      {/* Join Request Modal */}
      {requestTarget && (
        <JoinRequestModal
          project={requestTarget}
          onClose={() => setRequestTarget(null)}
          onSubmitted={(req) => {
            setMyRequests((prev) => [req, ...prev.filter((r) => r.workspace.id !== req.workspace.id)]);
            setNotice(`Join request sent to Admin for "${requestTarget.name}".`);
            setRequestTarget(null);
          }}
        />
      )}

      {/* Assign Members Modal */}
      {assignTarget && (
        <AssignMembersModal
          workspaceId={assignTarget.id}
          workspaceName={assignTarget.name}
          currentUserId={user?.id || ""}
          onClose={() => setAssignTarget(null)}
          onChanged={() => {
            loadLobby();
            onWorkspaceListChanged?.();
          }}
        />
      )}
    </div>
  );
}

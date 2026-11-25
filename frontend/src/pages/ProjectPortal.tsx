import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { useAuthStore } from "../store/authStore";
import JoinRequestModal from "../components/JoinRequestModal";
import AssignMembersModal from "../components/AssignMembersModal";
import type { PublicWorkspace, Workspace, JoinRequest } from "../lib/api";

interface Props {
  onEnterWorkspace: (workspace: Workspace) => void;
}

export default function ProjectPortal({ onEnterWorkspace }: Props) {
  const { user, logout, openFeedbackPrompt } = useAuthStore();
  const [publicProjects, setPublicProjects] = useState<PublicWorkspace[]>([]);
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([]);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestTarget, setRequestTarget] = useState<PublicWorkspace | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Workspace | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteProject = async (e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${ws.name}" permanently?`)) return;
    setDeletingId(ws.id);
    try {
      await api.workspaces.delete(ws.id);
      await loadPortal();
      setNotice(`Deleted project "${ws.name}".`);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreating(true);
    try {
      const ws = await api.workspaces.create({ name: newWsName.trim(), description: newWsDesc.trim() || undefined });
      setShowCreate(false);
      setNewWsName("");
      setNewWsDesc("");
      await loadPortal();
      onEnterWorkspace(ws);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const loadPortal = useCallback(async () => {
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
    loadPortal();
  }, [loadPortal]);

  // Live Socket.IO updates when Admin approves or rejects our join request
  useEffect(() => {
    const socket = connectSocket();
    const onApproved = ({ workspaceId }: { workspaceId: string }) => {
      setNotice("Access approved! You can now enter the project.");
      loadPortal();
      setTimeout(() => setNotice(""), 5000);
      void workspaceId;
    };
    const onRejected = () => {
      setNotice("A join request was declined by the project admin.");
      loadPortal();
      setTimeout(() => setNotice(""), 5000);
    };
    socket.on("join_request_approved", onApproved);
    socket.on("join_request_rejected", onRejected);
    return () => {
      socket.off("join_request_approved", onApproved);
      socket.off("join_request_rejected", onRejected);
    };
  }, [loadPortal]);

  const myWsMap = new Map(myWorkspaces.map((w) => [w.id, w]));
  const reqMap = new Map(myRequests.map((r) => [r.workspace.id, r]));

  const handleProjectClick = async (project: PublicWorkspace) => {
    const existing = myWsMap.get(project.id);
    if (existing) {
      onEnterWorkspace(existing);
      return;
    }
    const req = reqMap.get(project.id);
    if (req?.status === "PENDING") {
      setNotice(`Your request to join "${project.name}" is already pending Admin approval.`);
      return;
    }
    setRequestTarget(project);
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
  };

  const filteredPublic = publicProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>
      {/* Enterprise Topbar */}
      <header className="topbar" style={{ justifyContent: "space-between", padding: "0 28px", height: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="logo-mark">K</div>
          <div>
            <div className="logo-text">TechSters ERP · Project Portal</div>
            <div className="logo-sub">Create a Project or Select an Authorized Workspace</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="live-pill">
            <span className="live-dot" /> Live Sync
          </div>
          <button className="btn btn-secondary btn-sm" onClick={openFeedbackPrompt}>
            ★ Give Feedback
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", background: "var(--bg-elevated)", borderRadius: 999, border: "1px solid var(--border)" }}>
            <div className="user-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
              {user?.name?.[0] || "?"}
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{user?.name}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1080, width: "100%", margin: "0 auto", padding: "36px 24px" }}>
        {notice && (
          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            <span>ℹ</span>
            <span>{notice}</span>
          </div>
        )}

        <div className="page-header">
          <div>
            <h1 className="page-title" style={{ fontSize: 24 }}>
              Project Access Portal
            </h1>
            <p className="page-sub">
              Log into an authorized project workspace below, or click any restricted project to send a join request to the Admin.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 240 }}>
              <input
                className="input sm"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              + New Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading organization projects...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {/* Authorized Projects */}
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-secondary)" }}>
                  Authorized Projects ({myWorkspaces.length})
                </div>
              </div>

              {myWorkspaces.length === 0 ? (
                <div className="alert alert-warn" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span>⚠</span>
                    <div>
                      You haven&apos;t joined or created any projects yet. Click <strong>+ New Project</strong> to start one, or request access below.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid-3">
                  {myWorkspaces
                    .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
                    .map((ws) => {
                      const role = ws.members?.find((m) => m.userId === user?.id || m.user?.id === user?.id)?.role || "MEMBER";
                      return (
                        <div
                          key={ws.id}
                          className="card"
                          style={{
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 14,
                            borderColor: "rgba(88,166,255,0.28)",
                          }}
                          onClick={() => onEnterWorkspace(ws)}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{ws.name}</span>
                              <span className={`role-chip-${role}`}>{role}</span>
                            </div>
                            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                              {ws.description || "Collaborative engineering workspace"}
                            </p>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border-subtle)", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              {ws._count?.boards ?? ws.boards?.length ?? 0} boards · {ws._count?.members ?? ws.members?.length ?? 0} members
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {role === "ADMIN" && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAssignTarget(ws);
                                    }}
                                  >
                                    Assign
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    disabled={deletingId === ws.id}
                                    onClick={(e) => handleDeleteProject(e, ws)}
                                  >
                                    {deletingId === ws.id ? "..." : "Delete"}
                                  </button>
                                </>
                              )}
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent)" }}>
                                Enter →
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            {/* Full Project Directory */}
            <section>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-secondary)", marginBottom: 14 }}>
                All Organization Projects ({filteredPublic.length})
              </div>

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
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 14,
                        background: isMember ? "var(--bg-card)" : "var(--bg-elevated)",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" }}>
                            {proj.name}
                          </span>
                          {isMember ? (
                            <span className="badge badge-green">Invited</span>
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

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
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
            </section>
          </div>
        )}
      </main>

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
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Description (optional)</label>
                  <input
                    className="input"
                    placeholder="Department, scope, or team objective"
                    value={newWsDesc}
                    onChange={(e) => setNewWsDesc(e.target.value)}
                  />
                </div>
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

      {assignTarget && (
        <AssignMembersModal
          workspaceId={assignTarget.id}
          workspaceName={assignTarget.name}
          currentUserId={user?.id || ""}
          onClose={() => setAssignTarget(null)}
          onChanged={loadPortal}
        />
      )}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import CollaborationWidgets from "../components/CollaborationWidgets";
import type { TaskModalTab } from "../components/TaskModal";
import type { Workspace } from "../lib/api";

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
}

export default function Dashboard({ onSelectWorkspace, onSelectBoard }: Props) {
  const user = useAuthStore((s) => s.user);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.workspaces
      .list()
      .then(setWorkspaces)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const ws = await api.workspaces.create({ name: newWsName, description: newWsDesc });
      setWorkspaces((prev) => [ws, ...prev]);
      setShowCreate(false);
      setNewWsName("");
      setNewWsDesc("");
    } finally {
      setCreating(false);
    }
  };

  const totalBoards = workspaces.reduce((acc, w) => acc + (w._count?.boards ?? w.boards?.length ?? 0), 0);
  const totalMembers = workspaces.reduce((acc, w) => acc + (w._count?.members ?? w.members?.length ?? 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects &amp; Workspaces</h1>
          <p className="page-sub">Welcome back, {user?.name}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          + New Project
        </button>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Projects</div>
          <div className="stat-value">{workspaces.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Boards</div>
          <div className="stat-value">{totalBoards}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Memberships</div>
          <div className="stat-value">{totalMembers}</div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading projects...</div>
      ) : workspaces.length === 0 ? (
        <div className="empty-state">No projects found yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="grid-3">
            {workspaces.map((ws) => {
              const role = ws.members?.find((m) => m.userId === user?.id || m.user?.id === user?.id)?.role || "MEMBER";
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
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>{ws.description}</div>
                      )}
                    </div>
                    <span className={`role-chip-${role}`}>{role}</span>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {ws._count?.boards ?? ws.boards?.length ?? 0} boards · {ws._count?.members ?? ws.members?.length ?? 0} members
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {ws.boards?.slice(0, 3).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onSelectBoard(b.id, ws.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ justifyContent: "space-between", width: "100%" }}
                      >
                        <span>{b.name}</span>
                        <span style={{ color: "var(--accent)" }}>Board →</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <CollaborationWidgets
            workspaces={workspaces}
            currentUserId={user?.id || ""}
            onOpenBoard={(bId, wsId, bName, wsObj, taskId, tabName) =>
              onSelectBoard(bId, wsId, bName, wsObj, taskId, tabName as TaskModalTab | undefined)
            }
          />
        </div>
      )}

      {showCreate && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">Create New Project</div>
              <button className="modal-close" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="field-label">Project Name</label>
                  <input
                    className="input"
                    placeholder="My Team Project"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Description (optional)</label>
                  <input
                    className="input"
                    placeholder="Scope and team objective"
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
    </div>
  );
}

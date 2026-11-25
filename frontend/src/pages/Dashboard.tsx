import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import type { Workspace } from "../lib/api";

interface Props {
  onSelectWorkspace: (w: Workspace) => void;
  onSelectBoard: (boardId: string, workspaceId: string) => void;
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
    api.workspaces.list().then(setWorkspaces).finally(() => setLoading(false));
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Welcome back, {user?.name}!</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <span className="text-lg">+</span> New Workspace
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-slate-400 text-sm">Workspaces</p>
          <p className="text-3xl font-bold text-white mt-1">{workspaces.length}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Total Boards</p>
          <p className="text-3xl font-bold text-white mt-1">{totalBoards}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Team Members</p>
          <p className="text-3xl font-bold text-white mt-1">{totalMembers}</p>
        </div>
      </div>

      {/* Workspaces */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">Loading workspaces...</div>
      ) : workspaces.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          <p className="text-lg mb-2">No workspaces yet</p>
          <p className="text-sm">Create your first workspace to get started.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Your Workspaces</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <div key={ws.id} className="card hover:border-blue-600 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3
                      className="font-semibold text-white group-hover:text-blue-400 transition-colors"
                      onClick={() => onSelectWorkspace(ws)}
                    >
                      {ws.name}
                    </h3>
                    {ws.description && <p className="text-slate-400 text-xs mt-1">{ws.description}</p>}
                  </div>
                  <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded">
                    {ws.members?.find((m) => m.userId === user?.id)?.role || "MEMBER"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                  <span>📋 {ws._count?.boards ?? ws.boards?.length ?? 0} boards</span>
                  <span>👥 {ws._count?.members ?? ws.members?.length ?? 0} members</span>
                </div>
                {ws.boards?.length > 0 && (
                  <div className="space-y-1">
                    {ws.boards.slice(0, 3).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onSelectBoard(b.id, ws.id)}
                        className="w-full text-left px-3 py-1.5 bg-slate-900 hover:bg-blue-900/40 rounded-lg text-sm text-slate-300 hover:text-blue-300 transition-colors"
                      >
                        📌 {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Workspace Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Create Workspace</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Workspace Name</label>
                <input
                  className="input"
                  placeholder="My Team Workspace"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description (optional)</label>
                <input
                  className="input"
                  placeholder="What's this workspace for?"
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary flex-1">
                  {creating ? "Creating..." : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

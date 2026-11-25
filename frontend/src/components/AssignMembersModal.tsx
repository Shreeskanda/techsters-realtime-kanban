import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { AssignableUser } from "../lib/api";

interface Props {
  workspaceId: string;
  workspaceName: string;
  currentUserId: string;
  onClose: () => void;
  onChanged?: () => void;
}

export default function AssignMembersModal({
  workspaceId,
  workspaceName,
  currentUserId,
  onClose,
  onChanged,
}: Props) {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [manualEmail, setManualEmail] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadAssignable = useCallback(async () => {
    try {
      const list = await api.workspaces.assignableUsers(workspaceId);
      setUsers(list);
    } catch (err: unknown) {
      setStatusMsg({ ok: false, msg: err instanceof Error ? err.message : "Failed to load registered users" });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadAssignable();
  }, [loadAssignable]);

  const handleAssignUser = async (email: string, role: "ADMIN" | "MEMBER" | "VIEWER", uid: string) => {
    setBusyUserId(uid);
    setStatusMsg(null);
    try {
      await api.workspaces.inviteMember(workspaceId, { email, role });
      setStatusMsg({ ok: true, msg: `Assigned ${email} as ${role}.` });
      await loadAssignable();
      onChanged?.();
    } catch (err: unknown) {
      setStatusMsg({ ok: false, msg: err instanceof Error ? err.message : "Assignment failed" });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.trim()) return;
    await handleAssignUser(manualEmail.trim(), selectedRole, "manual");
    setManualEmail("");
  };

  const handleRoleChange = async (userId: string, role: "ADMIN" | "MEMBER" | "VIEWER") => {
    setBusyUserId(userId);
    setStatusMsg(null);
    try {
      await api.workspaces.updateMemberRole(workspaceId, userId, role);
      setStatusMsg({ ok: true, msg: `Updated member role to ${role}.` });
      await loadAssignable();
      onChanged?.();
    } catch (err: unknown) {
      setStatusMsg({ ok: false, msg: err instanceof Error ? err.message : "Role update failed" });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (u: AssignableUser) => {
    if (!confirm(`Remove ${u.name} from "${workspaceName}"?`)) return;
    setBusyUserId(u.id);
    setStatusMsg(null);
    try {
      await api.workspaces.removeMember(workspaceId, u.id);
      setStatusMsg({ ok: true, msg: `Removed ${u.name} from project.` });
      await loadAssignable();
      onChanged?.();
    } catch (err: unknown) {
      setStatusMsg({ ok: false, msg: err instanceof Error ? err.message : "Removal failed" });
    } finally {
      setBusyUserId(null);
    }
  };

  const q = search.toLowerCase().trim();
  const filtered = users.filter(
    (u) => !q || `${u.name} ${u.email} ${u.systemRole}`.toLowerCase().includes(q)
  );
  const unassigned = filtered.filter((u) => !u.currentRole);
  const assigned = filtered.filter((u) => !!u.currentRole);

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-lg" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Assign Project to Members</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3 }}>
              Project: <strong style={{ color: "var(--text-primary)" }}>{workspaceName}</strong>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {statusMsg && (
            <div className={`alert ${statusMsg.ok ? "alert-success" : "alert-error"}`}>
              {statusMsg.msg}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input sm"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="Search active users by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Assign as:</span>
              <select
                className="input sm"
                style={{ width: 115 }}
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as "ADMIN" | "MEMBER" | "VIEWER")}
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading active members...</div>
          ) : (
            <>
              {/* Active Registered Users Available to Assign */}
              <div>
                <div className="stat-label" style={{ marginBottom: 8 }}>
                  Available Active Accounts ({unassigned.length})
                </div>
                {unassigned.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" }}>
                    All active registered accounts are already assigned to this project (or none match your search).
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 190, overflowY: "auto" }}>
                    {unassigned.map((u) => (
                      <div key={u.id} className="join-row" style={{ padding: "8px 12px", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div className="activity-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                            {u.name[0]}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                              {u.name} <span className={`role-chip-${u.systemRole}`}>{u.systemRole}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{u.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyUserId === u.id}
                          onClick={() => handleAssignUser(u.email, selectedRole, u.id)}
                        >
                          {busyUserId === u.id ? "..." : `+ Assign (${selectedRole})`}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign by Email Fallback */}
              <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input sm"
                  style={{ flex: 1, minWidth: 200 }}
                  type="email"
                  placeholder="Or assign by exact account email..."
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                />
                <button type="submit" disabled={busyUserId === "manual"} className="btn btn-secondary btn-sm">
                  {busyUserId === "manual" ? "..." : "Assign by Email"}
                </button>
              </form>

              {/* Currently Assigned Project Members */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
                <div className="stat-label" style={{ marginBottom: 8 }}>
                  Currently Assigned ({assigned.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                  {assigned.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <div key={u.id} className="join-row" style={{ padding: "8px 12px", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {u.name} {isSelf && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{u.email}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isSelf ? (
                            <span className={`role-chip-${u.currentRole || "ADMIN"}`}>{u.currentRole}</span>
                          ) : (
                            <>
                              <select
                                className="input sm"
                                style={{ width: 105 }}
                                value={u.currentRole || "MEMBER"}
                                disabled={busyUserId === u.id}
                                onChange={(e) =>
                                  handleRoleChange(u.id, e.target.value as "ADMIN" | "MEMBER" | "VIEWER")
                                }
                              >
                                <option value="ADMIN">ADMIN</option>
                                <option value="MEMBER">MEMBER</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busyUserId === u.id}
                                onClick={() => handleRemove(u)}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

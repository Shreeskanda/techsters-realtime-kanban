import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import HealthPulse from "./HealthPulse";
import type { Workspace, TaskBlocker, TaskHandoff, TaskMemoryEntry } from "../lib/api";

interface Props {
  workspaces: Workspace[];
  currentUserId: string;
  onOpenBoard: (boardId: string, workspaceId: string, boardName?: string, workspace?: Workspace, taskId?: string, initialTab?: string) => void;
}

const BLOCKER_LABELS: Record<string, string> = {
  STUCK: "I am stuck",
  TECHNICAL_ASSISTANCE: "Need technical assistance",
  WAITING_FOR_PERSON: "Waiting for another person",
  UNCLEAR_REQUIREMENTS: "Requirements unclear",
  NEEDS_RESOURCES: "Need additional resources",
};

export function formatDurationSince(isoDate: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(isoDate).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export default function CollaborationWidgets({ workspaces, currentUserId, onOpenBoard }: Props) {
  const [selectedWsId, setSelectedWsId] = useState<string>(workspaces[0]?.id || "");
  const [activeBlockers, setActiveBlockers] = useState<TaskBlocker[]>([]);
  const [pendingHandoffs, setPendingHandoffs] = useState<TaskHandoff[]>([]);
  const [recentMemories, setRecentMemories] = useState<TaskMemoryEntry[]>([]);
  const [expandedMemoryHandoffId, setExpandedMemoryHandoffId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedWsId && workspaces[0]?.id) {
      setSelectedWsId(workspaces[0].id);
    }
  }, [workspaces, selectedWsId]);

  const loadPulseData = useCallback(async () => {
    try {
      const [blockers, handoffs, memories] = await Promise.all([
        api.blockers.listActive().catch(() => [] as TaskBlocker[]),
        api.handoffs.listPending().catch(() => [] as TaskHandoff[]),
        api.memory.recent().catch(() => [] as TaskMemoryEntry[]),
      ]);
      setActiveBlockers(blockers);
      setPendingHandoffs(handoffs);
      setRecentMemories(memories);
    } catch (err) {
      console.error("Failed to load collaboration widgets:", err);
    }
  }, []);

  useEffect(() => {
    loadPulseData();
  }, [loadPulseData]);

  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => loadPulseData();

    socket.on("blocker_created", refresh);
    socket.on("blocker_updated", refresh);
    socket.on("blocker_resolved", refresh);
    socket.on("handoff_created", refresh);
    socket.on("handoff_acknowledged", refresh);
    socket.on("task_memory_updated", refresh);

    return () => {
      socket.off("blocker_created", refresh);
      socket.off("blocker_updated", refresh);
      socket.off("blocker_resolved", refresh);
      socket.off("handoff_created", refresh);
      socket.off("handoff_acknowledged", refresh);
      socket.off("task_memory_updated", refresh);
    };
  }, [loadPulseData]);

  const selectedWs = workspaces.find((w) => w.id === selectedWsId) || workspaces[0];
  const selectedWsRole =
    selectedWs?.members?.find((m) => m.userId === currentUserId || m.user?.id === currentUserId)?.role || "MEMBER";

  const handleQuickBlockerAction = async (b: TaskBlocker, status: "ACKNOWLEDGED" | "RESOLVED") => {
    setBusyId(b.id);
    try {
      await api.blockers.update(b.id, { status });
      await loadPulseData();
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickAck = async (handoffId: string) => {
    setBusyId(handoffId);
    try {
      await api.handoffs.acknowledge(handoffId);
      await loadPulseData();
    } finally {
      setBusyId(null);
    }
  };

  const openTaskFromWorkspace = (workspaceId?: string, boardId?: string, taskId?: string, tab?: string) => {
    if (!workspaceId) return;
    const ws = workspaces.find((w) => w.id === workspaceId);
    const targetBoardId = boardId || ws?.boards?.[0]?.id;
    const boardName = ws?.boards?.find((b) => b.id === targetBoardId)?.name || ws?.boards?.[0]?.name || "Board";
    if (targetBoardId) {
      onOpenBoard(targetBoardId, workspaceId, boardName, ws, taskId, tab);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Project Health Pulse */}
      {workspaces.length > 0 && selectedWs && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>Project Health Pulse</h2>
            {workspaces.length > 1 && (
              <select
                className="input sm"
                style={{ width: 240 }}
                value={selectedWs.id}
                onChange={(e) => setSelectedWsId(e.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <HealthPulse workspaceId={selectedWs.id} canSnapshot={selectedWsRole === "ADMIN"} />
        </div>
      )}

      {/* 2. Active Blockers + 3. My Pending Handoffs */}
      <div className="grid-2">
        {/* Active Blockers */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 14.5, color: "var(--text-primary)" }}>Active Blockers (Silent Radar)</h3>
              <span className={`badge ${activeBlockers.length > 0 ? "badge-red" : "badge-green"}`}>
                {activeBlockers.length}
              </span>
            </div>
          </div>

          {activeBlockers.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "12px 0" }}>
              No unresolved blockers reported in your authorized workspaces.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeBlockers.slice(0, 6).map((b) => {
                const sevClass =
                  b.severity === "CRITICAL"
                    ? "badge-red"
                    : b.severity === "HIGH"
                      ? "badge-orange"
                      : b.severity === "MEDIUM"
                        ? "badge-purple"
                        : "badge-gray";
                return (
                  <div
                    key={b.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className={`badge ${sevClass}`}>{b.severity}</span>
                        <span className="badge badge-blue">{BLOCKER_LABELS[b.type] || b.type}</span>
                        <span className="badge badge-gray">{b.status}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--accent-orange)", fontWeight: 600 }}>
                        ⏱ Open {formatDurationSince(b.createdAt)}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {b.task?.title || "Task"}
                      {b.workspace && (
                        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {b.workspace.name}</span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {b.isPrivateRedacted
                        ? "🔒 Private explanation restricted to workspace administrators."
                        : b.explanation || "No additional explanation provided."}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Reporter: {b.reporter?.name || "Member"} · Privacy: {b.privacy.replace(/_/g, " ")}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {b.canAcknowledge && b.status === "OPEN" && (
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={busyId === b.id}
                            onClick={() => handleQuickBlockerAction(b, "ACKNOWLEDGED")}
                          >
                            Acknowledge
                          </button>
                        )}
                        {b.canResolve && (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busyId === b.id}
                            onClick={() => handleQuickBlockerAction(b, "RESOLVED")}
                          >
                            Resolve
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            openTaskFromWorkspace(b.workspaceId, b.task?.column?.boardId, b.taskId, "blockers")
                          }
                        >
                          Open →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* My Pending Handoffs */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 14.5, color: "var(--text-primary)" }}>My Pending Handoffs</h3>
              {pendingHandoffs.length > 0 && (
                <span className="badge badge-purple">{pendingHandoffs.length} Unread</span>
              )}
            </div>
          </div>

          {pendingHandoffs.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "12px 0" }}>
              You have no pending task handoffs waiting for acknowledgment.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendingHandoffs.map((h) => {
                const memOpen = expandedMemoryHandoffId === h.id;
                const memories = h.task?.memoryEntries || [];
                return (
                  <div
                    key={h.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid rgba(188,140,255,0.35)",
                      borderRadius: 8,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span className="badge badge-purple">Unread Handoff from {h.fromUser.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
                      {h.task?.title || "Task"}
                      {h.workspace && (
                        <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)" }}> · {h.workspace.name}</span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      <strong style={{ color: "var(--accent)" }}>First step:</strong> {h.firstStepRecommended}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      <strong style={{ color: "var(--text-primary)" }}>Remaining:</strong> {h.remainingWork}
                    </div>

                    {memOpen && (
                      <div
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 12,
                        }}
                      >
                        <div className="stat-label" style={{ marginBottom: 6 }}>
                          Task Memory Capsule ({memories.length} entries)
                        </div>
                        {memories.length === 0 ? (
                          <div style={{ color: "var(--text-muted)" }}>No memory entries recorded yet on this task.</div>
                        ) : (
                          memories.slice(0, 2).map((m) => (
                            <div key={m.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--border-subtle)" }}>
                              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                {m.author.name} · {new Date(m.createdAt).toLocaleString()}
                              </div>
                              {m.technicalDecisions && <div>Decisions: {m.technicalDecisions}</div>}
                              {m.nextRecommendedAction && <div>Next: {m.nextRecommendedAction}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busyId === h.id}
                        onClick={() => handleQuickAck(h.id)}
                      >
                        {busyId === h.id ? "..." : "✓ Acknowledge Handoff"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setExpandedMemoryHandoffId(memOpen ? null : h.id)}
                      >
                        {memOpen ? "Hide Memory Capsule" : "View Memory Capsule"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          openTaskFromWorkspace(
                            h.workspaceId,
                            h.task?.column?.boardId || h.workspace?.boards?.[0]?.id,
                            h.taskId,
                            "handoffs"
                          )
                        }
                      >
                        Open Task →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Recently Updated Task Memories */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14.5, color: "var(--text-primary)" }}>
            Recently Updated Task Memories ({recentMemories.length})
          </h3>
        </div>

        {recentMemories.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            No Task Memory Capsule entries recorded yet. Open any task &rarr; Memory tab to preserve decisions and context.
          </div>
        ) : (
          <div className="grid-3">
            {recentMemories.slice(0, 6).map((m) => (
              <div
                key={m.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                    {m.task?.title || "Task"}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--accent)" }}>
                  {m.workspace?.name || "Workspace"} · by {m.author.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  {m.nextRecommendedAction ||
                    m.technicalDecisions ||
                    m.workCompleted ||
                    m.originalProblem ||
                    m.expectedOutcome}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: "flex-start", paddingLeft: 0 }}
                  onClick={() =>
                    openTaskFromWorkspace(
                      m.workspaceId,
                      m.workspace?.boards?.[0]?.id,
                      m.taskId,
                      "memory"
                    )
                  }
                >
                  Open Memory Capsule →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

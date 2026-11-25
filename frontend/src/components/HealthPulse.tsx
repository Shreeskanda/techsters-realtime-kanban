import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { WorkspaceHealthReport, ProjectHealthSnapshot } from "../lib/api";

interface Props {
  workspaceId: string;
  canSnapshot?: boolean;
  compact?: boolean;
}

export default function HealthPulse({ workspaceId, canSnapshot = false, compact = false }: Props) {
  const [report, setReport] = useState<WorkspaceHealthReport | null>(null);
  const [history, setHistory] = useState<ProjectHealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);

  const loadHealth = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([
        api.health.get(workspaceId),
        api.health.history(workspaceId, 10),
      ]);
      setReport(r);
      setHistory(h);
    } catch (err) {
      console.error("Failed to load health pulse:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    const socket = connectSocket();
    const onHealthUpdated = ({ workspaceId: wsId, health }: { workspaceId: string; health?: WorkspaceHealthReport }) => {
      if (wsId === workspaceId) {
        if (health) setReport(health);
        api.health.history(workspaceId, 10).then(setHistory).catch(() => {});
      }
    };
    const refresh = (payload?: { workspaceId?: string }) => {
      if (!payload?.workspaceId || payload.workspaceId === workspaceId) {
        loadHealth();
      }
    };

    socket.on("project_health_updated", onHealthUpdated);
    socket.on("blocker_created", refresh);
    socket.on("blocker_resolved", refresh);
    socket.on("task_created", refresh);
    socket.on("task_moved", refresh);
    socket.on("task_deleted", refresh);

    return () => {
      socket.off("project_health_updated", onHealthUpdated);
      socket.off("blocker_created", refresh);
      socket.off("blocker_resolved", refresh);
      socket.off("task_created", refresh);
      socket.off("task_moved", refresh);
      socket.off("task_deleted", refresh);
    };
  }, [workspaceId, loadHealth]);

  const handleSnapshot = async () => {
    setRecording(true);
    try {
      const updated = await api.health.snapshot(workspaceId);
      setReport(updated);
      const h = await api.health.history(workspaceId, 10);
      setHistory(h);
    } finally {
      setRecording(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        Calculating Project Health Pulse...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="card" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        Unable to load project health metrics.
      </div>
    );
  }

  const scoreColor =
    report.score >= 80
      ? "var(--accent-green)"
      : report.score >= 60
        ? "var(--accent-orange)"
        : "var(--accent-red)";

  const statusBadgeClass =
    report.status === "HEALTHY"
      ? "badge-green"
      : report.status === "AT_RISK"
        ? "badge-orange"
        : "badge-red";

  const total = report.indicators.totalTasks;
  const completedPct = total > 0 ? Math.round((report.indicators.completedTasks / total) * 100) : 0;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 15.5, color: "var(--text-primary)" }}>Project Health Pulse</h3>
            <span className={`badge ${statusBadgeClass}`}>{report.status.replace("_", " ")}</span>
            {report.deltaFromLastSnapshot !== null && report.deltaFromLastSnapshot !== 0 && (
              <span
                className={`badge ${report.deltaFromLastSnapshot > 0 ? "badge-green" : "badge-red"}`}
                title="Change since previous snapshot"
              >
                {report.deltaFromLastSnapshot > 0
                  ? `+${report.deltaFromLastSnapshot}`
                  : report.deltaFromLastSnapshot}{" "}
                pts
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
            Deterministic workspace health analysis for <strong>{report.workspaceName}</strong> · Non-punitive project telemetry
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              background: "var(--bg-surface)",
              border: `1px solid ${scoreColor}`,
              borderRadius: 10,
              padding: "6px 14px",
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 800, color: scoreColor }}>{report.score}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>/ 100</span>
          </div>
          {canSnapshot && (
            <button onClick={handleSnapshot} disabled={recording} className="btn btn-secondary btn-sm">
              {recording ? "Saving..." : "Save Snapshot"}
            </button>
          )}
        </div>
      </div>

      {/* Deterministic Risk Indicators */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 10 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
          <div className="stat-label">Completed</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)", marginTop: 4 }}>
            {report.indicators.completedTasks}/{total} ({completedPct}%)
          </div>
          <div className="stat-sub">{report.indicators.pendingTasks} pending</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
          <div className="stat-label">Unresolved Blockers</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: report.indicators.unresolvedBlockers > 0 ? "var(--accent-red)" : "var(--text-primary)",
              marginTop: 4,
            }}
          >
            {report.indicators.unresolvedBlockers}
          </div>
          <div className="stat-sub">
            {report.indicators.blockersBySeverity.CRITICAL > 0
              ? `${report.indicators.blockersBySeverity.CRITICAL} critical`
              : `${report.indicators.blockersBySeverity.HIGH} high`}
          </div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
          <div className="stat-label">Overdue Tasks</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: report.indicators.overdueCount > 0 ? "var(--accent-orange)" : "var(--text-primary)",
              marginTop: 4,
            }}
          >
            {report.indicators.overdueCount}
          </div>
          <div className="stat-sub">Past due date</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
          <div className="stat-label">Stale Tasks</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: report.indicators.staleTasksCount > 0 ? "var(--accent-orange)" : "var(--text-primary)",
              marginTop: 4,
            }}
          >
            {report.indicators.staleTasksCount}
          </div>
          <div className="stat-sub">&gt;{report.aging.staleThresholdDays}d without update</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
          <div className="stat-label">Waiting Review</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-purple)", marginTop: 4 }}>
            {report.indicators.reviewWaitingCount}
          </div>
          <div className="stat-sub">Queued in Review/QA</div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
          <div className="stat-label">Exceeded Estimate</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: report.indicators.exceededTimeCount > 0 ? "var(--accent-red)" : "var(--text-primary)",
              marginTop: 4,
            }}
          >
            {report.indicators.exceededTimeCount}
          </div>
          <div className="stat-sub">Avg age: {report.aging.avgPendingAgeDays}d</div>
        </div>
      </div>

      {/* Warning Explanations */}
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>
          Diagnostic Warnings &amp; Explanations ({report.warnings.length})
        </div>
        {report.warnings.length === 0 ? (
          <div className="alert alert-success" style={{ padding: "10px 12px" }}>
            <span>✓</span>
            <span>All measured project indicators look healthy — zero active schedule or blocker penalties.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.warnings.map((w) => {
              const cls =
                w.severity === "CRITICAL"
                  ? "alert-error"
                  : w.severity === "HIGH" || w.severity === "MEDIUM"
                    ? "alert-warn"
                    : "alert-info";
              return (
                <div key={w.code} className={`alert ${cls}`} style={{ padding: "10px 12px", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{w.title}</div>
                    <div style={{ fontSize: 12, marginTop: 2, opacity: 0.92 }}>{w.explanation}</div>
                  </div>
                  <span className="badge badge-gray" style={{ flexShrink: 0 }}>-{w.penalty} pts</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weekly Summary + Aging + History */}
      {!compact && (
        <div className="grid-2" style={{ gap: 14 }}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>7-Day Weekly Progress Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
              <div>Tasks Created: <strong style={{ color: "var(--text-primary)" }}>{report.weeklySummary.tasksCreated}</strong></div>
              <div>Tasks Completed: <strong style={{ color: "var(--accent-green)" }}>{report.weeklySummary.tasksCompleted}</strong></div>
              <div>Memories Captured: <strong style={{ color: "var(--accent)" }}>{report.weeklySummary.memoriesAdded}</strong></div>
              <div>Handoffs Logged: <strong style={{ color: "var(--accent-purple)" }}>{report.weeklySummary.handoffsCreated}</strong></div>
              <div>Blockers Resolved: <strong style={{ color: "var(--accent-green)" }}>{report.weeklySummary.blockersResolved}</strong></div>
              <div>Max Pending Age: <strong style={{ color: "var(--text-primary)" }}>{report.aging.maxPendingAgeDays}d</strong></div>
            </div>

            {report.aging.agingTasks.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                <div className="stat-label" style={{ marginBottom: 6 }}>Task Aging Indicators</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {report.aging.agingTasks.slice(0, 3).map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, gap: 8 }}>
                      <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title} <span style={{ color: "var(--text-muted)" }}>({t.columnName})</span>
                      </span>
                      <span style={{ color: t.staleDays > report.aging.staleThresholdDays ? "var(--accent-orange)" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {t.staleDays}d idle · {t.ageDays}d old
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>Historical Health Trend ({history.length})</div>
            {history.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Historical health snapshots appear automatically as tasks and blockers change.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64, paddingTop: 6 }}>
                  {history.map((snap) => {
                    const barColor =
                      snap.score >= 80
                        ? "var(--accent-green)"
                        : snap.score >= 60
                          ? "var(--accent-orange)"
                          : "var(--accent-red)";
                    return (
                      <div
                        key={snap.id}
                        title={`${snap.score}/100 on ${new Date(snap.createdAt).toLocaleString()} (${snap.unresolvedBlockers} blockers)`}
                        style={{
                          flex: 1,
                          minWidth: 12,
                          height: `${Math.max(12, snap.score)}%`,
                          background: barColor,
                          borderRadius: "4px 4px 2px 2px",
                          opacity: 0.88,
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                  <span>Oldest: {history[0].score} pts</span>
                  <span>Latest: {history[history.length - 1].score} pts</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

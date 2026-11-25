import { prisma } from "./prisma";
import { getIO } from "./io";

export interface HealthWarning {
  code: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  explanation: string;
  count: number;
  penalty: number;
}

export interface AgingTaskSummary {
  id: string;
  title: string;
  columnName: string;
  priority: string;
  ageDays: number;
  staleDays: number;
}

export interface WorkspaceHealthReport {
  workspaceId: string;
  workspaceName: string;
  score: number;
  status: "HEALTHY" | "AT_RISK" | "CRITICAL";
  deltaFromLastSnapshot: number | null;
  indicators: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    overdueCount: number;
    unresolvedBlockers: number;
    blockersBySeverity: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
    };
    staleTasksCount: number;
    reviewWaitingCount: number;
    exceededTimeCount: number;
  };
  aging: {
    avgPendingAgeDays: number;
    maxPendingAgeDays: number;
    staleThresholdDays: number;
    agingTasks: AgingTaskSummary[];
  };
  weeklySummary: {
    tasksCreated: number;
    tasksCompleted: number;
    memoriesAdded: number;
    handoffsCreated: number;
    blockersResolved: number;
  };
  warnings: HealthWarning[];
  calculatedAt: string;
}

const STALE_DAYS_THRESHOLD = 5;

function isDoneColumn(name: string): boolean {
  return /^(done|completed|complete|closed|resolved|shipped)$/i.test(name.trim()) || /\b(done|completed)\b/i.test(name);
}

function isReviewColumn(name: string): boolean {
  return /\b(review|qa|testing|test|verify|approval|hold)\b/i.test(name);
}

/**
 * Deterministic Project Health Pulse engine.
 * Calculates score, risk indicators, aging metrics, weekly velocity, and plain-language warnings
 * purely from persisted PostgreSQL records (never ranks or penalizes individual team members).
 */
export async function computeWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealthReport | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) return null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleCutoffMs = STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;

  const [tasks, unresolvedBlockerRows, memoriesAdded, handoffsCreated, blockersResolved, latestSnapshot] =
    await Promise.all([
      prisma.task.findMany({
        where: { column: { board: { workspaceId } } },
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          expectedHours: true,
          createdAt: true,
          updatedAt: true,
          column: { select: { name: true } },
        },
      }),
      prisma.taskBlocker.findMany({
        where: { workspaceId, status: { not: "RESOLVED" } },
        select: { id: true, severity: true },
      }),
      prisma.taskMemoryEntry.count({
        where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.taskHandoff.count({
        where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.taskBlocker.count({
        where: { workspaceId, status: "RESOLVED", resolvedAt: { gte: sevenDaysAgo } },
      }),
      prisma.projectHealthSnapshot.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  let completedTasks = 0;
  let pendingTasks = 0;
  let overdueCount = 0;
  let staleTasksCount = 0;
  let reviewWaitingCount = 0;
  let exceededTimeCount = 0;
  let tasksCreatedThisWeek = 0;
  let tasksCompletedThisWeek = 0;

  const agingCandidates: AgingTaskSummary[] = [];
  let pendingAgeSum = 0;
  let maxPendingAgeDays = 0;

  for (const t of tasks) {
    const colName = t.column?.name || "";
    const done = isDoneColumn(colName);
    if (t.createdAt >= sevenDaysAgo) tasksCreatedThisWeek++;

    if (done) {
      completedTasks++;
      if (t.updatedAt >= sevenDaysAgo) tasksCompletedThisWeek++;
      continue;
    }

    pendingTasks++;
    const ageDays = Number(((now.getTime() - t.createdAt.getTime()) / 86400000).toFixed(1));
    const staleMs = now.getTime() - t.updatedAt.getTime();
    const staleDays = Number((staleMs / 86400000).toFixed(1));
    const elapsedHours = (now.getTime() - t.createdAt.getTime()) / 3600000;

    pendingAgeSum += ageDays;
    if (ageDays > maxPendingAgeDays) maxPendingAgeDays = ageDays;

    if (t.dueDate && t.dueDate < now) {
      overdueCount++;
    }
    if (staleMs > staleCutoffMs) {
      staleTasksCount++;
    }
    if (isReviewColumn(colName)) {
      reviewWaitingCount++;
    }
    if (t.expectedHours !== null && t.expectedHours !== undefined && elapsedHours > t.expectedHours) {
      exceededTimeCount++;
    }

    agingCandidates.push({
      id: t.id,
      title: t.title,
      columnName: colName,
      priority: t.priority,
      ageDays,
      staleDays,
    });
  }

  agingCandidates.sort((a, b) => b.staleDays - a.staleDays || b.ageDays - a.ageDays);

  const blockersBySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const b of unresolvedBlockerRows) {
    if (b.severity in blockersBySeverity) {
      blockersBySeverity[b.severity as keyof typeof blockersBySeverity]++;
    }
  }
  const unresolvedBlockers = unresolvedBlockerRows.length;

  const warnings: HealthWarning[] = [];
  let totalPenalty = 0;

  // Deterministic, explainable deductions
  if (overdueCount > 0) {
    const penalty = Math.min(30, overdueCount * 8);
    totalPenalty += penalty;
    warnings.push({
      code: "OVERDUE_TASKS",
      severity: overdueCount >= 3 ? "CRITICAL" : "HIGH",
      title: `${overdueCount} Overdue Task${overdueCount > 1 ? "s" : ""}`,
      explanation: `${overdueCount} pending task${overdueCount > 1 ? "s have" : " has"} passed ${overdueCount > 1 ? "their" : "its"} target due date, increasing delivery schedule risk (-${penalty} pts).`,
      count: overdueCount,
      penalty,
    });
  }

  if (unresolvedBlockers > 0) {
    const rawBlockerPenalty =
      blockersBySeverity.CRITICAL * 15 +
      blockersBySeverity.HIGH * 10 +
      blockersBySeverity.MEDIUM * 5 +
      blockersBySeverity.LOW * 2;
    const penalty = Math.min(45, rawBlockerPenalty);
    totalPenalty += penalty;
    const sevSummary = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
      .filter((s) => blockersBySeverity[s] > 0)
      .map((s) => `${blockersBySeverity[s]} ${s.toLowerCase()}`)
      .join(", ");
    warnings.push({
      code: "UNRESOLVED_BLOCKERS",
      severity:
        blockersBySeverity.CRITICAL > 0 ? "CRITICAL" : blockersBySeverity.HIGH > 0 ? "HIGH" : "MEDIUM",
      title: `${unresolvedBlockers} Unresolved Blocker${unresolvedBlockers > 1 ? "s" : ""}`,
      explanation: `Active blockers detected (${sevSummary}). Resolving blockers immediately restores blocked workflow momentum (-${penalty} pts).`,
      count: unresolvedBlockers,
      penalty,
    });
  }

  if (staleTasksCount > 0) {
    const penalty = Math.min(15, staleTasksCount * 4);
    totalPenalty += penalty;
    warnings.push({
      code: "STALE_TASKS",
      severity: staleTasksCount >= 4 ? "HIGH" : "MEDIUM",
      title: `${staleTasksCount} Stale Task${staleTasksCount > 1 ? "s" : ""} (>${STALE_DAYS_THRESHOLD}d no updates)`,
      explanation: `${staleTasksCount} open task${staleTasksCount > 1 ? "s have" : " has"} had no status, memory, or comment updates in over ${STALE_DAYS_THRESHOLD} days (-${penalty} pts).`,
      count: staleTasksCount,
      penalty,
    });
  }

  if (reviewWaitingCount > 0) {
    const penalty = Math.min(10, reviewWaitingCount * 2);
    totalPenalty += penalty;
    warnings.push({
      code: "REVIEW_QUEUE",
      severity: reviewWaitingCount >= 4 ? "MEDIUM" : "LOW",
      title: `${reviewWaitingCount} Task${reviewWaitingCount > 1 ? "s" : ""} Waiting for Review`,
      explanation: `${reviewWaitingCount} task${reviewWaitingCount > 1 ? "s are" : " is"} currently queued in Review/QA columns awaiting verification (-${penalty} pts).`,
      count: reviewWaitingCount,
      penalty,
    });
  }

  if (exceededTimeCount > 0) {
    const penalty = Math.min(15, exceededTimeCount * 5);
    totalPenalty += penalty;
    warnings.push({
      code: "EXCEEDED_ESTIMATE",
      severity: exceededTimeCount >= 2 ? "HIGH" : "MEDIUM",
      title: `${exceededTimeCount} Task${exceededTimeCount > 1 ? "s" : ""} Exceeding Expected Hours`,
      explanation: `${exceededTimeCount} active task${exceededTimeCount > 1 ? "s have" : " has"} been open longer than ${exceededTimeCount > 1 ? "their" : "its"} estimated hours (-${penalty} pts).`,
      count: exceededTimeCount,
      penalty,
    });
  }

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  const status: WorkspaceHealthReport["status"] =
    score >= 80 ? "HEALTHY" : score >= 60 ? "AT_RISK" : "CRITICAL";

  const avgPendingAgeDays =
    pendingTasks > 0 ? Number((pendingAgeSum / pendingTasks).toFixed(1)) : 0;

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    score,
    status,
    deltaFromLastSnapshot: latestSnapshot ? score - latestSnapshot.score : null,
    indicators: {
      totalTasks: tasks.length,
      completedTasks,
      pendingTasks,
      overdueCount,
      unresolvedBlockers,
      blockersBySeverity,
      staleTasksCount,
      reviewWaitingCount,
      exceededTimeCount,
    },
    aging: {
      avgPendingAgeDays,
      maxPendingAgeDays,
      staleThresholdDays: STALE_DAYS_THRESHOLD,
      agingTasks: agingCandidates.slice(0, 5),
    },
    weeklySummary: {
      tasksCreated: tasksCreatedThisWeek,
      tasksCompleted: tasksCompletedThisWeek,
      memoriesAdded,
      handoffsCreated,
      blockersResolved,
    },
    warnings,
    calculatedAt: now.toISOString(),
  };
}

/**
 * Saves a ProjectHealthSnapshot if forced or if metrics changed since the last snapshot,
 * then broadcasts `project_health_updated` to authorized workspace members.
 */
export async function recordHealthSnapshotAndBroadcast(workspaceId: string, forceSnapshot = false) {
  const report = await computeWorkspaceHealth(workspaceId);
  if (!report) return null;

  try {
    const latest = await prisma.projectHealthSnapshot.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    const changed =
      !latest ||
      latest.score !== report.score ||
      latest.unresolvedBlockers !== report.indicators.unresolvedBlockers ||
      latest.overdueCount !== report.indicators.overdueCount ||
      latest.completedTasks !== report.indicators.completedTasks ||
      latest.pendingTasks !== report.indicators.pendingTasks;

    if (forceSnapshot || changed) {
      await prisma.projectHealthSnapshot.create({
        data: {
          workspaceId,
          score: report.score,
          overdueCount: report.indicators.overdueCount,
          unresolvedBlockers: report.indicators.unresolvedBlockers,
          staleTasksCount: report.indicators.staleTasksCount,
          reviewWaitingCount: report.indicators.reviewWaitingCount,
          exceededTimeCount: report.indicators.exceededTimeCount,
          completedTasks: report.indicators.completedTasks,
          pendingTasks: report.indicators.pendingTasks,
          warnings: report.warnings as unknown as object,
        },
      });
    }
  } catch (err) {
    console.error("Failed to record health snapshot:", err);
  }

  try {
    getIO().to(workspaceId).emit("project_health_updated", {
      workspaceId,
      health: report,
    });
  } catch {
    // Socket may not be initialized in standalone unit contexts
  }

  return report;
}

import { prisma } from "./prisma";
import { computeWorkspaceHealth } from "./health";
import { filterBlockerForUser } from "./workspaceAuth";

export interface ChatContextLink {
  label: string;
  type: "workspace" | "task" | "admin-users";
  workspaceId?: string;
  boardId?: string;
  taskId?: string;
  tab?: "overview" | "memory" | "blockers" | "handoffs" | "activity";
}

export interface LocalChatReply {
  reply: string;
  mode: "local-engine" | "local-ollama";
  contextLinks: ChatContextLink[];
  suggestedPrompts: string[];
}

interface ChatParams {
  userId: string;
  systemRole: "ADMIN" | "MEMBER";
  message: string;
  workspaceId?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86400000));
}

function formatDuration(createdAt: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

/**
 * Generates a strictly authorization-scoped local workspace intelligence response
 * from real PostgreSQL records. Optionally delegates final prose wording to a local
 * Ollama instance if OLLAMA_URL is configured and reachable, always falling back cleanly
 * to the deterministic local engine.
 */
export async function generateLocalChatReply({
  userId,
  systemRole,
  message,
  workspaceId,
  history = [],
}: ChatParams): Promise<{ status: number; data: LocalChatReply | { error: string } }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, systemRole: true },
  });
  if (!user) return { status: 401, data: { error: "User not found" } };

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          boards: { select: { id: true, name: true }, take: 3 },
          _count: { select: { members: true, boards: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  if (workspaceId && !memberships.some((m) => m.workspaceId === workspaceId)) {
    return { status: 403, data: { error: "Access denied – not a member of selected workspace" } };
  }

  const scopedMemberships = workspaceId
    ? memberships.filter((m) => m.workspaceId === workspaceId)
    : memberships;
  const scopedWsIds = scopedMemberships.map((m) => m.workspaceId);
  const roleByWs = new Map(scopedMemberships.map((m) => [m.workspaceId, m.role]));
  const wsMetaById = new Map(scopedMemberships.map((m) => [m.workspaceId, m.workspace]));

  const defaultSuggestions = [
    "Project health summary",
    "Show open blockers",
    "My pending handoffs",
    "What tasks are assigned to me?",
    "Recent task memories",
    ...(systemRole === "ADMIN" ? ["Member activation status"] : []),
  ];

  const q = message.trim();
  const ql = q.toLowerCase();

  if (scopedWsIds.length === 0 && !/help|how|create|assign|delete|user|member|activat/i.test(ql)) {
    return {
      status: 200,
      data: {
        reply:
          `Hi ${user.name}! You aren't a member of any projects yet.\n\n` +
          `• Click **+ New Project** to create a workspace and initialize a Kanban board.\n` +
          `• Or open **Project Directory** to send a join request to an existing team workspace.`,
        mode: "local-engine",
        contextLinks: [],
        suggestedPrompts: ["How do I create or join a project?", "How do roles and permissions work?"],
      },
    };
  }

  // Gather privacy-filtered data within user's authorized workspaces
  const [tasks, rawBlockers, handoffs, memories] = await Promise.all([
    scopedWsIds.length
      ? prisma.task.findMany({
          where: { column: { board: { workspaceId: { in: scopedWsIds } } } },
          include: {
            column: {
              select: { name: true, boardId: true, board: { select: { workspaceId: true, name: true } } },
            },
            assignee: { select: { id: true, name: true } },
            creator: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 60,
        })
      : Promise.resolve([]),
    scopedWsIds.length
      ? prisma.taskBlocker.findMany({
          where: { workspaceId: { in: scopedWsIds }, status: { not: "RESOLVED" } },
          include: {
            reporter: { select: { id: true, name: true, email: true } },
            task: { select: { id: true, title: true, column: { select: { name: true, boardId: true } } } },
            workspace: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
    scopedWsIds.length
      ? prisma.taskHandoff.findMany({
          where: { workspaceId: { in: scopedWsIds }, toUserId: userId, acknowledgment: { is: null } },
          include: {
            fromUser: { select: { id: true, name: true } },
            task: { select: { id: true, title: true, column: { select: { boardId: true } } } },
            workspace: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        })
      : Promise.resolve([]),
    scopedWsIds.length
      ? prisma.taskMemoryEntry.findMany({
          where: { workspaceId: { in: scopedWsIds } },
          include: {
            author: { select: { id: true, name: true } },
            task: { select: { id: true, title: true, column: { select: { boardId: true } } } },
            workspace: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        })
      : Promise.resolve([]),
  ]);

  const visibleBlockers = rawBlockers
    .map((b) => filterBlockerForUser(b, userId, roleByWs.get(b.workspaceId) || "VIEWER"))
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const healthReports = (
    await Promise.all(scopedWsIds.slice(0, 5).map((id) => computeWorkspaceHealth(id)))
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const contextLinks: ChatContextLink[] = [];
  let baseReply = "";

  // Intent routing (ordered specifically for crisp local answers)
  if (/\/help|\bhow\b|\bhelp\b|delete project|assign project|permission|rbac|viewer/i.test(ql)) {
    baseReply =
      `**TechSters Quick Guide (Grounded to Your Role):**\n\n` +
      `• **Assign Project to Members:** On any project where you are an **ADMIN**, click **Assign Members** (in Admin Lobby, Member Lobby, All Projects, or Workspace & Team) — or click **Assign Project** on any active user row inside **Admin Lobby → Member & User Activation**.\n` +
      `• **Delete Project:** Workspace **ADMIN**s see a **Delete** button on project cards and inside **Manage Team & Logs / Workspace** (prompts confirmation and deletes cascade records).\n` +
      `• **Task Memory Capsule:** Open any task card → **Memory** tab to append decisions, attempted approaches, and next steps without overwriting history.\n` +
      `• **Silent Blocker Radar:** Report blockers under **Blockers** tab with ` +
      `\`Silent (Reporter & Admins)\`, \`Protected\`, or \`Team Visible\` privacy.\n` +
      `• **Auto Handoff Mode:** Transfer tasks under **Handoffs** tab with full context and one-click Memory pre-fill.\n` +
      `• **Project Health Pulse:** Computed deterministically from overdue tasks, unresolved blockers, stale items (>5d), review queue, and exceeded hour estimates.`;
  } else if (/health|pulse|score|risk|warning|stale|overdue/i.test(ql)) {
    if (healthReports.length === 0) {
      baseReply = "No project workspaces available to compute Health Pulse.";
    } else {
      const lines = healthReports.map((r) => {
        const wsMeta = wsMetaById.get(r.workspaceId);
        if (wsMeta?.boards?.[0]) {
          contextLinks.push({
            label: `${r.workspaceName} (${r.score}/100)`,
            type: "workspace",
            workspaceId: r.workspaceId,
            boardId: wsMeta.boards[0].id,
          });
        }
        const warnText =
          r.warnings.length === 0
            ? "No active penalties."
            : r.warnings.map((w) => `  - **${w.title}** (-${w.penalty} pts): ${w.explanation}`).join("\n");
        return (
          `**${r.workspaceName}** — **${r.score}/100 (${r.status.replace("_", " ")})**\n` +
          `  Tasks: ${r.indicators.completedTasks}/${r.indicators.totalTasks} completed (${r.indicators.pendingTasks} pending) · Blockers: ${r.indicators.unresolvedBlockers} · Overdue: ${r.indicators.overdueCount} · Stale (>5d): ${r.indicators.staleTasksCount}\n` +
          warnText
        );
      });
      baseReply = `**Project Health Pulse Summary:**\n\n${lines.join("\n\n")}`;
    }
  } else if (/blocker|stuck|silent|radar/i.test(ql)) {
    if (visibleBlockers.length === 0) {
      baseReply = "There are currently **0 visible unresolved blockers** across your selected workspaces.";
    } else {
      const lines = visibleBlockers.slice(0, 8).map((b) => {
        if (b.task?.column?.boardId) {
          contextLinks.push({
            label: `${b.task.title} → Blockers`,
            type: "task",
            workspaceId: b.workspaceId,
            boardId: b.task.column.boardId,
            taskId: b.taskId,
            tab: "blockers",
          });
        }
        const detail = b.isPrivateRedacted
          ? "🔒 Private explanation restricted to Admins"
          : b.explanation || "No additional details";
        return `• **[${b.severity}] ${b.task?.title || "Task"}** (${b.workspace?.name || "Workspace"}) — Open ${formatDuration(b.createdAt)} · *${detail}*`;
      });
      baseReply = `**Visible Unresolved Blockers (${visibleBlockers.length}):**\n\n${lines.join("\n")}`;
    }
  } else if (/handoff|handover|transfer|unread/i.test(ql)) {
    if (handoffs.length === 0) {
      baseReply = "You have **no pending unacknowledged handoffs** right now.";
    } else {
      const lines = handoffs.slice(0, 8).map((h) => {
        const boardId = h.task?.column?.boardId || wsMetaById.get(h.workspaceId)?.boards?.[0]?.id;
        if (boardId) {
          contextLinks.push({
            label: `${h.task?.title || "Task"} → Handoffs`,
            type: "task",
            workspaceId: h.workspaceId,
            boardId,
            taskId: h.taskId,
            tab: "handoffs",
          });
        }
        return `• **${h.task?.title || "Task"}** from **${h.fromUser.name}** (${h.workspace?.name || ""})\n  First step: *${h.firstStepRecommended}* | Remaining: ${h.remainingWork}`;
      });
      baseReply = `**Your Pending Handoffs (${handoffs.length}):**\n\n${lines.join("\n\n")}`;
    }
  } else if (/memory|capsule|decision|context/i.test(ql)) {
    // Allow searching memory entries by task title or keyword
    const searchTokens = ql
      .replace(/memory|capsule|decisions|context|show|recent|latest|for|about|task|on|the/gi, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const matched =
      searchTokens.length > 0
        ? memories.filter((m) =>
            searchTokens.some((tok) =>
              `${m.task?.title || ""} ${m.originalProblem || ""} ${m.technicalDecisions || ""} ${m.workCompleted || ""} ${m.nextRecommendedAction || ""}`
                .toLowerCase()
                .includes(tok)
            )
          )
        : memories;

    if (matched.length === 0) {
      baseReply =
        memories.length === 0
          ? "No Task Memory Capsule entries have been recorded yet in your workspaces."
          : "No Task Memory entries matched your filter, though older workspace memories exist.";
    } else {
      const lines = matched.slice(0, 6).map((m) => {
        const boardId = m.task?.column?.boardId || wsMetaById.get(m.workspaceId)?.boards?.[0]?.id;
        if (boardId) {
          contextLinks.push({
            label: `${m.task?.title || "Task"} → Memory`,
            type: "task",
            workspaceId: m.workspaceId,
            boardId,
            taskId: m.taskId,
            tab: "memory",
          });
        }
        const snippet =
          m.nextRecommendedAction ||
          m.technicalDecisions ||
          m.workCompleted ||
          m.originalProblem ||
          m.expectedOutcome ||
          "Context recorded";
        return `• **${m.task?.title || "Task"}** (by ${m.author.name}): ${snippet}`;
      });
      baseReply = `**Task Memory Capsule Highlights (${matched.length} found):**\n\n${lines.join("\n")}`;
    }
  } else if (/activat|user|member|online|team/i.test(ql) && systemRole === "ADMIN") {
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, email: true, systemRole: true, isActive: true, lastLoginAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const activeCount = allUsers.filter((u) => u.isActive).length;
    const inactiveCount = allUsers.length - activeCount;
    contextLinks.push({ label: "Open Member & User Activation", type: "admin-users" });
    const listLines = allUsers
      .slice(0, 10)
      .map(
        (u) =>
          `• **${u.name}** (${u.email}) · ${u.systemRole} · **${u.isActive ? "Active" : "Deactivated"}** · Last login: ${u.lastLoginAt ? u.lastLoginAt.toLocaleDateString() : "Never"}`
      )
      .join("\n");
    baseReply = `**Registered Accounts (${activeCount} active, ${inactiveCount} deactivated):**\n\n${listLines}`;
  } else if (/my task|assigned to me|todo|in progress|done|task|priority|urgent|project|workspace|summary|status/i.test(ql)) {
    const myTasks = tasks.filter((t) => t.assigneeId === userId);
    const showMine = /my task|assigned to me/i.test(ql);
    const list = showMine ? myTasks : tasks;

    // Filter by priority keyword if present
    const prioMatch = ql.match(/\b(urgent|high|medium|low)\b/i)?.[1]?.toUpperCase();
    const filteredList = prioMatch ? list.filter((t) => t.priority === prioMatch) : list;

    const now = new Date();
    const taskLines = filteredList.slice(0, 8).map((t) => {
      contextLinks.push({
        label: t.title,
        type: "task",
        workspaceId: t.column.board.workspaceId,
        boardId: t.column.boardId,
        taskId: t.id,
        tab: "overview",
      });
      const dueStr = t.dueDate ? ` · Due ${t.dueDate.toISOString().split("T")[0]}` : "";
      const staleDays = daysBetween(now, t.updatedAt);
      const staleNote = staleDays >= 5 ? ` · ${staleDays}d idle` : "";
      return `• **[${t.priority}] ${t.title}** (${t.column.name} · Assignee: ${t.assignee?.name || "Unassigned"}${dueStr}${staleNote})`;
    });

    const healthMini = healthReports
      .map((r) => `**${r.workspaceName}**: ${r.score}/100 (${r.indicators.completedTasks}/${r.indicators.totalTasks} done, ${r.indicators.unresolvedBlockers} blockers)`)
      .join(" | ");

    baseReply =
      filteredList.length === 0
        ? `No matching tasks found (${healthMini || "0 tasks"}).`
        : `${healthMini ? `**Workspace Pulse:** ${healthMini}\n\n` : ""}**${showMine ? "Tasks Assigned to You" : "Workspace Tasks"} (${filteredList.length}):**\n\n${taskLines.join("\n")}`;
  } else {
    // Keyword search fallback across tasks & workspaces before general summary
    const tokens = ql
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["what", "when", "where", "which", "about", "there", "have", "with", "this", "that"].includes(t));

    const matchedTasks = tokens.length
      ? tasks.filter((t) =>
          tokens.some((tok) => `${t.title} ${t.description || ""} ${t.labels.join(" ")}`.toLowerCase().includes(tok))
        )
      : [];

    if (matchedTasks.length > 0) {
      const lines = matchedTasks.slice(0, 6).map((t) => {
        contextLinks.push({
          label: t.title,
          type: "task",
          workspaceId: t.column.board.workspaceId,
          boardId: t.column.boardId,
          taskId: t.id,
          tab: "overview",
        });
        return `• **${t.title}** (${t.column.name} · ${t.priority} · Assignee: ${t.assignee?.name || "Unassigned"})`;
      });
      baseReply = `**Found ${matchedTasks.length} matching task${matchedTasks.length > 1 ? "s" : ""}:**\n\n${lines.join("\n")}`;
    } else {
      const wsSummary = healthReports
        .map((r) => `• **${r.workspaceName}** — Health: **${r.score}/100**, ${r.indicators.pendingTasks} pending tasks, ${r.indicators.unresolvedBlockers} blockers`)
        .join("\n");
      baseReply =
        `**TechSters Local Context Overview for ${user.name}:**\n\n` +
        `${wsSummary || "• You have access to " + scopedWsIds.length + " workspace(s)."}\n` +
        `• Unread Handoffs for you: **${handoffs.length}**\n` +
        `• Visible Unresolved Blockers: **${visibleBlockers.length}**\n` +
        `• Recent Memory Entries: **${memories.length}**\n\n` +
        `Ask me about **project health**, **open blockers**, **my handoffs**, **task memories**, **my tasks**, or **how to assign/delete projects**.`;
    }
  }

  // Deduplicate context links cleanly (cap at 5 pills)
  const seenLinkKeys = new Set<string>();
  const uniqueLinks = contextLinks
    .filter((l) => {
      const k = `${l.type}:${l.workspaceId || ""}:${l.taskId || ""}:${l.tab || ""}`;
      if (seenLinkKeys.has(k)) return false;
      seenLinkKeys.add(k);
      return true;
    })
    .slice(0, 5);

  // Optional local Ollama prose refinement ONLY if explicitly configured locally
  const ollamaUrl = process.env.OLLAMA_URL?.trim();
  if (ollamaUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";
      const resp = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "You are TechSters Local Assistant. Answer ONLY using the verified database facts provided below. Never invent tasks, scores, names, or secrets. Keep replies concise and structured.\n\nVERIFIED FACTS:\n" +
                baseReply,
            },
            ...history.slice(-4),
            { role: "user", content: q },
          ],
        }),
      });
      clearTimeout(timer);
      if (resp.ok) {
        const json = (await resp.json()) as { message?: { content?: string } };
        const text = json.message?.content?.trim();
        if (text) {
          return {
            status: 200,
            data: {
              reply: text,
              mode: "local-ollama",
              contextLinks: uniqueLinks,
              suggestedPrompts: defaultSuggestions,
            },
          };
        }
      }
    } catch {
      // Fall back transparently to deterministic local engine
    }
  }

  return {
    status: 200,
    data: {
      reply: baseReply,
      mode: "local-engine",
      contextLinks: uniqueLinks,
      suggestedPrompts: defaultSuggestions,
    },
  };
}

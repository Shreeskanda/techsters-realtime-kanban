// API Client – TechSters Collaborative Kanban (2.0)
const envApiUrl = import.meta.env.VITE_API_URL;
const BASE = import.meta.env.PROD
  ? envApiUrl && !envApiUrl.includes("localhost")
    ? envApiUrl
    : "/api"
  : envApiUrl || "http://localhost:5000/api";

export function getToken() {
  return localStorage.getItem("tk_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  auth: {
    checkEmail: (email: string) =>
      request<{ exists: boolean; name?: string; isActive?: boolean }>("/auth/check-email", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    register: (data: { name: string; email: string; password: string; systemRole?: "ADMIN" | "MEMBER" }) =>
      request<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    me: () => request<User>("/auth/me"),
  },
  workspaces: {
    list: () => request<Workspace[]>("/workspaces"),
    listPublic: () => request<PublicWorkspace[]>("/workspaces/public"),
    get: (id: string) => request<Workspace>(`/workspaces/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(data) }),
    inviteMember: (id: string, data: { email: string; role: string }) =>
      request<WorkspaceMember>(`/workspaces/${id}/members`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateMemberRole: (id: string, userId: string, role: "ADMIN" | "MEMBER" | "VIEWER") =>
      request<WorkspaceMember>(`/workspaces/${id}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    removeMember: (id: string, userId: string) =>
      request(`/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
    getActivity: (id: string) => request<ActivityLog[]>(`/workspaces/${id}/activity`),
    export: async (id: string) => {
      const token = getToken();
      const res = await fetch(`${BASE}/workspaces/${id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tasks-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  boards: {
    get: (id: string) => request<Board>(`/boards/${id}`),
    create: (data: { name: string; workspaceId: string; description?: string }) =>
      request<Board>("/boards", { method: "POST", body: JSON.stringify(data) }),
    addColumn: (boardId: string, name: string) =>
      request<Column>(`/boards/${boardId}/columns`, { method: "POST", body: JSON.stringify({ name }) }),
  },
  tasks: {
    list: (workspaceId: string) => request<Task[]>(`/tasks?workspaceId=${workspaceId}`),
    create: (data: Partial<Task> & { columnId: string; workspaceId: string }) =>
      request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Omit<Partial<Task>, "dueDate" | "assigneeId" | "expectedHours"> & {
        workspaceId?: string;
        dueDate?: string | null;
        assigneeId?: string | null;
        expectedHours?: number | null;
      }
    ) =>
      request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/tasks/${id}`, { method: "DELETE" }),
    getComments: (id: string) => request<Comment[]>(`/tasks/${id}/comments`),
    addComment: (id: string, content: string) =>
      request<Comment>(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
    getTimeline: (id: string) => request<TaskTimelineItem[]>(`/tasks/${id}/timeline`),
  },
  memory: {
    listForTask: (taskId: string) => request<TaskMemoryEntry[]>(`/tasks/${taskId}/memory`),
    create: (
      taskId: string,
      data: {
        originalProblem?: string;
        expectedOutcome?: string;
        workCompleted?: string;
        approachesAttempted?: string;
        technicalDecisions?: string;
        outstandingQuestions?: string;
        nextRecommendedAction?: string;
        supportingLinks?: string[];
      }
    ) =>
      request<TaskMemoryEntry>(`/tasks/${taskId}/memory`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    recent: (workspaceId?: string) =>
      request<TaskMemoryEntry[]>(`/memories/recent${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),
  },
  blockers: {
    listForTask: (taskId: string) => request<TaskBlocker[]>(`/tasks/${taskId}/blockers`),
    listForWorkspace: (workspaceId: string, includeResolved = false) =>
      request<TaskBlocker[]>(`/workspaces/${workspaceId}/blockers${includeResolved ? "?includeResolved=true" : ""}`),
    listActive: () => request<TaskBlocker[]>("/blockers/active"),
    create: (
      taskId: string,
      data: {
        type: BlockerType;
        severity: BlockerSeverity;
        privacy: BlockerPrivacy;
        explanation?: string;
      }
    ) =>
      request<TaskBlocker>(`/tasks/${taskId}/blockers`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: {
        status?: BlockerStatus;
        severity?: BlockerSeverity;
        privacy?: BlockerPrivacy;
        resolutionNote?: string;
      }
    ) =>
      request<TaskBlocker>(`/blockers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  handoffs: {
    listForTask: (taskId: string) => request<TaskHandoff[]>(`/tasks/${taskId}/handoffs`),
    listForWorkspace: (workspaceId: string) => request<TaskHandoff[]>(`/workspaces/${workspaceId}/handoffs`),
    listPending: () => request<TaskHandoff[]>("/handoffs/pending"),
    create: (
      taskId: string,
      data: {
        toUserId: string;
        completedSummary: string;
        remainingWork: string;
        problemsEncountered?: string;
        technicalDecisions?: string;
        firstStepRecommended: string;
        importantLinks?: string[];
      }
    ) =>
      request<TaskHandoff>(`/tasks/${taskId}/handoffs`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    acknowledge: (id: string, note?: string) =>
      request<TaskHandoff>(`/handoffs/${id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
  },
  health: {
    get: (workspaceId: string) => request<WorkspaceHealthReport>(`/workspaces/${workspaceId}/health`),
    history: (workspaceId: string, limit = 14) =>
      request<ProjectHealthSnapshot[]>(`/workspaces/${workspaceId}/health/history?limit=${limit}`),
    snapshot: (workspaceId: string) =>
      request<WorkspaceHealthReport>(`/workspaces/${workspaceId}/health/snapshot`, {
        method: "POST",
      }),
  },
  joinRequests: {
    submit: (workspaceId: string, message?: string) =>
      request<JoinRequest>(`/join-requests/${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    list: (workspaceId: string) => request<JoinRequest[]>(`/join-requests/${workspaceId}`),
    myStatus: () => request<JoinRequest[]>("/join-requests/my/status"),
    action: (id: string, action: "APPROVED" | "REJECTED", role?: "ADMIN" | "MEMBER" | "VIEWER") =>
      request<JoinRequest>(`/join-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, role }),
      }),
  },
  feedback: {
    submit: (data: { workspaceId: string; rating: number; category: string; message: string }) =>
      request<ProjectFeedback>("/feedback", { method: "POST", body: JSON.stringify(data) }),
    list: (workspaceId?: string) =>
      request<ProjectFeedback[]>(`/feedback${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),
  },
  admin: {
    stats: () => request<AdminStats>("/admin/stats"),
    users: () => request<AdminUserStatus[]>("/admin/users"),
    activateUser: (id: string) => request<AdminUserStatus>(`/admin/users/${id}/activate`, { method: "PATCH" }),
    deactivateUser: (id: string) => request<AdminUserStatus>(`/admin/users/${id}/deactivate`, { method: "PATCH" }),
  },
};

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  systemRole?: "ADMIN" | "MEMBER";
  isActive?: boolean;
  lastLoginAt?: string;
  lastSeenAt?: string;
}

export interface AdminUserStatus {
  id: string;
  name: string;
  email: string;
  systemRole: "ADMIN" | "MEMBER";
  isActive: boolean;
  isOnline: boolean;
  presenceStatus: "ONLINE" | "RECENTLY_ACTIVE" | "OFFLINE" | "NEVER_LOGGED_IN" | "DEACTIVATED";
  lastLoginAt?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  memberships: { role: "ADMIN" | "MEMBER" | "VIEWER"; workspace: { id: string; name: string } }[];
}

export interface PublicWorkspace {
  id: string;
  name: string;
  description?: string;
  slug: string;
  createdAt?: string;
  _count: { members: number; boards: number };
}

export interface WorkspaceMember {
  id: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
  user: User;
  userId: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  slug: string;
  members: WorkspaceMember[];
  boards: { id: string; name: string }[];
  _count?: { boards: number; members: number };
}

export interface Column {
  id: string;
  name: string;
  position: number;
  tasks: Task[];
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  columns: Column[];
  workspace?: Workspace;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  position: number;
  dueDate?: string;
  expectedHours?: number | null;
  labels: string[];
  columnId: string;
  column?: { name: string };
  assigneeId?: string;
  assignee?: User;
  creator: User;
  _count?: { comments: number; memoryEntries?: number };
  openBlockersCount?: number;
  unreadHandoffsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  content: string;
  author: User;
  createdAt: string;
}

export interface TaskMemoryEntry {
  id: string;
  originalProblem?: string | null;
  expectedOutcome?: string | null;
  workCompleted?: string | null;
  approachesAttempted?: string | null;
  technicalDecisions?: string | null;
  outstandingQuestions?: string | null;
  nextRecommendedAction?: string | null;
  supportingLinks: string[];
  createdAt: string;
  taskId: string;
  workspaceId: string;
  authorId: string;
  author: User;
  task?: { id: string; title: string; columnId?: string };
  workspace?: { id: string; name: string; boards?: { id: string; name: string }[] };
}

export type BlockerType =
  | "STUCK"
  | "TECHNICAL_ASSISTANCE"
  | "WAITING_FOR_PERSON"
  | "UNCLEAR_REQUIREMENTS"
  | "NEEDS_RESOURCES";

export type BlockerSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BlockerPrivacy = "PRIVATE_ADMINS" | "TEAM" | "REPORTER_AND_ADMINS";
export type BlockerStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface TaskBlocker {
  id: string;
  type: BlockerType;
  severity: BlockerSeverity;
  privacy: BlockerPrivacy;
  status: BlockerStatus;
  explanation?: string | null;
  resolutionNote?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  taskId: string;
  workspaceId: string;
  reporterId: string;
  reporter?: { id: string; name: string; email?: string } | null;
  acknowledgedBy?: { id: string; name: string } | null;
  resolvedBy?: { id: string; name: string } | null;
  task?: { id: string; title: string; column?: { name: string; boardId?: string } | null } | null;
  workspace?: { id: string; name: string } | null;
  isPrivateRedacted?: boolean;
  canResolve?: boolean;
  canAcknowledge?: boolean;
}

export interface TaskHandoffAcknowledgment {
  id: string;
  note?: string | null;
  acknowledgedAt: string;
  handoffId: string;
  userId: string;
  user: { id: string; name: string; email?: string };
}

export interface TaskHandoff {
  id: string;
  completedSummary: string;
  remainingWork: string;
  problemsEncountered?: string | null;
  technicalDecisions?: string | null;
  firstStepRecommended: string;
  importantLinks: string[];
  createdAt: string;
  taskId: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  fromUser: User;
  toUser: User;
  acknowledgment?: TaskHandoffAcknowledgment | null;
  task?: {
    id: string;
    title: string;
    priority: string;
    columnId: string;
    column?: { name: string; boardId?: string };
    memoryEntries?: TaskMemoryEntry[];
  };
  workspace?: {
    id: string;
    name: string;
    boards?: { id: string; name: string }[];
  };
}

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

export interface ProjectHealthSnapshot {
  id: string;
  score: number;
  overdueCount: number;
  unresolvedBlockers: number;
  staleTasksCount: number;
  reviewWaitingCount: number;
  exceededTimeCount: number;
  completedTasks: number;
  pendingTasks: number;
  warnings: HealthWarning[];
  createdAt: string;
  workspaceId: string;
}

export interface TaskTimelineItem {
  id: string;
  kind: "activity" | "comment" | "memory" | "blocker" | "handoff" | "handoff_ack";
  timestamp: string;
  actor: { id: string; name: string };
  title: string;
  body?: string | null;
  meta?: Record<string, unknown>;
}

export interface ActivityLog {
  id: string;
  action: string;
  details?: Record<string, unknown>;
  user: User;
  task?: { id: string; title: string };
  workspace?: { id: string; name: string };
  createdAt: string;
}

export interface JoinRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  message?: string;
  workspaceId?: string;
  workspace: { id: string; name: string; slug?: string };
  user: User;
  createdAt: string;
}

export interface ProjectFeedback {
  id: string;
  rating: number;
  category: string;
  message: string;
  user: User;
  workspace?: { id: string; name: string };
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsersCount: number;
  inactiveUsersCount: number;
  onlineUsersCount: number;
  totalWorkspaces: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  pendingRequests: number;
  pendingJoinRequests: JoinRequest[];
  recentActivity: ActivityLog[];
  tasksByPriority: { priority: string; _count: number }[];
  feedbacks: ProjectFeedback[];
  avgRating: number | null;
  unresolvedBlockersCount: number;
  pendingHandoffsCount: number;
}

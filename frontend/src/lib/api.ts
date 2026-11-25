// API Client – TechSters Collaborative Kanban
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
      request<{ exists: boolean; name?: string }>("/auth/check-email", {
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
    update: (id: string, data: Partial<Task> & { workspaceId?: string }) =>
      request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/tasks/${id}`, { method: "DELETE" }),
    getComments: (id: string) => request<Comment[]>(`/tasks/${id}/comments`),
    addComment: (id: string, content: string) =>
      request<Comment>(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
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
  },
};

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  systemRole?: "ADMIN" | "MEMBER";
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
  labels: string[];
  columnId: string;
  column?: { name: string };
  assigneeId?: string;
  assignee?: User;
  creator: User;
  _count?: { comments: number };
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  content: string;
  author: User;
  createdAt: string;
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
}

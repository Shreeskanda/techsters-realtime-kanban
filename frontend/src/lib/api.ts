// API Client – TechSters Collaborative Kanban
const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

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

// Auth
export const api = {
  auth: {
    register: (data: { name: string; email: string; password: string }) =>
      request<{ token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    me: () => request<User>("/auth/me"),
  },
  workspaces: {
    list: () => request<Workspace[]>("/workspaces"),
    get: (id: string) => request<Workspace>(`/workspaces/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(data) }),
    inviteMember: (id: string, data: { email: string; role: string }) =>
      request(`/workspaces/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
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
      request(`/boards/${boardId}/columns`, { method: "POST", body: JSON.stringify({ name }) }),
  },
  tasks: {
    list: (workspaceId: string) => request<Task[]>(`/tasks?workspaceId=${workspaceId}`),
    create: (data: Partial<Task> & { columnId: string; workspaceId: string }) =>
      request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Task>) =>
      request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/tasks/${id}`, { method: "DELETE" }),
    getComments: (id: string) => request<Comment[]>(`/tasks/${id}/comments`),
    addComment: (id: string, content: string) =>
      request<Comment>(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
  },
};

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
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
  createdAt: string;
}

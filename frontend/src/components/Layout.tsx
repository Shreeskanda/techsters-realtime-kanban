import React from "react";
import { useAuthStore } from "../store/authStore";
import { disconnectSocket } from "../lib/socket";

type NavPage = "dashboard" | "workspaces" | "board" | "workspace-detail";

interface Props {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  boardName?: string;
  workspaceName?: string;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  { id: "workspaces", label: "Workspaces", icon: "🗂️" },
];

export default function Layout({ children, currentPage, onNavigate, boardName, workspaceName }: Props & { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    disconnectSocket();
    logout();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">K</div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">TechSters</p>
            <p className="text-xs text-slate-500">Kanban Board</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as NavPage)}
              className={`w-full text-left ${currentPage === item.id ? "sidebar-link-active" : "sidebar-link"}`}
            >
              <span>{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}

          {workspaceName && (
            <button
              onClick={() => onNavigate("workspace-detail")}
              className={`w-full text-left ${currentPage === "workspace-detail" ? "sidebar-link-active" : "sidebar-link"}`}
            >
              <span>📋</span>
              <span className="text-sm font-medium truncate">{workspaceName}</span>
            </button>
          )}

          {boardName && (
            <div className="sidebar-link-active w-full text-left">
              <span>🔲</span>
              <span className="text-sm font-medium truncate">{boardName}</span>
            </div>
          )}
        </nav>

        {/* User info */}
        <div className="border-t border-slate-700 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.[0] || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-sm text-slate-400 hover:text-red-400 transition-colors text-left">
            → Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col">{children}</main>
    </div>
  );
}

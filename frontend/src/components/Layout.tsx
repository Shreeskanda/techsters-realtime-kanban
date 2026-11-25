import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { disconnectSocket } from "../lib/socket";
import LocalChatbot from "./LocalChatbot";
import type { ChatContextLink, Workspace } from "../lib/api";

export type NavPage = "admin-lobby" | "member-lobby" | "workspaces" | "workspace-detail" | "board";

interface Props {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  onSwitchPortal?: () => void;
  boardName?: string;
  workspaceName?: string;
  activeWorkspaceId?: string;
  workspaces?: Workspace[];
  onChatNavigate?: (link: ChatContextLink) => void;
  pendingRequestsCount?: number;
  pendingHandoffsCount?: number;
  children: React.ReactNode;
}

export default function Layout({
  children,
  currentPage,
  onNavigate,
  onSwitchPortal,
  boardName,
  workspaceName,
  activeWorkspaceId,
  workspaces = [],
  onChatNavigate,
  pendingRequestsCount = 0,
  pendingHandoffsCount = 0,
}: Props) {
  const { user, logout, openFeedbackPrompt } = useAuthStore();
  const isSystemAdmin = user?.systemRole === "ADMIN";
  const [chatOpen, setChatOpen] = useState(false);

  const handleLogout = () => {
    disconnectSocket();
    logout();
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">K</div>
          <div>
            <div className="logo-text">TechSters</div>
            <div className="logo-sub">Context Kanban 2.0</div>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Platform</div>
          {isSystemAdmin ? (
            <>
              <button
                onClick={() => onNavigate("admin-lobby")}
                className={`nav-btn ${currentPage === "admin-lobby" ? "active" : ""}`}
              >
                <span className="icon">◈</span>
                <span>Admin Lobby</span>
                {pendingRequestsCount > 0 && <span className="badge">{pendingRequestsCount}</span>}
              </button>
              <button
                onClick={() => onNavigate("workspaces")}
                className={`nav-btn ${currentPage === "workspaces" ? "active" : ""}`}
              >
                <span className="icon">▤</span>
                <span>All Projects</span>
              </button>
              <button
                onClick={() => onNavigate("member-lobby")}
                className={`nav-btn ${currentPage === "member-lobby" ? "active" : ""}`}
              >
                <span className="icon">⇄</span>
                <span>Member Lobby</span>
                {pendingHandoffsCount > 0 && <span className="badge">{pendingHandoffsCount}</span>}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onNavigate("member-lobby")}
                className={`nav-btn ${currentPage === "member-lobby" ? "active" : ""}`}
              >
                <span className="icon">◈</span>
                <span>Member &amp; User Lobby</span>
                {pendingHandoffsCount > 0 && <span className="badge">{pendingHandoffsCount}</span>}
              </button>
              <button
                onClick={() => onNavigate("workspaces")}
                className={`nav-btn ${currentPage === "workspaces" ? "active" : ""}`}
              >
                <span className="icon">▤</span>
                <span>All Projects</span>
              </button>
              {onSwitchPortal && (
                <button onClick={onSwitchPortal} className="nav-btn">
                  <span className="icon">⇄</span>
                  <span>Project Portal</span>
                </button>
              )}
            </>
          )}
        </div>

        {(workspaceName || boardName) && (
          <div className="nav-section">
            <div className="nav-label">Active Project</div>
            {workspaceName && (
              <button
                onClick={() => onNavigate("workspace-detail")}
                className={`nav-btn ${currentPage === "workspace-detail" ? "active" : ""}`}
              >
                <span className="icon">❖</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {workspaceName}
                </span>
              </button>
            )}
            {boardName && (
              <button
                onClick={() => onNavigate("board")}
                className={`nav-btn ${currentPage === "board" ? "active" : ""}`}
              >
                <span className="icon">▥</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {boardName}
                </span>
              </button>
            )}
          </div>
        )}

        <div className="nav-section">
          <div className="nav-label">Engagement</div>
          <button onClick={() => setChatOpen((o) => !o)} className={`nav-btn ${chatOpen ? "active" : ""}`}>
            <span className="icon">💬</span>
            <span>Local Assistant</span>
          </button>
          <button onClick={openFeedbackPrompt} className="nav-btn">
            <span className="icon">★</span>
            <span>Give Feedback</span>
          </button>
        </div>

        {/* User Footer */}
        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.[0] || "?"}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="user-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.name}
            </div>
            <div className="user-email" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isSystemAdmin ? "System Admin" : "Member"}
            </div>
          </div>
          <button onClick={handleLogout} className="sign-out-btn" title="Sign out">
            Exit
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-area">
        <header className="topbar" style={{ justifyContent: "space-between" }}>
          <div className="topbar-breadcrumb">
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>TechSters</span>
            {workspaceName && (
              <>
                <span className="breadcrumb-sep">/</span>
                <span style={{ color: currentPage === "workspace-detail" ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {workspaceName}
                </span>
              </>
            )}
            {boardName && currentPage === "board" && (
              <>
                <span className="breadcrumb-sep">/</span>
                <span style={{ color: "var(--text-primary)" }}>{boardName}</span>
              </>
            )}
            {currentPage === "admin-lobby" && (
              <>
                <span className="breadcrumb-sep">/</span>
                <span style={{ color: "var(--text-primary)" }}>Admin Lobby</span>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {pendingHandoffsCount > 0 && (
              <button
                className="badge badge-purple"
                style={{ cursor: "pointer" }}
                onClick={() => onNavigate(isSystemAdmin ? "admin-lobby" : "member-lobby")}
                title="View unread handoffs"
              >
                ⇄ {pendingHandoffsCount} Pending Handoff{pendingHandoffsCount > 1 ? "s" : ""}
              </button>
            )}
            <div className="live-pill">
              <span className="live-dot" /> Real-Time Sync
            </div>
            <button
              className={`btn btn-sm ${chatOpen ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setChatOpen((o) => !o)}
            >
              💬 Assistant
            </button>
            <button className="btn btn-secondary btn-sm" onClick={openFeedbackPrompt}>
              ★ Feedback
            </button>
          </div>
        </header>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
      </main>

      <LocalChatbot
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        isSystemAdmin={isSystemAdmin}
        isOpen={chatOpen}
        onToggle={() => setChatOpen((o) => !o)}
        onNavigateLink={(lnk) => {
          onChatNavigate?.(lnk);
        }}
      />
    </div>
  );
}

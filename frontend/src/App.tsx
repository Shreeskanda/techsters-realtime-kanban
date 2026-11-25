import { useState, useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import { api } from "./lib/api";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ProjectPortal from "./pages/ProjectPortal";
import AdminLobby from "./pages/AdminLobby";
import Dashboard from "./pages/Dashboard";
import KanbanBoard from "./pages/KanbanBoard";
import WorkspacePage from "./pages/WorkspacePage";
import Layout from "./components/Layout";
import type { NavPage } from "./components/Layout";
import FeedbackModal from "./components/FeedbackModal";
import type { Workspace } from "./lib/api";

export default function App() {
  const { token, user, showFeedbackPrompt, clearFeedbackPrompt } = useAuthStore();

  const isSystemAdmin = user?.systemRole === "ADMIN";
  const [page, setPage] = useState<NavPage>("admin-lobby");
  const [memberPortalActive, setMemberPortalActive] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState<{ id: string; name: string; workspaceId: string } | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  // Show login form (overlaid on home page) when user clicks Sign In
  const [showLogin, setShowLogin] = useState(false);

  // Sync user's workspaces on login & set initial portal based on systemRole
  useEffect(() => {
    if (!token || !user) return;
    if (user.systemRole === "ADMIN") {
      setPage("admin-lobby");
      setMemberPortalActive(false);
    } else {
      setMemberPortalActive(true);
    }
    api.workspaces
      .list()
      .then(setMyWorkspaces)
      .catch(() => setMyWorkspaces([]));
  }, [token, user]);

  if (!token || !user) {
    return (
      <>
        <HomePage onGetStarted={() => setShowLogin(true)} />
        {showLogin && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}
          >
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowLogin(false)}
                style={{
                  position: "absolute",
                  top: -12,
                  right: -12,
                  zIndex: 10,
                  background: "var(--bg-surface,#161b22)",
                  border: "1px solid var(--border,#21262d)",
                  borderRadius: "50%",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  color: "var(--text-secondary,#8b949e)",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
              <LoginPage />
            </div>
          </div>
        )}
      </>
    );
  }

  const handleSelectBoard = (
    boardId: string,
    workspaceId: string,
    boardName = "Kanban Board",
    workspaceObj?: Workspace
  ) => {
    const ws = workspaceObj || myWorkspaces.find((w) => w.id === workspaceId) || selectedWorkspace;
    if (ws) setSelectedWorkspace(ws);
    setSelectedBoard({ id: boardId, name: boardName, workspaceId });
    setMemberPortalActive(false);
    setPage("board");
  };

  const handleSelectWorkspace = (ws: Workspace) => {
    setSelectedWorkspace(ws);
    setMemberPortalActive(false);
    setPage("workspace-detail");
  };

  // Member enters a workspace from the 2nd Login Portal
  const handleMemberEnterWorkspace = async (ws: Workspace) => {
    const fresh = await api.workspaces.get(ws.id).catch(() => ws);
    setSelectedWorkspace(fresh);
    setMemberPortalActive(false);
    if (fresh.boards && fresh.boards.length > 0) {
      setSelectedBoard({ id: fresh.boards[0].id, name: fresh.boards[0].name, workspaceId: fresh.id });
      setPage("board");
    } else {
      setPage("workspace-detail");
    }
  };

  const userRole =
    selectedWorkspace?.members?.find((m) => m.user?.id === user.id || m.userId === user.id)?.role ||
    (isSystemAdmin ? "ADMIN" : "MEMBER");

  // Show feedback modal when triggered on member login or manually from Feedback button
  const shouldShowFeedback = showFeedbackPrompt && (memberPortalActive === false || isSystemAdmin);

  if (!isSystemAdmin && memberPortalActive) {
    return (
      <>
        <ProjectPortal onEnterWorkspace={handleMemberEnterWorkspace} />
        {showFeedbackPrompt && (
          <FeedbackModal
            projects={myWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
            onClose={clearFeedbackPrompt}
          />
        )}
      </>
    );
  }

  return (
    <Layout
      currentPage={page}
      onNavigate={(p) => setPage(p)}
      onSwitchPortal={() => setMemberPortalActive(true)}
      boardName={selectedBoard && page === "board" ? selectedBoard.name : undefined}
      workspaceName={selectedWorkspace?.name}
      pendingRequestsCount={pendingCount}
    >
      {page === "admin-lobby" && isSystemAdmin && (
        <AdminLobby
          onSelectWorkspace={handleSelectWorkspace}
          onSelectBoard={(bId, wsId, bName, wsObj) => handleSelectBoard(bId, wsId, bName || "Board", wsObj)}
          onPendingCountChange={setPendingCount}
        />
      )}

      {page === "workspaces" && (
        <Dashboard
          onSelectWorkspace={handleSelectWorkspace}
          onSelectBoard={(bId, wsId) => {
            const ws = myWorkspaces.find((w) => w.id === wsId);
            const board = ws?.boards.find((b) => b.id === bId);
            handleSelectBoard(bId, wsId, board?.name || "Board");
          }}
        />
      )}

      {page === "workspace-detail" && selectedWorkspace && (
        <WorkspacePage
          workspace={selectedWorkspace}
          onSelectBoard={(bId) => {
            const board = selectedWorkspace.boards.find((b) => b.id === bId);
            handleSelectBoard(bId, selectedWorkspace.id, board?.name || "Board");
          }}
          userRole={userRole}
          currentUserId={user.id}
        />
      )}

      {page === "board" && selectedBoard && (
        <KanbanBoard
          boardId={selectedBoard.id}
          workspaceId={selectedBoard.workspaceId}
          onManageWorkspace={() => {
            if (selectedWorkspace) setPage("workspace-detail");
          }}
        />
      )}

      {shouldShowFeedback && (
        <FeedbackModal
          projects={myWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
          defaultWorkspaceId={selectedWorkspace?.id || myWorkspaces[0]?.id}
          onClose={clearFeedbackPrompt}
        />
      )}
    </Layout>
  );
}

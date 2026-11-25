import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "./store/authStore";
import { api } from "./lib/api";
import { connectSocket } from "./lib/socket";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ProjectPortal from "./pages/ProjectPortal";
import AdminLobby from "./pages/AdminLobby";
import MemberLobby from "./pages/MemberLobby";
import Dashboard from "./pages/Dashboard";
import KanbanBoard from "./pages/KanbanBoard";
import WorkspacePage from "./pages/WorkspacePage";
import Layout from "./components/Layout";
import type { NavPage } from "./components/Layout";
import type { TaskModalTab } from "./components/TaskModal";
import FeedbackModal from "./components/FeedbackModal";
import type { ChatContextLink, Workspace } from "./lib/api";

export default function App() {
  const { token, user, logout, showFeedbackPrompt, clearFeedbackPrompt } = useAuthStore();

  const isSystemAdmin = user?.systemRole === "ADMIN";
  const [page, setPage] = useState<NavPage>("admin-lobby");
  const [memberPortalActive, setMemberPortalActive] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState<{ id: string; name: string; workspaceId: string } | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingHandoffsCount, setPendingHandoffsCount] = useState(0);
  const [deepLinkTask, setDeepLinkTask] = useState<{ taskId: string; tab?: TaskModalTab } | null>(null);
  // Show login form (overlaid on home page) when user clicks Sign In
  const [showLogin, setShowLogin] = useState(false);

  const loadPendingHandoffs = useCallback(() => {
    if (!token) return;
    api.handoffs
      .listPending()
      .then((list) => setPendingHandoffsCount(list.length))
      .catch(() => {});
  }, [token]);

  // Sync user's workspaces on login & set initial lobby based on systemRole
  useEffect(() => {
    if (!token || !user) return;
    setMemberPortalActive(false);
    setPage(user.systemRole === "ADMIN" ? "admin-lobby" : "member-lobby");
    api.auth
      .me()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("deactivated") || msg.includes("unauthorized")) {
          logout();
        }
      });
    api.workspaces
      .list()
      .then(setMyWorkspaces)
      .catch(() => setMyWorkspaces([]));
    loadPendingHandoffs();
  }, [token, user, loadPendingHandoffs, logout]);

  // Real-time notifications for handoffs, workspaces & forced account deactivation
  useEffect(() => {
    if (!token || !user) return;
    const socket = connectSocket();
    const refreshWorkspaces = () => {
      api.workspaces
        .list()
        .then(setMyWorkspaces)
        .catch(() => {});
    };
    const refreshHandoffs = () => loadPendingHandoffs();
    const onWorkspaceDeleted = ({ workspaceId }: { workspaceId: string }) => {
      refreshWorkspaces();
      setSelectedWorkspace((curr) => (curr?.id === workspaceId ? null : curr));
      setSelectedBoard((curr) => (curr?.workspaceId === workspaceId ? null : curr));
      setPage((currPage) => {
        if (currPage === "workspace-detail" || currPage === "board") {
          return user.systemRole === "ADMIN" ? "admin-lobby" : "member-lobby";
        }
        return currPage;
      });
    };
    const onDeactivated = () => {
      alert("Your account has been deactivated by an administrator.");
      logout();
    };
    socket.on("handoff_created", refreshHandoffs);
    socket.on("handoff_acknowledged", refreshHandoffs);
    socket.on("workspace_deleted", onWorkspaceDeleted);
    socket.on("member_added", refreshWorkspaces);
    socket.on("member_removed", refreshWorkspaces);
    socket.on("join_request_approved", refreshWorkspaces);
    socket.on("account_deactivated", onDeactivated);
    return () => {
      socket.off("handoff_created", refreshHandoffs);
      socket.off("handoff_acknowledged", refreshHandoffs);
      socket.off("workspace_deleted", onWorkspaceDeleted);
      socket.off("member_added", refreshWorkspaces);
      socket.off("member_removed", refreshWorkspaces);
      socket.off("join_request_approved", refreshWorkspaces);
      socket.off("account_deactivated", onDeactivated);
    };
  }, [token, user, loadPendingHandoffs, logout]);

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
              <LoginPage embedded />
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
    workspaceObj?: Workspace,
    taskId?: string,
    initialTab?: TaskModalTab
  ) => {
    const ws = workspaceObj || myWorkspaces.find((w) => w.id === workspaceId) || selectedWorkspace;
    if (ws) setSelectedWorkspace(ws);
    setSelectedBoard({ id: boardId, name: boardName, workspaceId });
    setDeepLinkTask(taskId ? { taskId, tab: initialTab } : null);
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

  const handleWorkspaceListChanged = () => {
    api.workspaces
      .list()
      .then(setMyWorkspaces)
      .catch(() => {});
  };

  const handleDeletedWorkspace = (deletedId: string) => {
    setMyWorkspaces((prev) => prev.filter((w) => w.id !== deletedId));
    if (selectedWorkspace?.id === deletedId) setSelectedWorkspace(null);
    if (selectedBoard?.workspaceId === deletedId) setSelectedBoard(null);
    setPage(isSystemAdmin ? "admin-lobby" : "member-lobby");
  };

  const handleChatNavigate = (link: ChatContextLink) => {
    if (link.type === "admin-users" && isSystemAdmin) {
      setPage("admin-lobby");
      return;
    }
    if (link.boardId && link.workspaceId) {
      const ws = myWorkspaces.find((w) => w.id === link.workspaceId);
      const bName = ws?.boards?.find((b) => b.id === link.boardId)?.name || "Board";
      handleSelectBoard(link.boardId, link.workspaceId, bName, ws, link.taskId, link.tab);
    } else if (link.workspaceId) {
      const ws = myWorkspaces.find((w) => w.id === link.workspaceId);
      if (ws) handleSelectWorkspace(ws);
    }
  };

  return (
    <Layout
      currentPage={page}
      onNavigate={(p) => setPage(p)}
      onSwitchPortal={() => setMemberPortalActive(true)}
      boardName={selectedBoard && page === "board" ? selectedBoard.name : undefined}
      workspaceName={selectedWorkspace?.name}
      activeWorkspaceId={selectedWorkspace?.id || selectedBoard?.workspaceId}
      workspaces={myWorkspaces}
      onChatNavigate={handleChatNavigate}
      pendingRequestsCount={pendingCount}
      pendingHandoffsCount={pendingHandoffsCount}
    >
      {page === "admin-lobby" && isSystemAdmin && (
        <AdminLobby
          onSelectWorkspace={handleSelectWorkspace}
          onSelectBoard={(bId, wsId, bName, wsObj, taskId, tabName) =>
            handleSelectBoard(bId, wsId, bName || "Board", wsObj, taskId, tabName)
          }
          onPendingCountChange={setPendingCount}
          onWorkspaceListChanged={handleWorkspaceListChanged}
          onDeletedWorkspace={handleDeletedWorkspace}
        />
      )}

      {page === "member-lobby" && (
        <MemberLobby
          onSelectWorkspace={handleSelectWorkspace}
          onSelectBoard={(bId, wsId, bName, wsObj, taskId, tabName) =>
            handleSelectBoard(bId, wsId, bName || "Board", wsObj, taskId, tabName)
          }
          onWorkspaceListChanged={handleWorkspaceListChanged}
          onDeletedWorkspace={handleDeletedWorkspace}
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
          onWorkspaceListChanged={handleWorkspaceListChanged}
          onDeletedWorkspace={handleDeletedWorkspace}
        />
      )}

      {page === "workspace-detail" && selectedWorkspace && (
        <WorkspacePage
          workspace={selectedWorkspace}
          onSelectBoard={(bId) => {
            const board = selectedWorkspace.boards.find((b) => b.id === bId);
            handleSelectBoard(bId, selectedWorkspace.id, board?.name || "Board");
          }}
          onDeletedWorkspace={handleDeletedWorkspace}
          userRole={userRole}
          currentUserId={user.id}
        />
      )}

      {page === "board" && selectedBoard && (
        <KanbanBoard
          boardId={selectedBoard.id}
          workspaceId={selectedBoard.workspaceId}
          initialTaskId={deepLinkTask?.taskId}
          initialTaskTab={deepLinkTask?.tab}
          onInitialTaskConsumed={() => setDeepLinkTask(null)}
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

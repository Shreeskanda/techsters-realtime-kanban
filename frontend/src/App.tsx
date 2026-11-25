import React, { useState } from "react";
import { useAuthStore } from "./store/authStore";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import KanbanBoard from "./pages/KanbanBoard";
import WorkspacePage from "./pages/WorkspacePage";
import Layout from "./components/Layout";
import type { Workspace } from "./lib/api";

type Page = "dashboard" | "workspaces" | "board" | "workspace-detail";

export default function App() {
  const { token, user } = useAuthStore();

  const [page, setPage] = useState<Page>("dashboard");
  const [selectedBoard, setSelectedBoard] = useState<{ id: string; workspaceId: string } | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  if (!token || !user) return <LoginPage />;

  const handleSelectBoard = (boardId: string, workspaceId: string) => {
    setSelectedBoard({ id: boardId, workspaceId });
    setSelectedWorkspaceId(workspaceId);
    setPage("board");
  };

  const handleSelectWorkspace = (ws: Workspace) => {
    setSelectedWorkspace(ws);
    setSelectedWorkspaceId(ws.id);
    setPage("workspace-detail");
  };

  const userRole = selectedWorkspace?.members?.find(
    (m) => m.user.id === user.id || m.userId === user.id
  )?.role || "MEMBER";

  return (
    <Layout
      currentPage={page}
      onNavigate={(p) => setPage(p)}
      boardName={selectedBoard && page === "board" ? "Active Board" : undefined}
      workspaceName={selectedWorkspace?.name}
    >
      {page === "dashboard" && (
        <Dashboard
          onSelectWorkspace={handleSelectWorkspace}
          onSelectBoard={handleSelectBoard}
        />
      )}
      {page === "workspaces" && (
        <Dashboard
          onSelectWorkspace={handleSelectWorkspace}
          onSelectBoard={handleSelectBoard}
        />
      )}
      {page === "workspace-detail" && selectedWorkspace && (
        <WorkspacePage
          workspace={selectedWorkspace}
          onSelectBoard={(boardId) => handleSelectBoard(boardId, selectedWorkspace.id)}
          userRole={userRole}
          currentUserId={user.id}
        />
      )}
      {page === "board" && selectedBoard && (
        <KanbanBoard
          boardId={selectedBoard.id}
          workspaceId={selectedBoard.workspaceId}
        />
      )}
    </Layout>
  );
}

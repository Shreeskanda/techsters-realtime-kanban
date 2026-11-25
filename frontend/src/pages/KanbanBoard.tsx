import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { Board, Task, WorkspaceMember } from "../lib/api";
import TaskModal, { type TaskModalTab } from "../components/TaskModal";
import CreateTaskModal from "../components/CreateTaskModal";
import HealthPulse from "../components/HealthPulse";
import { useAuthStore } from "../store/authStore";

interface Props {
  boardId: string;
  workspaceId: string;
  initialTaskId?: string;
  initialTaskTab?: TaskModalTab;
  onInitialTaskConsumed?: () => void;
  onManageWorkspace?: () => void;
}

export default function KanbanBoard({
  boardId,
  workspaceId,
  initialTaskId,
  initialTaskTab,
  onInitialTaskConsumed,
  onManageWorkspace,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("VIEWER");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedTaskTab, setSelectedTaskTab] = useState<TaskModalTab>("overview");
  const [showCreateTask, setShowCreateTask] = useState<string | null>(null);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [showHealthDrawer, setShowHealthDrawer] = useState(false);
  const [handoffSuggestionTask, setHandoffSuggestionTask] = useState<Task | null>(null);

  const dragTask = useRef<{ taskId: string; fromColumnId: string } | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const b = await api.boards.get(boardId);
      setBoard(b);
      if (b.workspace) {
        const me = b.workspace.members?.find(
          (m: WorkspaceMember) => m.userId === user?.id || m.user?.id === user?.id
        );
        setUserRole(me?.role || "VIEWER");
      }
      if (initialTaskId) {
        for (const col of b.columns) {
          const match = col.tasks.find((t) => t.id === initialTaskId);
          if (match) {
            setSelectedTask(match);
            setSelectedTaskTab(initialTaskTab || "overview");
            onInitialTaskConsumed?.();
            break;
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, user?.id, initialTaskId, initialTaskTab, onInitialTaskConsumed]);

  useEffect(() => {
    setLoading(true);
    loadBoard();
  }, [loadBoard]);

  // Socket.IO real-time synchronization
  useEffect(() => {
    const socket = connectSocket();
    socket.emit("join_workspace", { workspaceId });

    const onTaskCreated = ({ task }: { task: Task }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) => {
            if (col.id !== task.columnId) return col;
            if (col.tasks.some((t) => t.id === task.id)) return col;
            return { ...col, tasks: [...col.tasks, task] };
          }),
        };
      });
    };

    const onTaskUpdated = ({ task }: { task: Task }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
          })),
        };
      });
      setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, ...task } : prev));
    };

    const onTaskMoved = ({ task }: { task: Task }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) => {
            if (col.id === task.columnId) {
              const exists = col.tasks.find((t) => t.id === task.id);
              return exists
                ? { ...col, tasks: col.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)) }
                : { ...col, tasks: [...col.tasks.filter((t) => t.id !== task.id), task] };
            }
            return { ...col, tasks: col.tasks.filter((t) => t.id !== task.id) };
          }),
        };
      });
      setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, ...task } : prev));
    };

    const onTaskDeleted = ({ taskId }: { taskId: string }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) => ({
            ...col,
            tasks: col.tasks.filter((t) => t.id !== taskId),
          })),
        };
      });
      setSelectedTask((prev) => (prev && prev.id === taskId ? null : prev));
    };

    const onNewComment = ({ taskId }: { taskId: string }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    _count: {
                      comments: (t._count?.comments || 0) + 1,
                      memoryEntries: t._count?.memoryEntries || 0,
                    },
                  }
                : t
            ),
          })),
        };
      });
    };

    const onMemoryUpdated = ({ taskId }: { taskId: string }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    _count: {
                      comments: t._count?.comments || 0,
                      memoryEntries: (t._count?.memoryEntries || 0) + 1,
                    },
                  }
                : t
            ),
          })),
        };
      });
    };

    const refreshBoard = () => loadBoard();

    socket.on("task_created", onTaskCreated);
    socket.on("task_updated", onTaskUpdated);
    socket.on("task_moved", onTaskMoved);
    socket.on("task_deleted", onTaskDeleted);
    socket.on("new_comment", onNewComment);
    socket.on("task_memory_updated", onMemoryUpdated);
    socket.on("blocker_created", refreshBoard);
    socket.on("blocker_updated", refreshBoard);
    socket.on("blocker_resolved", refreshBoard);
    socket.on("blocker_created_meta", refreshBoard);
    socket.on("blocker_updated_meta", refreshBoard);
    socket.on("blocker_resolved_meta", refreshBoard);
    socket.on("handoff_created", refreshBoard);
    socket.on("handoff_acknowledged", refreshBoard);
    socket.on("member_added", refreshBoard);
    socket.on("member_updated", refreshBoard);
    socket.on("member_removed", refreshBoard);

    return () => {
      socket.off("task_created", onTaskCreated);
      socket.off("task_updated", onTaskUpdated);
      socket.off("task_moved", onTaskMoved);
      socket.off("task_deleted", onTaskDeleted);
      socket.off("new_comment", onNewComment);
      socket.off("task_memory_updated", onMemoryUpdated);
      socket.off("blocker_created", refreshBoard);
      socket.off("blocker_updated", refreshBoard);
      socket.off("blocker_resolved", refreshBoard);
      socket.off("blocker_created_meta", refreshBoard);
      socket.off("blocker_updated_meta", refreshBoard);
      socket.off("blocker_resolved_meta", refreshBoard);
      socket.off("handoff_created", refreshBoard);
      socket.off("handoff_acknowledged", refreshBoard);
      socket.off("member_added", refreshBoard);
      socket.off("member_updated", refreshBoard);
      socket.off("member_removed", refreshBoard);
      socket.emit("leave_workspace", { workspaceId });
    };
  }, [workspaceId, loadBoard]);

  const handleDragStart = (taskId: string, fromColumnId: string) => {
    dragTask.current = { taskId, fromColumnId };
  };

  const handleDrop = async (toColumnId: string) => {
    setDragOverColId(null);
    if (!dragTask.current || dragTask.current.fromColumnId === toColumnId) {
      dragTask.current = null;
      return;
    }
    const { taskId, fromColumnId } = dragTask.current;
    dragTask.current = null;

    let movedTaskSnapshot: Task | undefined;

    // Optimistic UI move
    setBoard((b) => {
      if (!b) return b;
      const cols = b.columns.map((col) => {
        if (col.id === fromColumnId || col.tasks.some((t) => t.id === taskId)) {
          const found = col.tasks.find((t) => t.id === taskId);
          if (found) movedTaskSnapshot = found;
          return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
        }
        return col;
      });
      return {
        ...b,
        columns: cols.map((col) =>
          col.id === toColumnId && movedTaskSnapshot
            ? { ...col, tasks: [...col.tasks, { ...movedTaskSnapshot, columnId: toColumnId }] }
            : col
        ),
      };
    });

    try {
      const updated = await api.tasks.update(taskId, { columnId: toColumnId, workspaceId });
      const targetCol = board?.columns.find((c) => c.id === toColumnId);
      if (targetCol && /\b(review|qa|testing|handoff)\b/i.test(targetCol.name)) {
        setHandoffSuggestionTask({ ...(movedTaskSnapshot || updated), ...updated, columnId: toColumnId });
        setTimeout(() => setHandoffSuggestionTask(null), 9000);
      }
    } catch {
      loadBoard();
    }
  };

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    await api.boards.addColumn(boardId, newColName.trim());
    setNewColName("");
    setAddingCol(false);
    loadBoard();
  };

  if (loading) return <div className="page" style={{ color: "var(--text-secondary)" }}>Loading Kanban board...</div>;
  if (!board) return <div className="page" style={{ color: "var(--accent-red)" }}>Board not found or access denied.</div>;

  const priorityBadgeClass: Record<string, string> = {
    LOW: "badge-gray",
    MEDIUM: "badge-orange",
    HIGH: "badge-purple",
    URGENT: "badge-red",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Board Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{board.name}</h1>
            <span className={`role-chip-${userRole}`}>{userRole}</span>
          </div>
          {board.description && (
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>{board.description}</p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            className="input sm"
            style={{ width: 175 }}
            placeholder="Filter tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="input sm"
            style={{ width: 115 }}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="ALL">All Priority</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <button
            className={`btn btn-sm ${showHealthDrawer ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowHealthDrawer((v) => !v)}
          >
            ♥ Health Pulse
          </button>

          {onManageWorkspace && (
            <button className="btn btn-secondary btn-sm" onClick={onManageWorkspace}>
              Workspace &amp; Team
            </button>
          )}
          {userRole !== "VIEWER" && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => api.workspaces.export(workspaceId).catch(console.error)}
            >
              Export CSV
            </button>
          )}
          {userRole !== "VIEWER" && board.columns[0] && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTask(board.columns[0].id)}>
              + Add Task
            </button>
          )}
        </div>
      </div>

      {userRole === "VIEWER" && (
        <div
          style={{
            padding: "8px 24px",
            background: "rgba(139,148,158,0.08)",
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          👁 Read-only Viewer permissions active — task edits, drag-and-drop moves, memory entries, blockers, handoffs, and comments are disabled.
        </div>
      )}

      {/* Automated Handoff Suggestion Banner when moved to Review/QA */}
      {handoffSuggestionTask && userRole !== "VIEWER" && (
        <div
          className="alert alert-info"
          style={{ margin: "12px 24px 0", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>
            ⇄ <strong>{handoffSuggestionTask.title}</strong> moved to a review stage. Capture context via Auto Handoff Mode for the reviewer?
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setSelectedTask(handoffSuggestionTask);
                setSelectedTaskTab("handoffs");
                setHandoffSuggestionTask(null);
              }}
            >
              Create Handoff →
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setHandoffSuggestionTask(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Optional Inline Project Health Pulse Drawer */}
      {showHealthDrawer && (
        <div style={{ padding: "16px 24px 0" }}>
          <HealthPulse workspaceId={workspaceId} canSnapshot={userRole === "ADMIN"} compact />
        </div>
      )}

      {/* Kanban Columns */}
      <div className="kanban-scroll">
        {board.columns.map((col) => {
          const visibleTasks = col.tasks.filter((task) => {
            const matchesSearch =
              !searchQuery.trim() ||
              task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (task.labels || []).some((l) => l.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesPrio = priorityFilter === "ALL" || task.priority === priorityFilter;
            return matchesSearch && matchesPrio;
          });

          return (
            <div
              key={col.id}
              className={`kanban-col ${dragOverColId === col.id ? "drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (userRole !== "VIEWER" && dragOverColId !== col.id) setDragOverColId(col.id);
              }}
              onDragLeave={() => {
                if (dragOverColId === col.id) setDragOverColId(null);
              }}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="kanban-col-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="kanban-col-title">{col.name}</span>
                  <span className="kanban-col-count">{visibleTasks.length}</span>
                </div>
                {userRole !== "VIEWER" && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "2px 7px", fontSize: 16 }}
                    onClick={() => setShowCreateTask(col.id)}
                    title={`Add task to ${col.name}`}
                  >
                    +
                  </button>
                )}
              </div>

              <div className="kanban-col-body">
                {visibleTasks.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "24px 10px",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      border: "1px dashed var(--border-subtle)",
                      borderRadius: 6,
                    }}
                  >
                    No tasks
                  </div>
                ) : (
                  visibleTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable={userRole !== "VIEWER"}
                      onDragStart={() => handleDragStart(task.id, col.id)}
                      onClick={() => {
                        setSelectedTaskTab("overview");
                        setSelectedTask(task);
                      }}
                      className="task-card"
                    >
                      {task.labels?.length > 0 && (
                        <div className="task-labels">
                          {task.labels.map((label) => (
                            <span key={label} className="task-label">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="task-card-title">{task.title}</div>

                      {/* TechSters 2.0 Context Indicators */}
                      {((task.openBlockersCount || 0) > 0 || (task.unreadHandoffsCount || 0) > 0) && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          {(task.openBlockersCount || 0) > 0 && (
                            <span className="badge badge-red" style={{ fontSize: 10 }}>
                              ⚠ {task.openBlockersCount} Blocker{(task.openBlockersCount || 0) > 1 ? "s" : ""}
                            </span>
                          )}
                          {(task.unreadHandoffsCount || 0) > 0 && (
                            <span className="badge badge-purple" style={{ fontSize: 10 }}>
                              ⇄ Unread Handoff
                            </span>
                          )}
                        </div>
                      )}

                      <div className="task-card-meta">
                        <span className={`badge ${priorityBadgeClass[task.priority] || "badge-gray"}`} style={{ fontSize: 10 }}>
                          <span className={`priority-dot priority-${task.priority}`} />
                          {task.priority}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-secondary)" }}>
                          {task.dueDate && (
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                          )}
                          {(task._count?.memoryEntries ?? 0) > 0 && (
                            <span title="Task Memory Capsule entries">◈ {task._count?.memoryEntries}</span>
                          )}
                          {(task._count?.comments ?? 0) > 0 && (
                            <span>💬 {task._count?.comments}</span>
                          )}
                          {task.assignee && (
                            <span
                              title={`Assigned to ${task.assignee.name}`}
                              className="user-avatar"
                              style={{ width: 22, height: 22, fontSize: 10 }}
                            >
                              {task.assignee.name[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}

        {/* Add Column (ADMIN / MEMBER) */}
        {userRole !== "VIEWER" && (
          <div style={{ width: 280, flexShrink: 0 }}>
            {addingCol ? (
              <form onSubmit={handleAddColumn} className="card" style={{ padding: 12 }}>
                <input
                  className="input sm"
                  placeholder="Column title (e.g. QA REVIEW)"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  autoFocus
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }}>
                    Add Column
                  </button>
                  <button type="button" onClick={() => setAddingCol(false)} className="btn btn-secondary btn-sm">
                    ×
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddingCol(true)}
                style={{
                  width: "100%",
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                + Add Column
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          workspaceId={workspaceId}
          userRole={userRole}
          columns={board.columns}
          members={board.workspace?.members || []}
          initialTab={selectedTaskTab}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            setBoard((b) => {
              if (!b) return b;
              const wasCol = b.columns.find((c) => c.tasks.some((t) => t.id === updated.id))?.id;
              if (wasCol && wasCol !== updated.columnId) {
                return {
                  ...b,
                  columns: b.columns.map((col) => {
                    if (col.id === updated.columnId) {
                      return { ...col, tasks: [...col.tasks.filter((t) => t.id !== updated.id), updated] };
                    }
                    return { ...col, tasks: col.tasks.filter((t) => t.id !== updated.id) };
                  }),
                };
              }
              return {
                ...b,
                columns: b.columns.map((col) => ({
                  ...col,
                  tasks: col.tasks.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
                })),
              };
            });
            setSelectedTask(updated);
          }}
          onDelete={(id) => {
            setBoard((b) => {
              if (!b) return b;
              return {
                ...b,
                columns: b.columns.map((col) => ({ ...col, tasks: col.tasks.filter((t) => t.id !== id) })),
              };
            });
            setSelectedTask(null);
          }}
        />
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
        <CreateTaskModal
          columnId={showCreateTask}
          workspaceId={workspaceId}
          members={board.workspace?.members || []}
          onClose={() => setShowCreateTask(null)}
          onCreate={(task) => {
            setBoard((b) => {
              if (!b) return b;
              return {
                ...b,
                columns: b.columns.map((col) =>
                  col.id === task.columnId && !col.tasks.some((t) => t.id === task.id)
                    ? { ...col, tasks: [...col.tasks, task] }
                    : col
                ),
              };
            });
            setShowCreateTask(null);
          }}
        />
      )}
    </div>
  );
}

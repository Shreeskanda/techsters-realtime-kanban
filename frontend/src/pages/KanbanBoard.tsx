import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { getSocket, connectSocket } from "../lib/socket";
import type { Board, Task, Column } from "../lib/api";
import TaskModal from "../components/TaskModal";
import CreateTaskModal from "../components/CreateTaskModal";
import { useAuthStore } from "../store/authStore";

interface Props {
  boardId: string;
  workspaceId: string;
}

export default function KanbanBoard({ boardId, workspaceId }: Props) {
  const user = useAuthStore((s) => s.user);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("VIEWER");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState<string | null>(null); // columnId
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");

  // Drag state
  const dragTask = useRef<{ taskId: string; fromColumnId: string } | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const b = await api.boards.get(boardId);
      setBoard(b);
      if (b.workspace) {
        const me = b.workspace.members?.find((m: any) => m.userId === user?.id || m.user?.id === user?.id);
        setUserRole(me?.role || "VIEWER");
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, user?.id]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Socket.IO real-time
  useEffect(() => {
    const socket = connectSocket();
    socket.emit("join_workspace", { workspaceId });

    const onTaskCreated = ({ task }: { task: Task }) => {
      setBoard((b) => {
        if (!b) return b;
        return {
          ...b,
          columns: b.columns.map((col) =>
            col.id === task.columnId ? { ...col, tasks: [...col.tasks, task] } : col
          ),
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
                ? { ...col, tasks: col.tasks.map((t) => (t.id === task.id ? task : t)) }
                : { ...col, tasks: [...col.tasks.filter((t) => t.id !== task.id), task] };
            }
            return { ...col, tasks: col.tasks.filter((t) => t.id !== task.id) };
          }),
        };
      });
    };

    const onTaskDeleted = ({ taskId }: { taskId: string }) => {
      setBoard((b) => {
        if (!b) return b;
        return { ...b, columns: b.columns.map((col) => ({ ...col, tasks: col.tasks.filter((t) => t.id !== taskId) })) };
      });
    };

    socket.on("task_created", onTaskCreated);
    socket.on("task_updated", onTaskUpdated);
    socket.on("task_moved", onTaskMoved);
    socket.on("task_deleted", onTaskDeleted);

    return () => {
      socket.off("task_created", onTaskCreated);
      socket.off("task_updated", onTaskUpdated);
      socket.off("task_moved", onTaskMoved);
      socket.off("task_deleted", onTaskDeleted);
      socket.emit("leave_workspace", { workspaceId });
    };
  }, [workspaceId]);

  // Drag handlers
  const handleDragStart = (taskId: string, fromColumnId: string) => {
    dragTask.current = { taskId, fromColumnId };
  };

  const handleDrop = async (toColumnId: string) => {
    if (!dragTask.current || dragTask.current.fromColumnId === toColumnId) return;
    const { taskId } = dragTask.current;
    dragTask.current = null;

    // Optimistic UI update
    setBoard((b) => {
      if (!b) return b;
      let movedTask: Task | undefined;
      const cols = b.columns.map((col) => {
        if (col.id === dragTask.current?.fromColumnId || col.tasks.find((t) => t.id === taskId)) {
          movedTask = col.tasks.find((t) => t.id === taskId);
          return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
        }
        return col;
      });
      return {
        ...b,
        columns: cols.map((col) =>
          col.id === toColumnId && movedTask
            ? { ...col, tasks: [...col.tasks, { ...movedTask, columnId: toColumnId }] }
            : col
        ),
      };
    });

    try {
      await api.tasks.update(taskId, { columnId: toColumnId, workspaceId });
    } catch {
      loadBoard(); // revert on error
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

  const priorityColors: Record<string, string> = {
    LOW: "bg-slate-700 text-slate-400",
    MEDIUM: "bg-yellow-900/60 text-yellow-300",
    HIGH: "bg-orange-900/60 text-orange-300",
    URGENT: "bg-red-900/60 text-red-300",
  };

  if (loading) return <div className="flex-1 p-6 text-center text-slate-400">Loading board...</div>;
  if (!board) return <div className="flex-1 p-6 text-center text-red-400">Board not found</div>;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Board header */}
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">{board.name}</h1>
          {board.description && <p className="text-slate-400 text-sm">{board.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 bg-slate-700 px-3 py-1 rounded-full">
            Role: <span className="text-blue-400 font-medium">{userRole}</span>
          </span>
          {userRole !== "VIEWER" && (
            <button onClick={() => setShowCreateTask(board.columns[0]?.id)} className="btn-primary text-sm">
              + Add Task
            </button>
          )}
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full" style={{ minHeight: "400px" }}>
          {board.columns.map((col) => (
            <div
              key={col.id}
              className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 w-72 flex-shrink-0 flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.id)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-200 text-sm">{col.name}</h3>
                  <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{col.tasks.length}</span>
                </div>
                {userRole !== "VIEWER" && (
                  <button
                    onClick={() => setShowCreateTask(col.id)}
                    className="text-slate-500 hover:text-blue-400 transition-colors text-lg leading-none"
                  >
                    +
                  </button>
                )}
              </div>

              {/* Task cards */}
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                {col.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable={userRole !== "VIEWER"}
                    onDragStart={() => handleDragStart(task.id, col.id)}
                    onClick={() => setSelectedTask(task)}
                    className="bg-slate-900 border border-slate-700 hover:border-blue-600 rounded-lg p-3 cursor-pointer transition-all group"
                  >
                    {/* Labels */}
                    {task.labels?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {task.labels.map((label) => (
                          <span key={label} className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-sm font-medium text-slate-200 group-hover:text-white mb-2 line-clamp-2">
                      {task.title}
                    </p>

                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {task._count?.comments ? (
                          <span>💬 {task._count.comments}</span>
                        ) : null}
                        {task.assignee && (
                          <span
                            title={task.assignee.name}
                            className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold"
                          >
                            {task.assignee.name[0]}
                          </span>
                        )}
                      </div>
                    </div>

                    {task.dueDate && (
                      <div className="mt-2 text-xs text-slate-500">
                        📅 {new Date(task.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add column */}
          {userRole === "ADMIN" && (
            <div className="w-72 flex-shrink-0">
              {addingCol ? (
                <form onSubmit={handleAddColumn} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                  <input
                    className="input text-sm mb-2"
                    placeholder="Column name..."
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm flex-1">Add</button>
                    <button type="button" onClick={() => setAddingCol(false)} className="btn-secondary text-sm">×</button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAddingCol(true)}
                  className="w-full border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-3 text-slate-500 hover:text-blue-400 transition-colors text-sm"
                >
                  + Add Column
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          workspaceId={workspaceId}
          userRole={userRole}
          members={board.workspace?.members || []}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            setBoard((b) => {
              if (!b) return b;
              return {
                ...b,
                columns: b.columns.map((col) => ({
                  ...col,
                  tasks: col.tasks.map((t) => (t.id === updated.id ? updated : t)),
                })),
              };
            });
            setSelectedTask(updated);
          }}
          onDelete={(id) => {
            setBoard((b) => {
              if (!b) return b;
              return { ...b, columns: b.columns.map((col) => ({ ...col, tasks: col.tasks.filter((t) => t.id !== id) })) };
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
                  col.id === task.columnId ? { ...col, tasks: [...col.tasks, task] } : col
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

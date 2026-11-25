import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import { useAuthStore } from "../store/authStore";
import { formatDurationSince } from "./CollaborationWidgets";
import type {
  Task,
  Comment,
  WorkspaceMember,
  Column,
  TaskMemoryEntry,
  TaskBlocker,
  TaskHandoff,
  TaskTimelineItem,
  BlockerType,
  BlockerSeverity,
  BlockerPrivacy,
} from "../lib/api";

export type TaskModalTab = "overview" | "memory" | "blockers" | "handoffs" | "activity";

interface Props {
  task: Task;
  workspaceId: string;
  userRole: string;
  columns: Column[];
  members: WorkspaceMember[];
  initialTab?: TaskModalTab;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}

const BLOCKER_OPTIONS: { value: BlockerType; label: string }[] = [
  { value: "STUCK", label: "I am stuck" },
  { value: "TECHNICAL_ASSISTANCE", label: "I need technical assistance" },
  { value: "WAITING_FOR_PERSON", label: "I am waiting for another person" },
  { value: "UNCLEAR_REQUIREMENTS", label: "Requirements are unclear" },
  { value: "NEEDS_RESOURCES", label: "I need additional resources" },
];

const BLOCKER_LABEL_MAP: Record<string, string> = Object.fromEntries(
  BLOCKER_OPTIONS.map((o) => [o.value, o.label])
);

const PRIVACY_LABELS: Record<BlockerPrivacy, string> = {
  REPORTER_AND_ADMINS: "Silent (Only Admins & Reporter see blocker)",
  PRIVATE_ADMINS: "Protected (Status visible to team; explanation only for Admins & Reporter)",
  TEAM: "Team Visible (All workspace members can view details)",
};

export default function TaskModal({
  task,
  workspaceId,
  userRole,
  columns,
  members,
  initialTab = "overview",
  onClose,
  onUpdate,
  onDelete,
}: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<TaskModalTab>(initialTab);

  // Overview / Edit state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    columnId: task.columnId,
    dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    expectedHours: task.expectedHours ? String(task.expectedHours) : "",
    labels: (task.labels || []).join(", "),
    assigneeId: task.assigneeId || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  // Task Memory Capsule state
  const [memories, setMemories] = useState<TaskMemoryEntry[]>([]);
  const [memoryForm, setMemoryForm] = useState({
    originalProblem: "",
    expectedOutcome: "",
    workCompleted: "",
    approachesAttempted: "",
    technicalDecisions: "",
    outstandingQuestions: "",
    nextRecommendedAction: "",
    supportingLinksText: "",
  });
  const [savingMemory, setSavingMemory] = useState(false);
  const [memoryErr, setMemoryErr] = useState("");

  // Silent Blocker Radar state
  const [blockers, setBlockers] = useState<TaskBlocker[]>([]);
  const [blockerForm, setBlockerForm] = useState({
    type: "STUCK" as BlockerType,
    severity: "MEDIUM" as BlockerSeverity,
    privacy: "PRIVATE_ADMINS" as BlockerPrivacy,
    explanation: "",
  });
  const [savingBlocker, setSavingBlocker] = useState(false);
  const [blockerErr, setBlockerErr] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  // Auto Handoff Mode state
  const [handoffs, setHandoffs] = useState<TaskHandoff[]>([]);
  const [handoffForm, setHandoffForm] = useState({
    toUserId: "",
    completedSummary: "",
    remainingWork: "",
    problemsEncountered: "",
    technicalDecisions: "",
    firstStepRecommended: "",
    importantLinksText: "",
  });
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [handoffErr, setHandoffErr] = useState("");
  const [ackNotes, setAckNotes] = useState<Record<string, string>>({});
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [expandedCapsuleInHandoff, setExpandedCapsuleInHandoff] = useState<string | null>(null);

  // Comments + Unified Timeline state
  const [comments, setComments] = useState<Comment[]>([]);
  const [timeline, setTimeline] = useState<TaskTimelineItem[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const isViewer = userRole === "VIEWER";

  useEffect(() => {
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      columnId: task.columnId,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      expectedHours: task.expectedHours ? String(task.expectedHours) : "",
      labels: (task.labels || []).join(", "),
      assigneeId: task.assigneeId || "",
    });
  }, [task]);

  const loadAllContext = useCallback(async () => {
    const [cmts, mems, blks, hofs, tml] = await Promise.all([
      api.tasks.getComments(task.id).catch(() => [] as Comment[]),
      api.memory.listForTask(task.id).catch(() => [] as TaskMemoryEntry[]),
      api.blockers.listForTask(task.id).catch(() => [] as TaskBlocker[]),
      api.handoffs.listForTask(task.id).catch(() => [] as TaskHandoff[]),
      api.tasks.getTimeline(task.id).catch(() => [] as TaskTimelineItem[]),
    ]);
    setComments(cmts);
    setMemories(mems);
    setBlockers(blks);
    setHandoffs(hofs);
    setTimeline(tml);
  }, [task.id]);

  useEffect(() => {
    loadAllContext();
  }, [loadAllContext]);

  // Real-time listeners for this task
  useEffect(() => {
    const socket = connectSocket();
    const onNewComment = ({ comment, taskId }: { comment: Comment; taskId: string }) => {
      if (taskId === task.id) {
        setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
        api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
      }
    };
    const onMemory = ({ taskId, entry }: { taskId: string; entry?: TaskMemoryEntry }) => {
      if (taskId === task.id) {
        if (entry) {
          setMemories((prev) => (prev.some((m) => m.id === entry.id) ? prev : [...prev, entry]));
        } else {
          api.memory.listForTask(task.id).then(setMemories).catch(() => {});
        }
        api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
      }
    };
    const onBlocker = ({ taskId }: { taskId?: string }) => {
      if (!taskId || taskId === task.id) {
        api.blockers.listForTask(task.id).then(setBlockers).catch(() => {});
        api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
      }
    };
    const onHandoff = ({ taskId }: { taskId?: string }) => {
      if (!taskId || taskId === task.id) {
        api.handoffs.listForTask(task.id).then(setHandoffs).catch(() => {});
        api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
      }
    };

    socket.on("new_comment", onNewComment);
    socket.on("task_memory_updated", onMemory);
    socket.on("blocker_created", onBlocker);
    socket.on("blocker_updated", onBlocker);
    socket.on("blocker_resolved", onBlocker);
    socket.on("handoff_created", onHandoff);
    socket.on("handoff_acknowledged", onHandoff);

    return () => {
      socket.off("new_comment", onNewComment);
      socket.off("task_memory_updated", onMemory);
      socket.off("blocker_created", onBlocker);
      socket.off("blocker_updated", onBlocker);
      socket.off("blocker_resolved", onBlocker);
      socket.off("handoff_created", onHandoff);
      socket.off("handoff_acknowledged", onHandoff);
    };
  }, [task.id]);

  const openBlockers = blockers.filter((b) => b.status !== "RESOLVED");
  const unreadHandoffsForMe = handoffs.filter(
    (h) => h.toUserId === currentUser?.id && !h.acknowledgment
  );
  const latestMemory = memories.length > 0 ? memories[memories.length - 1] : null;
  const assigneeChanged = editing && form.assigneeId !== (task.assigneeId || "");

  const handleSaveOverview = async (openHandoffAfter = false) => {
    setOverviewError("");
    setSaving(true);
    try {
      const updated = await api.tasks.update(task.id, {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        columnId: form.columnId,
        dueDate: form.dueDate ? form.dueDate : null,
        expectedHours: form.expectedHours ? Number(form.expectedHours) : null,
        labels: form.labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        assigneeId: form.assigneeId ? form.assigneeId : null,
        workspaceId,
      });
      onUpdate({
        ...task,
        ...updated,
        openBlockersCount: openBlockers.length,
        unreadHandoffsCount: unreadHandoffsForMe.length,
      });
      setEditing(false);
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
      if (openHandoffAfter) {
        if (form.assigneeId) {
          setHandoffForm((f) => ({ ...f, toUserId: form.assigneeId }));
        }
        setActiveTab("handoffs");
      }
    } catch (err: unknown) {
      setOverviewError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemoryErr("");
    setSavingMemory(true);
    try {
      const links = memoryForm.supportingLinksText
        .split(/[\n,]/)
        .map((l) => l.trim())
        .filter(Boolean);
      const entry = await api.memory.create(task.id, {
        originalProblem: memoryForm.originalProblem || undefined,
        expectedOutcome: memoryForm.expectedOutcome || undefined,
        workCompleted: memoryForm.workCompleted || undefined,
        approachesAttempted: memoryForm.approachesAttempted || undefined,
        technicalDecisions: memoryForm.technicalDecisions || undefined,
        outstandingQuestions: memoryForm.outstandingQuestions || undefined,
        nextRecommendedAction: memoryForm.nextRecommendedAction || undefined,
        supportingLinks: links,
      });
      setMemories((prev) => (prev.some((m) => m.id === entry.id) ? prev : [...prev, entry]));
      setMemoryForm({
        originalProblem: "",
        expectedOutcome: "",
        workCompleted: "",
        approachesAttempted: "",
        technicalDecisions: "",
        outstandingQuestions: "",
        nextRecommendedAction: "",
        supportingLinksText: "",
      });
      onUpdate({
        ...task,
        _count: {
          comments: task._count?.comments || comments.length,
          memoryEntries: memories.length + 1,
        },
      });
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
    } catch (err: unknown) {
      setMemoryErr(err instanceof Error ? err.message : "Failed to save memory entry");
    } finally {
      setSavingMemory(false);
    }
  };

  const handleReportBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlockerErr("");
    setSavingBlocker(true);
    try {
      const created = await api.blockers.create(task.id, {
        type: blockerForm.type,
        severity: blockerForm.severity,
        privacy: blockerForm.privacy,
        explanation: blockerForm.explanation || undefined,
      });
      const updatedBlockers = [created, ...blockers.filter((b) => b.id !== created.id)];
      setBlockers(updatedBlockers);
      setBlockerForm({
        type: "STUCK",
        severity: "MEDIUM",
        privacy: "PRIVATE_ADMINS",
        explanation: "",
      });
      onUpdate({
        ...task,
        openBlockersCount: updatedBlockers.filter((b) => b.status !== "RESOLVED").length,
      });
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
    } catch (err: unknown) {
      setBlockerErr(err instanceof Error ? err.message : "Failed to report blocker");
    } finally {
      setSavingBlocker(false);
    }
  };

  const handleUpdateBlocker = async (blockerId: string, status: "ACKNOWLEDGED" | "RESOLVED") => {
    setResolvingId(blockerId);
    try {
      const updated = await api.blockers.update(blockerId, {
        status,
        resolutionNote: status === "RESOLVED" ? resolutionNotes[blockerId] : undefined,
      });
      const updatedBlockers = blockers.map((b) => (b.id === updated.id ? updated : b));
      setBlockers(updatedBlockers);
      onUpdate({
        ...task,
        openBlockersCount: updatedBlockers.filter((b) => b.status !== "RESOLVED").length,
      });
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
    } finally {
      setResolvingId(null);
    }
  };

  const handlePreFillHandoffFromMemory = () => {
    if (!latestMemory) return;
    setHandoffForm((f) => ({
      ...f,
      completedSummary: f.completedSummary || latestMemory.workCompleted || "",
      remainingWork: f.remainingWork || latestMemory.outstandingQuestions || "",
      problemsEncountered: f.problemsEncountered || latestMemory.approachesAttempted || "",
      technicalDecisions: f.technicalDecisions || latestMemory.technicalDecisions || "",
      firstStepRecommended: f.firstStepRecommended || latestMemory.nextRecommendedAction || "",
      importantLinksText:
        f.importantLinksText || (latestMemory.supportingLinks || []).join(", "),
    }));
  };

  const handleCreateHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    setHandoffErr("");
    if (!handoffForm.toUserId) {
      setHandoffErr("Select an authorized team member to hand off to.");
      return;
    }
    setSavingHandoff(true);
    try {
      const links = handoffForm.importantLinksText
        .split(/[\n,]/)
        .map((l) => l.trim())
        .filter(Boolean);
      const created = await api.handoffs.create(task.id, {
        toUserId: handoffForm.toUserId,
        completedSummary: handoffForm.completedSummary,
        remainingWork: handoffForm.remainingWork,
        problemsEncountered: handoffForm.problemsEncountered || undefined,
        technicalDecisions: handoffForm.technicalDecisions || undefined,
        firstStepRecommended: handoffForm.firstStepRecommended,
        importantLinks: links,
      });
      setHandoffs((prev) => (prev.some((h) => h.id === created.id) ? prev : [...prev, created]));
      setHandoffForm({
        toUserId: "",
        completedSummary: "",
        remainingWork: "",
        problemsEncountered: "",
        technicalDecisions: "",
        firstStepRecommended: "",
        importantLinksText: "",
      });
      const receiverMember = members.find((m) => m.user.id === created.toUserId);
      onUpdate({
        ...task,
        assigneeId: created.toUserId,
        assignee: receiverMember?.user || created.toUser,
        unreadHandoffsCount:
          created.toUserId === currentUser?.id ? unreadHandoffsForMe.length + 1 : unreadHandoffsForMe.length,
      });
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
    } catch (err: unknown) {
      setHandoffErr(err instanceof Error ? err.message : "Failed to create handoff");
    } finally {
      setSavingHandoff(false);
    }
  };

  const handleAcknowledgeHandoff = async (handoffId: string) => {
    setAckingId(handoffId);
    try {
      const updated = await api.handoffs.acknowledge(handoffId, ackNotes[handoffId]);
      const updatedList = handoffs.map((h) => (h.id === updated.id ? updated : h));
      setHandoffs(updatedList);
      const newUnreadCount = updatedList.filter(
        (h) => h.toUserId === currentUser?.id && !h.acknowledgment
      ).length;
      onUpdate({ ...task, unreadHandoffsCount: newUnreadCount });
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
    } finally {
      setAckingId(null);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const c = await api.tasks.addComment(task.id, newComment.trim());
      setComments((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
      setNewComment("");
      api.tasks.getTimeline(task.id).then(setTimeline).catch(() => {});
    } finally {
      setPostingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task permanently?")) return;
    setDeleting(true);
    try {
      await api.tasks.delete(task.id);
      onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  };

  const priorityBadge: Record<string, string> = {
    LOW: "badge-gray",
    MEDIUM: "badge-orange",
    HIGH: "badge-purple",
    URGENT: "badge-red",
  };

  const statusName = columns.find((c) => c.id === task.columnId)?.name || task.column?.name || "—";
  const handoffEligibleMembers = members.filter((m) => m.role !== "VIEWER");

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-lg" style={{ maxWidth: 820 }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ gap: 12, paddingBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {editing ? (
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            ) : (
              <div className="modal-title" style={{ fontSize: 18 }}>
                {task.title}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <span className={`badge ${priorityBadge[task.priority] || "badge-gray"}`}>{task.priority}</span>
              <span className="badge badge-blue">{statusName}</span>
              {openBlockers.length > 0 && (
                <span className="badge badge-red">⚠ {openBlockers.length} Blocker{openBlockers.length > 1 ? "s" : ""}</span>
              )}
              {unreadHandoffsForMe.length > 0 && (
                <span className="badge badge-purple">⇄ Unread Handoff</span>
              )}
              {task.labels?.map((label) => (
                <span key={label} className="task-label">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isViewer && activeTab === "overview" && !editing && (
              <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">
                Edit
              </button>
            )}
            {userRole === "ADMIN" && (
              <button onClick={handleDelete} disabled={deleting} className="btn btn-danger btn-sm">
                {deleting ? "..." : "Delete"}
              </button>
            )}
            <button onClick={onClose} className="modal-close" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* 5 Signature Tabs */}
        <div className="tabs-bar" style={{ padding: "0 20px", overflowX: "auto" }}>
          <button
            className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            className={`tab-btn ${activeTab === "memory" ? "active" : ""}`}
            onClick={() => setActiveTab("memory")}
          >
            Memory
            <span className="tab-count">{memories.length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "blockers" ? "active" : ""}`}
            onClick={() => setActiveTab("blockers")}
          >
            Blockers
            {openBlockers.length > 0 ? (
              <span className="tab-count alert-dot">{openBlockers.length}</span>
            ) : (
              <span className="tab-count">{blockers.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "handoffs" ? "active" : ""}`}
            onClick={() => setActiveTab("handoffs")}
          >
            Handoffs
            {unreadHandoffsForMe.length > 0 ? (
              <span className="tab-count alert-dot">{unreadHandoffsForMe.length}</span>
            ) : (
              <span className="tab-count">{handoffs.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            Activity
            <span className="tab-count">{timeline.length}</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ─────────────── OVERVIEW TAB ─────────────── */}
          {activeTab === "overview" && (
            <>
              {/* Context Handoff Preview banner if receiver has an unacknowledged handoff */}
              {unreadHandoffsForMe.length > 0 && (
                <div className="alert alert-info" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      ⇄ Context Handoff Preview (from {unreadHandoffsForMe[unreadHandoffsForMe.length - 1].fromUser.name})
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>
                      <strong>First step:</strong>{" "}
                      {unreadHandoffsForMe[unreadHandoffsForMe.length - 1].firstStepRecommended}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                      <strong>Remaining:</strong>{" "}
                      {unreadHandoffsForMe[unreadHandoffsForMe.length - 1].remainingWork}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setActiveTab("handoffs")}>
                    Review &amp; Acknowledge →
                  </button>
                </div>
              )}

              {/* Context Handoff Preview when task is assigned to current user with Task Memory */}
              {task.assigneeId === currentUser?.id && unreadHandoffsForMe.length === 0 && latestMemory && (
                <div className="alert alert-info" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      ◈ Ownership Context Preview (Assigned to You · Latest Memory by {latestMemory.author.name})
                    </div>
                    {latestMemory.originalProblem && (
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        <strong>Reason:</strong> {latestMemory.originalProblem}
                      </div>
                    )}
                    {latestMemory.workCompleted && (
                      <div style={{ fontSize: 12, marginTop: 2 }}>
                        <strong>Completed so far:</strong> {latestMemory.workCompleted}
                      </div>
                    )}
                    {latestMemory.nextRecommendedAction && (
                      <div style={{ fontSize: 12.5, marginTop: 2 }}>
                        <strong>Next step:</strong> {latestMemory.nextRecommendedAction}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab("memory")}>
                    Open Memory Capsule →
                  </button>
                </div>
              )}

              {/* Context Handoff Preview when ownership changes during Edit */}
              {assigneeChanged && (
                <div className="alert alert-warn" style={{ flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    ⇄ Task Ownership Change Detected — Context Handoff Preview
                  </div>
                  {latestMemory ? (
                    <div style={{ fontSize: 12 }}>
                      The receiving member will benefit from the latest Task Memory Capsule entry (by{" "}
                      <strong>{latestMemory.author.name}</strong>):{" "}
                      <em>
                        {latestMemory.nextRecommendedAction ||
                          latestMemory.workCompleted ||
                          latestMemory.technicalDecisions ||
                          latestMemory.originalProblem}
                      </em>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12 }}>
                      No Task Memory Capsule entries exist yet. Consider adding a formal Handoff note so the receiving
                      member knows what was tried and what to do next.
                    </div>
                  )}
                </div>
              )}

              {editing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="field-label">Status Column</label>
                    <select
                      className="input sm"
                      value={form.columnId}
                      onChange={(e) => setForm((f) => ({ ...f, columnId: e.target.value }))}
                    >
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Priority</label>
                    <select
                      className="input sm"
                      value={form.priority}
                      onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Task["priority"] }))}
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Due Date</label>
                    <input
                      type="date"
                      className="input sm"
                      value={form.dueDate}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Expected Hours</label>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      className="input sm"
                      placeholder="e.g. 8"
                      value={form.expectedHours}
                      onChange={(e) => setForm((f) => ({ ...f, expectedHours: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Assignee</label>
                    <select
                      className="input sm"
                      value={form.assigneeId}
                      onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.user.id} value={m.user.id}>
                          {m.user.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Labels (comma separated)</label>
                    <input
                      className="input sm"
                      placeholder="frontend, auth, sprint-1"
                      value={form.labels}
                      onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="field-label">Description</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  {overviewError && (
                    <div className="alert alert-error" style={{ gridColumn: "1 / -1" }}>
                      {overviewError}
                    </div>
                  )}
                  <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                    {assigneeChanged && (
                      <button
                        type="button"
                        onClick={() => handleSaveOverview(true)}
                        disabled={saving}
                        className="btn btn-secondary"
                      >
                        Save &amp; Create Handoff →
                      </button>
                    )}
                    <button type="button" onClick={() => handleSaveOverview(false)} disabled={saving} className="btn btn-primary">
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                    <div className="stat-label">Assignee</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                      {task.assignee?.name || "Unassigned"}
                    </div>
                  </div>
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                    <div className="stat-label">Due Date / Estimate</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                      {task.expectedHours ? ` · ${task.expectedHours}h est.` : ""}
                    </div>
                  </div>
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                    <div className="stat-label">Reporter</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                      {task.creator?.name || "—"}
                    </div>
                  </div>
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12 }}>
                    <div className="stat-label">Context Health</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                      {memories.length} memory entries · {handoffs.length} handoffs · {openBlockers.length} open blockers
                    </div>
                  </div>
                  {task.description && (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div className="stat-label">Description</div>
                      <div style={{ fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.5 }}>
                        {task.description}
                      </div>
                    </div>
                  )}
                  {latestMemory && (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        background: "rgba(88,166,255,0.06)",
                        border: "1px solid rgba(88,166,255,0.25)",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="stat-label" style={{ color: "var(--accent)" }}>
                          Latest Task Memory Capsule Snapshot
                        </span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab("memory")}>
                          View Full Capsule ({memories.length}) →
                        </button>
                      </div>
                      {latestMemory.nextRecommendedAction && (
                        <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 6 }}>
                          <strong>Next Recommended Action:</strong> {latestMemory.nextRecommendedAction}
                        </div>
                      )}
                      {latestMemory.technicalDecisions && (
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                          <strong>Technical Decisions:</strong> {latestMemory.technicalDecisions}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ─────────────── MEMORY CAPSULE TAB ─────────────── */}
          {activeTab === "memory" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 15, color: "var(--text-primary)" }}>Task Memory Capsule</h3>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Append-only chronological engineering context. Previous decisions and notes are permanently preserved.
                  </p>
                </div>
                <span className="badge badge-blue">{memories.length} Entries</span>
              </div>

              {/* Chronological Memory Timeline */}
              {memories.length === 0 ? (
                <div className="empty-state" style={{ padding: "28px 16px" }}>
                  No memory capsule entries yet. Add the first context snapshot below so future contributors never lose why decisions were made.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {memories.map((m, idx) => (
                    <div
                      key={m.id}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="badge badge-gray">#{idx + 1}</span>
                          <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>{m.author.name}</strong>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                        {m.originalProblem && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Original Problem / Reason: </span>
                            <span style={{ color: "var(--text-primary)" }}>{m.originalProblem}</span>
                          </div>
                        )}
                        {m.expectedOutcome && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Expected Outcome: </span>
                            <span style={{ color: "var(--text-primary)" }}>{m.expectedOutcome}</span>
                          </div>
                        )}
                        {m.workCompleted && (
                          <div>
                            <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>Work Completed: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{m.workCompleted}</span>
                          </div>
                        )}
                        {m.approachesAttempted && (
                          <div>
                            <span style={{ color: "var(--accent-orange)", fontWeight: 600 }}>Approaches Attempted: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{m.approachesAttempted}</span>
                          </div>
                        )}
                        {m.technicalDecisions && (
                          <div>
                            <span style={{ color: "var(--accent-purple)", fontWeight: 600 }}>Technical Decisions: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{m.technicalDecisions}</span>
                          </div>
                        )}
                        {m.outstandingQuestions && (
                          <div>
                            <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>Outstanding Questions: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{m.outstandingQuestions}</span>
                          </div>
                        )}
                        {m.nextRecommendedAction && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Next Recommended Action: </span>
                            <span style={{ color: "var(--text-primary)" }}>{m.nextRecommendedAction}</span>
                          </div>
                        )}
                        {m.supportingLinks?.length > 0 && (
                          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Links &amp; Refs:</span>
                            {m.supportingLinks.map((lnk, i) => (
                              <span key={i} className="badge badge-blue">
                                {lnk}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Append New Memory Entry Form */}
              {!isViewer ? (
                <form
                  onSubmit={handleAddMemory}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                    + Append Memory Entry (Non-destructive)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="field-label">Original Problem / Reason</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Why does this task exist?"
                        value={memoryForm.originalProblem}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, originalProblem: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Expected Outcome</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="What does done look like?"
                        value={memoryForm.expectedOutcome}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, expectedOutcome: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Work Already Completed</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Milestones or code completed so far..."
                        value={memoryForm.workCompleted}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, workCompleted: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Approaches Attempted</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="What worked vs failed..."
                        value={memoryForm.approachesAttempted}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, approachesAttempted: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Technical Decisions Made</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Architecture choices, libraries, trade-offs..."
                        value={memoryForm.technicalDecisions}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, technicalDecisions: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Outstanding Questions</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Open uncertainties or assumptions..."
                        value={memoryForm.outstandingQuestions}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, outstandingQuestions: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Next Recommended Action</label>
                      <input
                        className="input sm"
                        placeholder="Exact next step to take..."
                        value={memoryForm.nextRecommendedAction}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, nextRecommendedAction: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Supporting Links / References (comma separated)</label>
                      <input
                        className="input sm"
                        placeholder="https://github.com/..., PR #42, docs/spec.md"
                        value={memoryForm.supportingLinksText}
                        onChange={(e) => setMemoryForm((f) => ({ ...f, supportingLinksText: e.target.value }))}
                      />
                    </div>
                  </div>
                  {memoryErr && <div className="alert alert-error">{memoryErr}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" disabled={savingMemory} className="btn btn-primary btn-sm">
                      {savingMemory ? "Recording..." : "Save Memory Entry"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="alert alert-info">
                  👁 Viewer role is read-only. You can review permitted task context but cannot add memory entries.
                </div>
              )}
            </div>
          )}

          {/* ─────────────── SILENT BLOCKER RADAR TAB ─────────────── */}
          {activeTab === "blockers" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, color: "var(--text-primary)" }}>Silent Blocker Radar</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Report blockers privately or to the team with tracked duration, acknowledgment, and resolution.
                </p>
              </div>

              {blockers.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 16px" }}>
                  No blockers reported on this task.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {blockers.map((b) => {
                    const sevClass =
                      b.severity === "CRITICAL"
                        ? "badge-red"
                        : b.severity === "HIGH"
                          ? "badge-orange"
                          : b.severity === "MEDIUM"
                            ? "badge-purple"
                            : "badge-gray";
                    const stClass =
                      b.status === "RESOLVED"
                        ? "badge-green"
                        : b.status === "ACKNOWLEDGED"
                          ? "badge-blue"
                          : "badge-red";

                    return (
                      <div
                        key={b.id}
                        style={{
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span className={`badge ${stClass}`}>{b.status}</span>
                            <span className={`badge ${sevClass}`}>{b.severity}</span>
                            <span className="badge badge-blue">{BLOCKER_LABEL_MAP[b.type] || b.type}</span>
                          </div>
                          <span style={{ fontSize: 11.5, color: b.status === "RESOLVED" ? "var(--accent-green)" : "var(--accent-orange)", fontWeight: 600 }}>
                            {b.status === "RESOLVED" && b.resolvedAt
                              ? `Resolved (${new Date(b.resolvedAt).toLocaleString()})`
                              : `⏱ Unresolved for ${formatDurationSince(b.createdAt)}`}
                          </span>
                        </div>

                        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                          {b.isPrivateRedacted
                            ? "🔒 Private explanation visible only to workspace Administrators and the reporter."
                            : b.explanation || "No explanation provided."}
                        </div>

                        {b.resolutionNote && !b.isPrivateRedacted && (
                          <div style={{ fontSize: 12, color: "var(--accent-green)" }}>
                            <strong>Resolution Note:</strong> {b.resolutionNote}
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, color: "var(--text-muted)", flexWrap: "wrap", gap: 6 }}>
                          <span>
                            Reporter: {b.reporter?.name || "Member"} · Visibility: {b.privacy.replace(/_/g, " ")}
                            {b.acknowledgedBy && ` · Ack by ${b.acknowledgedBy.name}`}
                          </span>
                        </div>

                        {b.status !== "RESOLVED" && (b.canAcknowledge || b.canResolve) && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                            {b.canResolve && (
                              <input
                                className="input sm"
                                style={{ flex: 1, minWidth: 180 }}
                                placeholder="Optional resolution note..."
                                value={resolutionNotes[b.id] || ""}
                                onChange={(e) =>
                                  setResolutionNotes((prev) => ({ ...prev, [b.id]: e.target.value }))
                                }
                              />
                            )}
                            {b.canAcknowledge && b.status === "OPEN" && (
                              <button
                                type="button"
                                disabled={resolvingId === b.id}
                                onClick={() => handleUpdateBlocker(b.id, "ACKNOWLEDGED")}
                                className="btn btn-secondary btn-sm"
                              >
                                Acknowledge
                              </button>
                            )}
                            {b.canResolve && (
                              <button
                                type="button"
                                disabled={resolvingId === b.id}
                                onClick={() => handleUpdateBlocker(b.id, "RESOLVED")}
                                className="btn btn-primary btn-sm"
                              >
                                {resolvingId === b.id ? "..." : "Mark Resolved"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isViewer ? (
                <form
                  onSubmit={handleReportBlocker}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                    + Report Silent Blocker
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="field-label">Blocker Reason *</label>
                      <select
                        className="input sm"
                        value={blockerForm.type}
                        onChange={(e) => setBlockerForm((f) => ({ ...f, type: e.target.value as BlockerType }))}
                      >
                        {BLOCKER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Severity</label>
                      <select
                        className="input sm"
                        value={blockerForm.severity}
                        onChange={(e) => setBlockerForm((f) => ({ ...f, severity: e.target.value as BlockerSeverity }))}
                      >
                        <option value="LOW">LOW — Minor friction</option>
                        <option value="MEDIUM">MEDIUM — Slowing progress</option>
                        <option value="HIGH">HIGH — Task blocked</option>
                        <option value="CRITICAL">CRITICAL — Urgent escalation</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="field-label">Privacy Setting (Who can read your explanation?)</label>
                      <select
                        className="input sm"
                        value={blockerForm.privacy}
                        onChange={(e) => setBlockerForm((f) => ({ ...f, privacy: e.target.value as BlockerPrivacy }))}
                      >
                        {Object.entries(PRIVACY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="field-label">Optional Explanation</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Describe what is blocking progress or what help you need..."
                        value={blockerForm.explanation}
                        onChange={(e) => setBlockerForm((f) => ({ ...f, explanation: e.target.value }))}
                      />
                    </div>
                  </div>
                  {blockerErr && <div className="alert alert-error">{blockerErr}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" disabled={savingBlocker} className="btn btn-primary btn-sm">
                      {savingBlocker ? "Reporting..." : "Report Blocker"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="alert alert-info">
                  👁 Viewer role cannot create or modify blockers.
                </div>
              )}
            </div>
          )}

          {/* ─────────────── AUTO HANDOFF MODE TAB ─────────────── */}
          {activeTab === "handoffs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, color: "var(--text-primary)" }}>Auto Handoff Mode</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Structured task transfers preserving what was completed, problems faced, technical decisions, and first next step.
                </p>
              </div>

              {handoffs.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 16px" }}>
                  No handoffs recorded on this task yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {handoffs.map((h) => {
                    const isReceiver = h.toUserId === currentUser?.id;
                    const isUnread = !h.acknowledgment;
                    const capsuleExpanded = expandedCapsuleInHandoff === h.id;

                    return (
                      <div
                        key={h.id}
                        style={{
                          background: "var(--bg-surface)",
                          border: isUnread && isReceiver ? "1px solid rgba(188,140,255,0.5)" : "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                              {h.fromUser.name} → {h.toUser.name}
                            </span>
                            {h.acknowledgment ? (
                              <span className="badge badge-green">
                                ✓ Acknowledged {new Date(h.acknowledgment.acknowledgedAt).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="badge badge-purple">Unread / Pending Ack</span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {new Date(h.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                          <div>
                            <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>Completed: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{h.completedSummary}</span>
                          </div>
                          <div>
                            <span style={{ color: "var(--accent-orange)", fontWeight: 600 }}>Remaining: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{h.remainingWork}</span>
                          </div>
                          {h.problemsEncountered && (
                            <div>
                              <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>Problems Encountered: </span>
                              <span style={{ color: "var(--text-secondary)" }}>{h.problemsEncountered}</span>
                            </div>
                          )}
                          {h.technicalDecisions && (
                            <div>
                              <span style={{ color: "var(--accent-purple)", fontWeight: 600 }}>Technical Decisions: </span>
                              <span style={{ color: "var(--text-secondary)" }}>{h.technicalDecisions}</span>
                            </div>
                          )}
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Recommended First Step: </span>
                            <span style={{ color: "var(--text-primary)" }}>{h.firstStepRecommended}</span>
                          </div>
                          {h.importantLinks?.length > 0 && (
                            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Important Links/Files:</span>
                              {h.importantLinks.map((lnk, idx) => (
                                <span key={idx} className="badge badge-blue">
                                  {lnk}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {h.acknowledgment?.note && (
                          <div style={{ fontSize: 12, color: "var(--accent-green)", fontStyle: "italic" }}>
                            Receiver note: &ldquo;{h.acknowledgment.note}&rdquo;
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setExpandedCapsuleInHandoff(capsuleExpanded ? null : h.id)}
                          >
                            {capsuleExpanded
                              ? "Hide Memory Capsule"
                              : `Access Task Memory Capsule (${memories.length})`}
                          </button>

                          {isReceiver && !h.acknowledgment && !isViewer && (
                            <>
                              <input
                                className="input sm"
                                style={{ flex: 1, minWidth: 160 }}
                                placeholder="Optional acknowledgment note..."
                                value={ackNotes[h.id] || ""}
                                onChange={(e) => setAckNotes((prev) => ({ ...prev, [h.id]: e.target.value }))}
                              />
                              <button
                                type="button"
                                disabled={ackingId === h.id}
                                onClick={() => handleAcknowledgeHandoff(h.id)}
                                className="btn btn-primary btn-sm"
                              >
                                {ackingId === h.id ? "..." : "✓ Acknowledge Handoff"}
                              </button>
                            </>
                          )}
                        </div>

                        {capsuleExpanded && (
                          <div
                            style={{
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: 6,
                              padding: 10,
                              marginTop: 4,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="stat-label">Task Memory Capsule History ({memories.length})</span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setActiveTab("memory")}
                              >
                                Open Memory Tab →
                              </button>
                            </div>
                            {memories.length === 0 ? (
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                No Task Memory Capsule entries recorded yet.
                              </div>
                            ) : (
                              memories.map((m) => (
                                <div
                                  key={m.id}
                                  style={{
                                    fontSize: 12,
                                    borderBottom: "1px solid var(--border-subtle)",
                                    paddingBottom: 6,
                                  }}
                                >
                                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                    {m.author.name} · {new Date(m.createdAt).toLocaleString()}
                                  </div>
                                  {m.originalProblem && <div>Problem: {m.originalProblem}</div>}
                                  {m.technicalDecisions && <div>Decisions: {m.technicalDecisions}</div>}
                                  {m.nextRecommendedAction && <div>Next: {m.nextRecommendedAction}</div>}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isViewer ? (
                <form
                  onSubmit={handleCreateHandoff}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                      + Transfer Task (Auto Handoff)
                    </span>
                    {latestMemory && (
                      <button
                        type="button"
                        onClick={handlePreFillHandoffFromMemory}
                        className="btn btn-secondary btn-sm"
                      >
                        Pre-fill from Memory Capsule
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="field-label">Hand Over To (Authorized Workspace Member) *</label>
                    <select
                      className="input sm"
                      value={handoffForm.toUserId}
                      onChange={(e) => setHandoffForm((f) => ({ ...f, toUserId: e.target.value }))}
                      required
                    >
                      <option value="">Select receiving member...</option>
                      {handoffEligibleMembers.map((m) => (
                        <option key={m.user.id} value={m.user.id}>
                          {m.user.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="field-label">What has been completed? *</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        required
                        placeholder="Summarize verified completed work..."
                        value={handoffForm.completedSummary}
                        onChange={(e) => setHandoffForm((f) => ({ ...f, completedSummary: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">What remains? *</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        required
                        placeholder="Remaining implementation, tests, edge cases..."
                        value={handoffForm.remainingWork}
                        onChange={(e) => setHandoffForm((f) => ({ ...f, remainingWork: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">What problems were encountered?</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Gotchas, flaky tests, constraints..."
                        value={handoffForm.problemsEncountered}
                        onChange={(e) => setHandoffForm((f) => ({ ...f, problemsEncountered: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Which technical decisions were made?</label>
                      <textarea
                        className="input sm"
                        rows={2}
                        placeholder="Patterns, schema choices, library selections..."
                        value={handoffForm.technicalDecisions}
                        onChange={(e) => setHandoffForm((f) => ({ ...f, technicalDecisions: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">What should the next member do first? *</label>
                      <input
                        className="input sm"
                        required
                        placeholder="Exact first step to pick up cleanly..."
                        value={handoffForm.firstStepRecommended}
                        onChange={(e) => setHandoffForm((f) => ({ ...f, firstStepRecommended: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Important links or files (comma separated)</label>
                      <input
                        className="input sm"
                        placeholder="src/routes/auth.ts, PR #12"
                        value={handoffForm.importantLinksText}
                        onChange={(e) => setHandoffForm((f) => ({ ...f, importantLinksText: e.target.value }))}
                      />
                    </div>
                  </div>
                  {handoffErr && <div className="alert alert-error">{handoffErr}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" disabled={savingHandoff} className="btn btn-primary btn-sm">
                      {savingHandoff ? "Sending Handoff..." : "Send Handoff & Reassign"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="alert alert-info">
                  👁 Viewer role cannot create or acknowledge handoffs.
                </div>
              )}
            </div>
          )}

          {/* ─────────────── UNIFIED ACTIVITY & COMMENTS TAB ─────────────── */}
          {activeTab === "activity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, color: "var(--text-primary)" }}>Unified Task Timeline</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Chronological audit stream combining status changes, comments, memory entries, blockers, and handoffs.
                </p>
              </div>

              {timeline.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No task activity recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {timeline.map((item) => {
                    const kindBadge: Record<string, { label: string; cls: string }> = {
                      activity: { label: "STATUS", cls: "badge-gray" },
                      comment: { label: "COMMENT", cls: "badge-blue" },
                      memory: { label: "MEMORY", cls: "badge-blue" },
                      blocker: { label: "BLOCKER", cls: "badge-red" },
                      handoff: { label: "HANDOFF", cls: "badge-purple" },
                      handoff_ack: { label: "ACK", cls: "badge-green" },
                    };
                    const meta = kindBadge[item.kind] || { label: "EVENT", cls: "badge-gray" };

                    return (
                      <div
                        key={item.id}
                        style={{
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 8,
                          padding: 11,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className={`badge ${meta.cls}`} style={{ fontSize: 10 }}>
                              {meta.label}
                            </span>
                            <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>{item.actor.name}</strong>
                            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{item.title}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {item.body && (
                          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 5, paddingLeft: 4 }}>
                            {item.body}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comment Input */}
              {!isViewer ? (
                <form onSubmit={handleComment} style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                  <input
                    className="input sm"
                    placeholder="Add a task comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                  />
                  <button type="submit" disabled={postingComment} className="btn btn-primary btn-sm">
                    {postingComment ? "..." : "Post Comment"}
                  </button>
                </form>
              ) : (
                <div className="alert alert-info">
                  👁 Viewer role cannot post comments.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

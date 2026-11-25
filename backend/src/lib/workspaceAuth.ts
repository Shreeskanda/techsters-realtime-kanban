import { BlockerPrivacy } from "@prisma/client";
import { prisma } from "./prisma";
import { getIO } from "./io";

export async function getTaskWithWorkspace(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      column: {
        include: {
          board: {
            select: { id: true, workspaceId: true, name: true },
          },
        },
      },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!task) return null;
  return { task, workspaceId: task.column.board.workspaceId };
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

export async function getWorkspaceAdminUserIds(workspaceId: string): Promise<string[]> {
  const admins = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: "ADMIN" },
    select: { userId: true },
  });
  return admins.map((a) => a.userId);
}

export interface RawBlocker {
  id: string;
  type: string;
  severity: string;
  privacy: BlockerPrivacy;
  status: string;
  explanation: string | null;
  resolutionNote: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  taskId: string;
  workspaceId: string;
  reporterId: string;
  reporter?: { id: string; name: string; email?: string } | null;
  acknowledgedBy?: { id: string; name: string } | null;
  resolvedBy?: { id: string; name: string } | null;
  task?: { id: string; title: string; column?: { name: string } | null } | null;
  workspace?: { id: string; name: string } | null;
}

/**
 * Enforces Silent Blocker Radar privacy rules server-side before returning or broadcasting.
 * - ADMIN or the reporter always sees full blocker details.
 * - REPORTER_AND_ADMINS is invisible to unauthorized members/viewers.
 * - PRIVATE_ADMINS exposes type/severity/status without explanation or reporter identity to non-admins.
 * - TEAM is visible to all authorized workspace members.
 */
export function filterBlockerForUser<T extends RawBlocker>(
  blocker: T,
  requesterId: string,
  requesterRole: string
): (T & { isPrivateRedacted: boolean; canResolve: boolean; canAcknowledge: boolean }) | null {
  const isAdmin = requesterRole === "ADMIN";
  const isReporter = blocker.reporterId === requesterId;
  const canResolve = isAdmin || (isReporter && requesterRole !== "VIEWER");
  const canAcknowledge = isAdmin;

  if (isAdmin || isReporter) {
    return {
      ...blocker,
      isPrivateRedacted: false,
      canResolve,
      canAcknowledge,
    };
  }

  if (blocker.privacy === "REPORTER_AND_ADMINS") {
    return null;
  }

  if (blocker.privacy === "PRIVATE_ADMINS") {
    return {
      ...blocker,
      reporterId: "private",
      explanation: null,
      resolutionNote: null,
      reporter: { id: "private", name: "Workspace Member (Private)" },
      isPrivateRedacted: true,
      canResolve: false,
      canAcknowledge: false,
    };
  }

  // TEAM privacy
  return {
    ...blocker,
    isPrivateRedacted: false,
    canResolve: false,
    canAcknowledge: false,
  };
}

/**
 * Emits a Socket.IO blocker event strictly to authorized recipients:
 * - TEAM: broadcast to the whole workspace room
 * - PRIVATE_ADMINS / REPORTER_AND_ADMINS: broadcast ONLY to workspace ADMINs and reporter user rooms
 */
export async function emitBlockerSocketEvent(
  eventName: "blocker_created" | "blocker_updated" | "blocker_resolved",
  blocker: RawBlocker,
  workspaceId: string
) {
  try {
    const io = getIO();
    if (blocker.privacy === "TEAM") {
      io.to(workspaceId).emit(eventName, { blocker: { ...blocker, isPrivateRedacted: false }, workspaceId, taskId: blocker.taskId });
      return;
    }

    const adminIds = await getWorkspaceAdminUserIds(workspaceId);
    const recipients = new Set<string>([...adminIds, blocker.reporterId]);
    for (const uid of recipients) {
      io.to(`user:${uid}`).emit(eventName, {
        blocker: { ...blocker, isPrivateRedacted: false },
        workspaceId,
        taskId: blocker.taskId,
      });
    }

    // For PRIVATE_ADMINS, notify workspace board without private explanation so counts stay synced safely
    if (blocker.privacy === "PRIVATE_ADMINS") {
      const redacted = {
        ...blocker,
        explanation: null,
        resolutionNote: null,
        reporter: { id: "private", name: "Workspace Member (Private)" },
        isPrivateRedacted: true,
      };
      // Send redacted signal to non-admin sockets in the workspace room? We instead send workspace refresh metadata only.
      io.to(workspaceId).emit(`${eventName}_meta`, {
        taskId: blocker.taskId,
        workspaceId,
        blockerId: redacted.id,
        status: redacted.status,
      });
    }
  } catch (err) {
    console.error("Failed to emit blocker socket event:", err);
  }
}

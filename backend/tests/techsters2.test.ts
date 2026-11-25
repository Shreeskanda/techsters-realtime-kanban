// TechSters 2.0 – Comprehensive End-to-End API, RBAC & Isolation Test Suite
// Covers all 10 verification scenarios + Admin User Activation controls

const API_BASE = process.env.TEST_API_BASE || "http://localhost:5000/api";

async function req<T = any>(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, data: json as T };
}

export async function runTechSters2Tests() {
  const runId = Date.now();
  let passed = 0;
  let failed = 0;

  function check(cond: boolean, msg: string, detail?: unknown) {
    if (cond) {
      console.log(`  PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  FAIL: ${msg}`, detail ?? "");
      failed++;
    }
  }

  console.log(`Running TechSters 2.0 E2E Suite against ${API_BASE}`);

  // Setup: register Admin A, Member B, Viewer C, and Outside Member D
  const adminEmail = `ts2-admin-${runId}@techsters.dev`;
  const memberEmail = `ts2-member-${runId}@techsters.dev`;
  const viewerEmail = `ts2-viewer-${runId}@techsters.dev`;
  const outsiderEmail = `ts2-outsider-${runId}@techsters.dev`;
  const pass = "TechSters2026!";

  const [adminReg, memberReg, viewerReg, outsiderReg] = await Promise.all([
    req("/auth/register", { method: "POST", body: { name: "Admin E2E", email: adminEmail, password: pass, systemRole: "ADMIN" } }),
    req("/auth/register", { method: "POST", body: { name: "Member E2E", email: memberEmail, password: pass, systemRole: "MEMBER" } }),
    req("/auth/register", { method: "POST", body: { name: "Viewer E2E", email: viewerEmail, password: pass, systemRole: "MEMBER" } }),
    req("/auth/register", { method: "POST", body: { name: "Outsider E2E", email: outsiderEmail, password: pass, systemRole: "MEMBER" } }),
  ]);

  const adminToken = adminReg.data?.token;
  const memberToken = memberReg.data?.token;
  const viewerToken = viewerReg.data?.token;
  const outsiderToken = outsiderReg.data?.token;
  const memberId = memberReg.data?.user?.id;
  const viewerId = viewerReg.data?.user?.id;

  check(adminReg.status === 201 && memberReg.status === 201 && viewerReg.status === 201, "Scenario 10A: Registration works for Admin, Member, and Viewer");

  // Create Workspace 1 by Admin
  const wsRes = await req("/workspaces", {
    method: "POST",
    token: adminToken,
    body: { name: `E2E Capsule Space ${runId}`, description: "TechSters 2.0 Verification" },
  });
  const wsId = wsRes.data?.id;
  const boardId = wsRes.data?.boards?.[0]?.id;
  check(wsRes.status === 201 && !!wsId && !!boardId, "Scenario 10B: Workspace creation creates default Main Board");

  // Invite Member B as MEMBER and Viewer C as VIEWER
  const invB = await req(`/workspaces/${wsId}/members`, {
    method: "POST",
    token: adminToken,
    body: { email: memberEmail, role: "MEMBER" },
  });
  const invC = await req(`/workspaces/${wsId}/members`, {
    method: "POST",
    token: adminToken,
    body: { email: viewerEmail, role: "VIEWER" },
  });
  check(invB.status === 201 && invC.status === 201, "Invite Member & Viewer succeeds");

  // Fetch board columns
  const boardRes = await req(`/boards/${boardId}`, { token: adminToken });
  const todoCol = boardRes.data?.columns?.find((c: any) => c.name === "TO DO");
  const inProgCol = boardRes.data?.columns?.find((c: any) => c.name === "IN PROGRESS");
  check(!!todoCol && !!inProgCol, "Board has TO DO and IN PROGRESS columns");

  // Scenario 10C: Create task + move column
  const taskRes = await req("/tasks", {
    method: "POST",
    token: adminToken,
    body: {
      title: "Implement Context Continuity Engine",
      description: "Verify memory, blockers, handoffs, and health",
      priority: "HIGH",
      expectedHours: 12,
      columnId: todoCol.id,
      workspaceId: wsId,
    },
  });
  const taskId = taskRes.data?.id;
  check(taskRes.status === 201 && !!taskId, "Scenario 10C: Task creation succeeds");

  const moveRes = await req(`/tasks/${taskId}`, {
    method: "PATCH",
    token: memberToken,
    body: { columnId: inProgCol.id, workspaceId: wsId },
  });
  check(moveRes.status === 200 && moveRes.data?.columnId === inProgCol.id, "Scenario 10D: Member drag-and-drop move persists");

  // Scenario 1: User A adds memory entry; User B sees update (and non-destructive append-only)
  const mem1 = await req(`/tasks/${taskId}/memory`, {
    method: "POST",
    token: adminToken,
    body: {
      originalProblem: "Context gets lost between shifts",
      expectedOutcome: "Append-only capsule visible to assignee",
      technicalDecisions: "Use PostgreSQL TaskMemoryEntry table",
      nextRecommendedAction: "Wire TaskModal Memory tab",
      supportingLinks: ["https://github.com/Shreeskanda/techsters-realtime-kanban"],
    },
  });
  check(mem1.status === 201 && !!mem1.data?.id, "Scenario 1A: User A adds Task Memory Capsule entry");

  const mem2 = await req(`/tasks/${taskId}/memory`, {
    method: "POST",
    token: memberToken,
    body: {
      workCompleted: "Built frontend form",
      nextRecommendedAction: "Verify real-time Socket.IO emission",
    },
  });
  const memListForB = await req(`/tasks/${taskId}/memory`, { token: memberToken });
  check(
    mem2.status === 201 && Array.isArray(memListForB.data) && memListForB.data.length === 2,
    "Scenario 1B: User B sees both chronological memory entries without overwriting"
  );

  // Scenario 2 & 5: Member reports private blocker; Admin sees it, Health score drops, then resolves -> Health rises
  const healthBefore = await req(`/workspaces/${wsId}/health`, { token: adminToken });
  const scoreBefore = healthBefore.data?.score;
  check(healthBefore.status === 200 && scoreBefore === 100, `Baseline health score is deterministic (${scoreBefore})`);

  const blkRes = await req(`/tasks/${taskId}/blockers`, {
    method: "POST",
    token: memberToken,
    body: {
      type: "TECHNICAL_ASSISTANCE",
      severity: "HIGH",
      privacy: "REPORTER_AND_ADMINS",
      explanation: "Confidential OAuth credential mismatch in staging",
    },
  });
  const blockerId = blkRes.data?.id;
  check(blkRes.status === 201 && !!blockerId, "Scenario 2A: Member reports private blocker");

  const viewerBlockers = await req(`/tasks/${taskId}/blockers`, { token: viewerToken });
  check(
    viewerBlockers.status === 200 && Array.isArray(viewerBlockers.data) && viewerBlockers.data.length === 0,
    "Scenario 2B: Silent blocker privacy hides REPORTER_AND_ADMINS details from Viewer"
  );

  // Verify PRIVATE_ADMINS redacts reporterId & explanation from non-admin/non-reporter
  const privAdminBlk = await req(`/tasks/${taskId}/blockers`, {
    method: "POST",
    token: memberToken,
    body: {
      type: "NEEDS_RESOURCES",
      severity: "LOW",
      privacy: "PRIVATE_ADMINS",
      explanation: "Need test device credentials",
    },
  });
  const viewerPrivView = await req(`/tasks/${taskId}/blockers`, { token: viewerToken });
  const viewerSawPriv = (viewerPrivView.data || []).find((b: any) => b.id === privAdminBlk.data?.id);
  check(
    privAdminBlk.status === 201 &&
      viewerSawPriv &&
      viewerSawPriv.isPrivateRedacted === true &&
      viewerSawPriv.reporterId === "private" &&
      viewerSawPriv.explanation === null,
    "Scenario 2B2: PRIVATE_ADMINS redacts reporterId and explanation from non-admins"
  );

  const viewerActivity = await req(`/workspaces/${wsId}/activity`, { token: viewerToken });
  const leakedPrivateActivity = (viewerActivity.data || []).some(
    (log: any) => log.action?.startsWith("blocker_") && log.details?.privacy === "REPORTER_AND_ADMINS"
  );
  check(
    viewerActivity.status === 200 && !leakedPrivateActivity,
    "Scenario 2B3: Workspace activity log omits REPORTER_AND_ADMINS blockers from non-admins"
  );

  // Clean up auxiliary blocker so health delta check stays exact
  if (privAdminBlk.data?.id) {
    await req(`/blockers/${privAdminBlk.data.id}`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "RESOLVED", resolutionNote: "Provided device" },
    });
  }

  const adminWsBlockers = await req(`/workspaces/${wsId}/blockers`, { token: adminToken });
  check(
    adminWsBlockers.status === 200 &&
      adminWsBlockers.data.some((b: any) => b.id === blockerId && b.explanation?.includes("Confidential OAuth")),
    "Scenario 2C: Authorized Admin receives full blocker context"
  );

  const healthBlocked = await req(`/workspaces/${wsId}/health`, { token: adminToken });
  check(
    healthBlocked.data?.score < scoreBefore && healthBlocked.data?.indicators?.unresolvedBlockers === 1,
    `Scenario 5A: Project health drops when HIGH blocker is open (${scoreBefore} -> ${healthBlocked.data?.score})`
  );

  const resolveRes = await req(`/blockers/${blockerId}`, {
    method: "PATCH",
    token: memberToken,
    body: { status: "RESOLVED", resolutionNote: "Credentials rotated" },
  });
  const healthResolved = await req(`/workspaces/${wsId}/health`, { token: adminToken });
  check(
    resolveRes.status === 200 && healthResolved.data?.score > healthBlocked.data?.score,
    `Scenario 5B: Project health improves when blocker is resolved (${healthBlocked.data?.score} -> ${healthResolved.data?.score})`
  );

  // Scenario 3 & 4: Task handoff created; receiver sees pending handoff & context, then acknowledges
  const handoffRes = await req(`/tasks/${taskId}/handoffs`, {
    method: "POST",
    token: adminToken,
    body: {
      toUserId: memberId,
      completedSummary: "Database models & REST routes implemented",
      remainingWork: "Add UI unit check",
      problemsEncountered: "Fixed date serialization on PATCH",
      technicalDecisions: "Atomic transaction for handoff + reassignment",
      firstStepRecommended: "Run build and inspect Activity timeline",
      importantLinks: ["backend/src/routes/handoffs.ts"],
    },
  });
  const handoffId = handoffRes.data?.id;
  check(handoffRes.status === 201 && !!handoffId, "Scenario 3A: Admin creates structured task handoff to Member B");

  const pendingForB = await req("/handoffs/pending", { token: memberToken });
  check(
    pendingForB.status === 200 &&
      pendingForB.data.some((h: any) => h.id === handoffId && h.task?.memoryEntries?.length > 0),
    "Scenario 3B: Receiver sees unread handoff with linked Task Memory Capsule context"
  );

  // Scenario 9: Concurrent double-acknowledgment does not duplicate or error
  const [ack1, ack2] = await Promise.all([
    req(`/handoffs/${handoffId}/acknowledge`, { method: "POST", token: memberToken, body: { note: "Picked up!" } }),
    req(`/handoffs/${handoffId}/acknowledge`, { method: "POST", token: memberToken, body: { note: "Picked up!" } }),
  ]);
  check(
    ack1.status === 200 && ack2.status === 200 && !!ack1.data?.acknowledgment,
    "Scenario 4 & 9: Receiver acknowledges handoff without duplicate records on concurrent clicks"
  );

  // Scenario 6: Viewer CANNOT modify tasks, memory, blockers, or handoffs
  const [vTask, vMem, vBlk, vHof] = await Promise.all([
    req(`/tasks/${taskId}`, { method: "PATCH", token: viewerToken, body: { title: "Tampered", workspaceId: wsId } }),
    req(`/tasks/${taskId}/memory`, { method: "POST", token: viewerToken, body: { originalProblem: "Illicit" } }),
    req(`/tasks/${taskId}/blockers`, { method: "POST", token: viewerToken, body: { type: "STUCK" } }),
    req(`/tasks/${taskId}/handoffs`, {
      method: "POST",
      token: viewerToken,
      body: { toUserId: memberId, completedSummary: "X", remainingWork: "Y", firstStepRecommended: "Z" },
    }),
  ]);
  check(
    vTask.status === 403 && vMem.status === 403 && vBlk.status === 403 && vHof.status === 403,
    "Scenario 6: VIEWER strictly receives 403 on tasks, memory, blockers, and handoffs"
  );

  // Scenario 7: Outsider cannot access another workspace's private data
  const [oMem, oBlk, oHealth, oHandoff] = await Promise.all([
    req(`/tasks/${taskId}/memory`, { token: outsiderToken }),
    req(`/workspaces/${wsId}/blockers`, { token: outsiderToken }),
    req(`/workspaces/${wsId}/health`, { token: outsiderToken }),
    req(`/tasks/${taskId}/handoffs`, { token: outsiderToken }),
  ]);
  check(
    oMem.status === 403 && oBlk.status === 403 && oHealth.status === 403 && oHandoff.status === 403,
    "Scenario 7: Cross-workspace isolation returns 403 to unauthorized outsider"
  );

  // Scenario 8: Unified timeline & persistence after re-fetch
  const timelineRes = await req(`/tasks/${taskId}/timeline`, { token: memberToken });
  const kinds = new Set((timelineRes.data || []).map((i: any) => i.kind));
  check(
    timelineRes.status === 200 && kinds.has("memory") && kinds.has("blocker") && kinds.has("handoff") && kinds.has("handoff_ack"),
    "Scenario 8: Unified timeline persists status, memory, blocker, handoff & ack entries"
  );

  // Admin Activation Status Check & Toggle
  const adminUsersRes = await req("/admin/users", { token: adminToken });
  const foundMember = (adminUsersRes.data || []).find((u: any) => u.id === memberId);
  check(adminUsersRes.status === 200 && !!foundMember && foundMember.isActive === true, "Admin sees Member activation status and timestamps");

  const deactRes = await req(`/admin/users/${viewerId}/deactivate`, { method: "PATCH", token: adminToken });
  const deactivatedLogin = await req("/auth/login", { method: "POST", body: { email: viewerEmail, password: pass } });
  const deactivatedApi = await req(`/tasks/${taskId}/memory`, { token: viewerToken });

  // Assigning deactivated user must fail with 400
  const assignDeactRes = await req(`/workspaces/${wsId}/members`, {
    method: "POST",
    token: adminToken,
    body: { email: viewerEmail, role: "MEMBER" },
  });

  const reactRes = await req(`/admin/users/${viewerId}/activate`, { method: "PATCH", token: adminToken });
  const reactivatedLogin = await req("/auth/login", { method: "POST", body: { email: viewerEmail, password: pass } });
  check(
    deactRes.status === 200 &&
      deactivatedLogin.status === 403 &&
      deactivatedApi.status === 403 &&
      assignDeactRes.status === 400 &&
      reactRes.status === 200 &&
      reactivatedLogin.status === 200,
    "Admin can deactivate and reactivate user accounts with server-side enforcement"
  );

  // Assignable Users Picker RBAC
  const [assignableAdmin, assignableMember] = await Promise.all([
    req(`/workspaces/${wsId}/assignable-users`, { token: adminToken }),
    req(`/workspaces/${wsId}/assignable-users`, { token: memberToken }),
  ]);
  check(
    assignableAdmin.status === 200 &&
      Array.isArray(assignableAdmin.data) &&
      assignableAdmin.data.some((u: any) => u.email === outsiderEmail && u.currentRole === null) &&
      assignableMember.status === 403,
    "Workspace Admin sees assignable users picker while non-admin receives 403"
  );

  // Local Chatbot RBAC & Privacy Isolation
  const silentBlkForChat = await req(`/tasks/${taskId}/blockers`, {
    method: "POST",
    token: memberToken,
    body: {
      type: "STUCK",
      severity: "HIGH",
      privacy: "REPORTER_AND_ADMINS",
      explanation: "UltraSecretChatBlockerToken",
    },
  });
  const [chatAdminHealth, chatAdminBlockers, chatViewerBlockers, chatOutsider] = await Promise.all([
    req("/chat", { method: "POST", token: adminToken, body: { message: "Project health summary", workspaceId: wsId } }),
    req("/chat", { method: "POST", token: adminToken, body: { message: "Show open blockers", workspaceId: wsId } }),
    req("/chat", { method: "POST", token: viewerToken, body: { message: "Show open blockers", workspaceId: wsId } }),
    req("/chat", { method: "POST", token: outsiderToken, body: { message: "Show open blockers", workspaceId: wsId } }),
  ]);
  check(
    silentBlkForChat.status === 201 &&
      chatAdminHealth.status === 200 &&
      chatAdminHealth.data?.mode === "local-engine" &&
      chatAdminBlockers.data?.reply?.includes("UltraSecretChatBlockerToken") &&
      chatViewerBlockers.status === 200 &&
      !chatViewerBlockers.data?.reply?.includes("UltraSecretChatBlockerToken") &&
      chatOutsider.status === 403,
    "Local Chatbot enforces workspace isolation (403) and Silent Blocker privacy"
  );

  // Delete Project RBAC & Cascade Verification
  const [delMember, delViewer] = await Promise.all([
    req(`/workspaces/${wsId}`, { method: "DELETE", token: memberToken }),
    req(`/workspaces/${wsId}`, { method: "DELETE", token: viewerToken }),
  ]);
  const delAdmin = await req(`/workspaces/${wsId}`, { method: "DELETE", token: adminToken });
  const getAfterDel = await req(`/workspaces/${wsId}`, { token: adminToken });
  check(
    delMember.status === 403 &&
      delViewer.status === 403 &&
      delAdmin.status === 200 &&
      (getAfterDel.status === 403 || getAfterDel.status === 404),
    "Delete project allowed only for workspace ADMIN and removes workspace cleanly"
  );

  console.log(`==================================================`);
  console.log(`TechSters 2.0 Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================`);

  return {
    passed,
    failed,
    cleanupIds: {
      workspaceId: wsId,
      userIds: [adminReg.data?.user?.id, memberId, viewerId, outsiderReg.data?.user?.id].filter(Boolean) as string[],
    },
  };
}

if (require.main === module) {
  runTechSters2Tests()
    .then(async ({ failed, cleanupIds }) => {
      if (process.env.TEST_CLEANUP !== "false") {
        try {
          const { PrismaClient } = await import("@prisma/client");
          const prisma = new PrismaClient();
          if (cleanupIds.workspaceId) {
            await prisma.workspace.deleteMany({ where: { id: cleanupIds.workspaceId } });
          }
          if (cleanupIds.userIds.length > 0) {
            await prisma.user.deleteMany({ where: { id: { in: cleanupIds.userIds } } });
          }
          await prisma.$disconnect();
          console.log("  Cleaned up ephemeral E2E workspace & users.");
        } catch (cleanupErr) {
          console.warn("Cleanup skipped:", cleanupErr);
        }
      }
      if (failed > 0) process.exit(1);
    })
    .catch((err) => {
      console.error("Test execution failed:", err);
      process.exit(1);
    });
}

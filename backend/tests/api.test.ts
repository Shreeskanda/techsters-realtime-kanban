// Comprehensive API & RBAC Test Suite
// TechSters – Collaborative Kanban | AVISHKAR'26
// Author: Integration & DevOps Engineer (Person 4 / shreyasvanimohan@gmail.com)

const BASE = "http://localhost:5000/api";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 TechSters Kanban – End-to-End Test Suite");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const healthRes = await fetch("http://localhost:5000/health");
    const health = await healthRes.json();
    assert(health.status === "ok", "Server health check returns ok");

    // 2. Login as Admin (Alice)
    const aliceRes = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@techsters.dev", password: "password123" }),
    });
    const aliceData = await aliceRes.json();
    assert(!!aliceData.token && aliceData.user.name.includes("Alice"), "Admin (Alice) login succeeds");
    const adminToken = aliceData.token;

    // 3. Login as Member (Bob)
    const bobRes = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@techsters.dev", password: "password123" }),
    });
    const bobData = await bobRes.json();
    assert(!!bobData.token && bobData.user.name.includes("Bob"), "Member (Bob) login succeeds");
    const memberToken = bobData.token;

    // 4. Login as Viewer (Carol)
    const carolRes = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@techsters.dev", password: "password123" }),
    });
    const carolData = await carolRes.json();
    assert(!!carolData.token && carolData.user.name.includes("Carol"), "Viewer (Carol) login succeeds");
    const viewerToken = carolData.token;

    // 5. Registration test
    const newEmail = `user-${Date.now()}@techsters.dev`;
    const regRes = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Demo User", email: newEmail, password: "securepassword123" }),
    });
    const regData = await regRes.json();
    assert(!!regData.token && regData.user.email === newEmail, "New user registration works");

    // 6. Get Workspaces
    const wsRes = await fetch(`${BASE}/workspaces`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const workspaces = await wsRes.json();
    assert(Array.isArray(workspaces) && workspaces.length > 0, "Admin can list workspaces");
    const ws = workspaces[0];

    // 7. Get Board & Columns
    const boardId = ws.boards[0].id;
    const boardRes = await fetch(`${BASE}/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const board = await boardRes.json();
    assert(board.columns.length >= 3, "Kanban board has default columns (TO DO, IN PROGRESS, DONE)");
    const todoCol = board.columns.find((c: any) => c.name === "TO DO");
    const inprogCol = board.columns.find((c: any) => c.name === "IN PROGRESS");

    // 8. Task creation by Admin
    const createTaskRes = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: "Test Task Automated E2E",
        description: "Checking task lifecycle and permissions",
        priority: "HIGH",
        columnId: todoCol.id,
        workspaceId: ws.id,
        labels: ["automated", "test"],
      }),
    });
    const createdTask = await createTaskRes.json();
    assert(createTaskRes.status === 201 && createdTask.title === "Test Task Automated E2E", "Admin can create tasks");

    // 9. RBAC: Viewer CANNOT create tasks
    const viewerCreateRes = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({
        title: "Viewer Illicit Task",
        columnId: todoCol.id,
        workspaceId: ws.id,
      }),
    });
    assert(viewerCreateRes.status === 403, "Viewer CANNOT create tasks (403 Forbidden)");

    // 10. Member CAN update/move task
    const moveRes = await fetch(`${BASE}/tasks/${createdTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({
        columnId: inprogCol.id,
        workspaceId: ws.id,
      }),
    });
    const movedTask = await moveRes.json();
    assert(moveRes.status === 200 && movedTask.columnId === inprogCol.id, "Member can move tasks between columns");

    // 11. RBAC: Viewer CANNOT move/edit task
    const viewerMoveRes = await fetch(`${BASE}/tasks/${createdTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({
        title: "Viewer Tampered Title",
        workspaceId: ws.id,
      }),
    });
    assert(viewerMoveRes.status === 403, "Viewer CANNOT edit tasks (403 Forbidden)");

    // 12. Add Comment
    const commentRes = await fetch(`${BASE}/tasks/${createdTask.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ content: "Automated test comment from Member Bob" }),
    });
    const comment = await commentRes.json();
    assert(commentRes.status === 201 && comment.content.includes("Automated test"), "Member can add comments");

    // 13. RBAC: Viewer CANNOT add comment
    const viewerCommentRes = await fetch(`${BASE}/tasks/${createdTask.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ content: "Viewer unauthorized comment" }),
    });
    assert(viewerCommentRes.status === 403, "Viewer CANNOT add comments (403 Forbidden)");

    // 14. Activity Log reflects actions
    const actRes = await fetch(`${BASE}/workspaces/${ws.id}/activity`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const activities = await actRes.json();
    assert(Array.isArray(activities) && activities.length > 0, "Activity log tracks workspace actions");

    // 15. CSV Export produces valid CSV
    const exportRes = await fetch(`${BASE}/workspaces/${ws.id}/export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const csv = await exportRes.text();
    assert(csv.startsWith("ID,Title,Status,Priority") && csv.includes("Test Task Automated E2E"), "CSV export generates valid data");

    // 16. Admin can delete task
    const delRes = await fetch(`${BASE}/tasks/${createdTask.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(delRes.status === 200, "Admin can delete tasks");

    console.log("==================================================");
    console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  }
}

runTests();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding TechSters Kanban database...");

  // Create demo users
  const passwordHash = await bcrypt.hash("password123", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@techsters.dev" },
    update: { systemRole: "ADMIN" },
    create: {
      email: "alice@techsters.dev",
      name: "Alice (Admin)",
      password: passwordHash,
      systemRole: "ADMIN",
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@techsters.dev" },
    update: { systemRole: "MEMBER" },
    create: {
      email: "bob@techsters.dev",
      name: "Bob (Member)",
      password: passwordHash,
      systemRole: "MEMBER",
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: "carol@techsters.dev" },
    update: { systemRole: "MEMBER" },
    create: {
      email: "carol@techsters.dev",
      name: "Carol (Viewer)",
      password: passwordHash,
      systemRole: "MEMBER",
    },
  });

  // Create workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "techsters-avishkar26" },
    update: {},
    create: {
      name: "TechSters – AVISHKAR'26",
      description: "Main workspace for the AVISHKAR 2026 Hackathon project.",
      slug: "techsters-avishkar26",
    },
  });

  // Add members
  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: alice.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: alice.id, workspaceId: workspace.id, role: "ADMIN" },
  });
  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: bob.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: bob.id, workspaceId: workspace.id, role: "MEMBER" },
  });
  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: carol.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: carol.id, workspaceId: workspace.id, role: "VIEWER" },
  });

  // Create board
  const board = await prisma.board.upsert({
    where: { id: "board-seed-1" },
    update: {},
    create: {
      id: "board-seed-1",
      name: "Sprint 1 – Hackathon MVP",
      description: "AVISHKAR'26 development sprint board",
      workspaceId: workspace.id,
    },
  });

  // Create columns
  const todo = await prisma.column.upsert({ where: { id: "col-todo" }, update: {}, create: { id: "col-todo", name: "TO DO", position: 0, boardId: board.id } });
  const inprog = await prisma.column.upsert({ where: { id: "col-inprog" }, update: {}, create: { id: "col-inprog", name: "IN PROGRESS", position: 1, boardId: board.id } });
  const done = await prisma.column.upsert({ where: { id: "col-done" }, update: {}, create: { id: "col-done", name: "DONE", position: 2, boardId: board.id } });

  // Create tasks
  const task1 = await prisma.task.upsert({
    where: { id: "task-1" },
    update: {},
    create: {
      id: "task-1",
      title: "Design Prisma schema",
      description: "Create all models: User, Workspace, Board, Column, Task, Comment, ActivityLog",
      priority: "HIGH",
      position: 0,
      labels: ["database", "backend"],
      columnId: done.id,
      creatorId: alice.id,
      assigneeId: alice.id,
    },
  });

  const task2 = await prisma.task.upsert({
    where: { id: "task-2" },
    update: {},
    create: {
      id: "task-2",
      title: "Implement JWT Authentication",
      description: "Register, login with bcrypt hashing, JWT tokens",
      priority: "HIGH",
      position: 0,
      labels: ["backend", "auth"],
      columnId: inprog.id,
      creatorId: alice.id,
      assigneeId: bob.id,
    },
  });

  const task3 = await prisma.task.upsert({
    where: { id: "task-3" },
    update: {},
    create: {
      id: "task-3",
      title: "Build Kanban drag-and-drop UI",
      description: "React DnD with real-time updates via Socket.IO",
      priority: "HIGH",
      position: 0,
      labels: ["frontend"],
      columnId: todo.id,
      creatorId: alice.id,
      assigneeId: bob.id,
    },
  });

  const task4 = await prisma.task.upsert({
    where: { id: "task-4" },
    update: {},
    create: {
      id: "task-4",
      title: "Integrate Socket.IO real-time events",
      description: "task_created, task_moved, task_updated, task_deleted, new_comment",
      priority: "MEDIUM",
      position: 1,
      labels: ["integration", "socket"],
      columnId: todo.id,
      creatorId: alice.id,
    },
  });

  // Add demo comment
  await prisma.comment.upsert({
    where: { id: "cmt-1" },
    update: {},
    create: {
      id: "cmt-1",
      content: "Schema design complete! Used Prisma with PostgreSQL and all required models.",
      taskId: task1.id,
      authorId: alice.id,
    },
  });

  // Activity logs
  await prisma.activityLog.createMany({
    skipDuplicates: true,
    data: [
      { id: "act-1", action: "task_created", userId: alice.id, workspaceId: workspace.id, taskId: task1.id, details: { title: task1.title } },
      { id: "act-2", action: "task_created", userId: alice.id, workspaceId: workspace.id, taskId: task2.id, details: { title: task2.title } },
      { id: "act-3", action: "task_moved", userId: alice.id, workspaceId: workspace.id, taskId: task1.id, details: { from: "TO DO", to: "DONE" } },
    ],
  });

  // Sample project feedback
  await prisma.projectFeedback.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "fb-1",
        rating: 5,
        category: "COLLABORATION",
        message: "Real-time Socket.IO board sync across teammates is super fast and reliable!",
        userId: bob.id,
        workspaceId: workspace.id,
      },
      {
        id: "fb-2",
        rating: 4,
        category: "UX_DESIGN",
        message: "Clean dark dashboard layout makes sprint tracking effortless.",
        userId: carol.id,
        workspaceId: workspace.id,
      },
    ],
  });

  // Second Admin-only Project for 2nd-portal join request demonstration
  const alphaProject = await prisma.workspace.upsert({
    where: { slug: "enterprise-alpha" },
    update: {},
    create: {
      name: "Enterprise Alpha Core",
      description: "Restricted core engineering workspace (requires Admin approval to join).",
      slug: "enterprise-alpha",
    },
  });

  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: alice.id, workspaceId: alphaProject.id } },
    update: {},
    create: { userId: alice.id, workspaceId: alphaProject.id, role: "ADMIN" },
  });

  const alphaBoard = await prisma.board.upsert({
    where: { id: "board-alpha-1" },
    update: {},
    create: {
      id: "board-alpha-1",
      name: "Alpha Architecture Sprint",
      description: "Core infrastructure tasks",
      workspaceId: alphaProject.id,
    },
  });

  await prisma.column.upsert({ where: { id: "col-alpha-todo" }, update: {}, create: { id: "col-alpha-todo", name: "TO DO", position: 0, boardId: alphaBoard.id } });
  await prisma.column.upsert({ where: { id: "col-alpha-inprog" }, update: {}, create: { id: "col-alpha-inprog", name: "IN PROGRESS", position: 1, boardId: alphaBoard.id } });
  await prisma.column.upsert({ where: { id: "col-alpha-done" }, update: {}, create: { id: "col-alpha-done", name: "DONE", position: 2, boardId: alphaBoard.id } });

  console.log("✅ Seed complete!");
  console.log(`  Users: alice@techsters.dev, bob@techsters.dev, carol@techsters.dev (all pw: password123)`);
  console.log(`  Workspace: ${workspace.name}`);
  console.log(`  Board: ${board.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

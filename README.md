# TechSters – Context-Aware Collaborative Kanban (v2.0)

[![Hackathon](https://img.shields.io/badge/AVISHKAR'26-24hr_Hackathon-blue.svg)](https://avishkar.dev)
[![Team](https://img.shields.io/badge/Team-TechSters-indigo.svg)](https://github.com)
[![Team ID](https://img.shields.io/badge/Team_ID-AV26--00734FF57E-success.svg)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **Context-Aware Real-Time Collaborative Kanban Platform with Role-Based Access Control**  
> Built for **AVISHKAR'26** by Team **TechSters** (`AV26-00734FF57E`). Preserves the reasoning behind work, enables private blocker signaling, structures task handoffs, monitors member activation, and computes deterministic project health telemetry.

---

## 1. Project Overview & Identity

- **Project Name:** TechSters – Context-Aware Collaborative Kanban
- **Problem Statement:** Real-Time Collaborative Kanban Board with Role Permissions & Context Continuity
- **Hackathon:** AVISHKAR'26 (24-Hour Hackathon)
- **Team Name:** TechSters
- **Team ID:** `AV26-00734FF57E`

---

## 2. Core & TechSters 2.0 Signature Capabilities

### A. Task Memory Capsule
Every task stores an append-only chronological engineering capsule inside its **Memory** tab (never overwriting prior notes):
- Original problem or reason for creating the task
- Expected outcome & acceptance vision
- Work already completed
- Approaches attempted
- Technical decisions made
- Outstanding questions
- Next recommended action
- Supporting links and references
- Full author + timestamp attribution & Context Handoff Preview on ownership transfer

### B. Silent Blocker Radar
Structured, privacy-aware blocker reporting directly from tasks and surfaced in dashboard widgets:
- Selectable blocker types: *I am stuck*, *I need technical assistance*, *I am waiting for another person*, *Requirements are unclear*, *I need additional resources*
- Severity levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and live elapsed unresolved duration (`⏱ Open Xh Ym`)
- Server-enforced privacy modes:
  - `REPORTER_AND_ADMINS` (Silent: only reporter & workspace admins see the blocker)
  - `PRIVATE_ADMINS` (Protected: status visible to team; explanation visible only to reporter & workspace admins)
  - `TEAM` (Visible to all authorized workspace members)
- Resolution workflow for reporters and acknowledgment/management for workspace admins

### C. Auto Handoff Mode
Meaningful structured task transfers between authorized workspace members:
- Captures what has been completed, remaining work, problems encountered, technical decisions, recommended first step, and important links/files
- Permanent chronological handoff timeline linked to the task
- Direct access to the Task Memory Capsule inside each handoff record
- Real-time notifications (`handoff_created`, `handoff_acknowledged`), unread handoff badges, and explicit receiver acknowledgment

### D. Project Health Pulse
Transparent, non-punitive, deterministic health analysis computed directly from PostgreSQL records (zero hardcoded scores, no external AI dependencies):
- Overall Health Score (`0–100` across `HEALTHY`, `AT_RISK`, `CRITICAL`) with snapshot delta
- Risk indicators: Overdue tasks, Unresolved blockers by severity, Stale tasks (`>5d` no update), Tasks waiting for review, Tasks exceeding `expectedHours`, Completed vs Pending progress
- Plain-language warning explanations for every deduction
- Weekly progress summary, task aging metrics, and historical health snapshot trends

### E. Member & User Activation Status (Admin Lobby)
- Admin Lobby displays live account activation (`Activated` / `Deactivated`), session presence (`Online Now`, `Recently Active`, `Offline`, `Never Logged In`), `lastLoginAt`, and `lastSeenAt`
- Admins can activate or deactivate accounts server-side (deactivated users cannot log in and active tokens/sockets are immediately revoked)

### F. Local Workspace Assistant & Project Governance
- **TechSters Local Chatbot (`POST /api/chat`):** Zero-API-key deterministic workspace intelligence assistant (with optional `OLLAMA_URL` local LLM integration) available across all authenticated views via the floating **Local Assistant** drawer. Strictly scoped to authorized workspace memberships and Silent Blocker privacy rules, with deep-links straight into task tabs (`Overview`, `Memory`, `Blockers`, `Handoffs`).
- **Delete Project (`DELETE /api/workspaces/:id`):** Workspace `ADMIN`s can permanently delete projects from Admin Lobby, Member Lobby, All Projects, Workspace Settings, and Project Portal with Socket.IO live removal.
- **Assign Project to Members (`GET /api/workspaces/:id/assignable-users`):** Active registered-user picker allowing `ADMIN`s to assign existing users to projects with `ADMIN`/`MEMBER`/`VIEWER` roles or update/remove memberships without memorizing emails.

### G. Foundational Kanban & RBAC Features Preserved
- **Role-Based Access Control:** Workspace-scoped `ADMIN`, `MEMBER`, and `VIEWER` enforced server-side (VIEWER receives `403` on task, memory, blocker, handoff, or comment mutations)
- **Interactive Kanban Board:** Drag-and-drop progression, custom columns, filters, badges for active blockers / unread handoffs / memory counts, and inline Health Pulse drawer
- **Unified Task Activity Tab:** Chronological stream merging status changes, comments, Task Memory Capsule entries, visible blockers, handoffs, and acknowledgments
- **Multi-Project Portal, Join Requests, Project Feedback & CSV Export**

---

## 3. Role-Based Access Control (RBAC) Matrix

| Capability | ADMIN | MEMBER | VIEWER |
| :--- | :---: | :---: | :---: |
| Manage workspace members & roles | ✅ | ❌ (403) | ❌ (403) |
| Manage account activation (`/admin/users`) | ✅ (Sys Admin) | ❌ (403) | ❌ (403) |
| Create/edit/move tasks & add comments | ✅ | ✅ | ❌ (403) |
| Delete tasks | ✅ | ❌ (403) | ❌ (403) |
| Append Task Memory Capsule entries | ✅ | ✅ | ❌ (403) |
| Report & resolve own blockers | ✅ | ✅ | ❌ (403) |
| Acknowledge & view private workspace blockers | ✅ | Reporter only | ❌ (Redacted) |
| Create handoffs / acknowledge own handoffs | ✅ | ✅ | ❌ (403) |
| Capture manual health snapshots | ✅ | ❌ (403) | ❌ (403) |
| View boards, permitted context, & CSV export | ✅ | ✅ (No CSV if Viewer) | Read-only (no CSV) |

---

## 4. Architecture & Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Socket.IO Client
- **Backend:** Node.js, Express, TypeScript, Zod, JWT, BcryptJS, Socket.IO
- **Database:** PostgreSQL, Prisma ORM (`backend/prisma/schema.prisma` + `backend/prisma/migrations`)
- **Deployment:** Vercel monorepo Services (`vercel.json`)

---

## 5. Database Models (Prisma)

Core models: `User` (with `isActive`, `lastLoginAt`, `lastSeenAt`), `Workspace`, `WorkspaceMember`, `Board`, `Column`, `Task` (with `expectedHours`), `Comment`, `ActivityLog`, `JoinRequest`, `ProjectFeedback`.

TechSters 2.0 models:
- **`TaskMemoryEntry`**: `originalProblem`, `expectedOutcome`, `workCompleted`, `approachesAttempted`, `technicalDecisions`, `outstandingQuestions`, `nextRecommendedAction`, `supportingLinks`, `taskId`, `workspaceId`, `authorId`, `createdAt`
- **`TaskBlocker`**: `type`, `severity`, `privacy`, `status`, `explanation`, `resolutionNote`, `acknowledgedAt`, `resolvedAt`, `taskId`, `workspaceId`, `reporterId`, `acknowledgedById`, `resolvedById`
- **`TaskHandoff`**: `completedSummary`, `remainingWork`, `problemsEncountered`, `technicalDecisions`, `firstStepRecommended`, `importantLinks`, `taskId`, `workspaceId`, `fromUserId`, `toUserId`, `createdAt`
- **`TaskHandoffAcknowledgment`**: `handoffId` (unique), `userId`, `note`, `acknowledgedAt`
- **`ProjectHealthSnapshot`**: `score`, `overdueCount`, `unresolvedBlockers`, `staleTasksCount`, `reviewWaitingCount`, `exceededTimeCount`, `completedTasks`, `pendingTasks`, `warnings`, `workspaceId`, `createdAt`

---

## 6. Key API Endpoints

### Auth, Workspaces & Admin Activation
- `POST /api/auth/check-email`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/workspaces`, `POST /api/workspaces`, `DELETE /api/workspaces/:id`, `GET /api/workspaces/:id/assignable-users`, `POST /api/workspaces/:id/members`
- `POST /api/chat` – Local workspace intelligence chatbot (RBAC and blocker-privacy scoped)
- `GET /api/admin/stats` – Platform stats, pending requests, blocker/handoff counts & activation counts
- `GET /api/admin/users` – All registered users with activation & online presence status (System `ADMIN`)
- `PATCH /api/admin/users/:id/activate` | `/deactivate` – Toggle account activation (System `ADMIN`)

### Task Memory Capsule
- `GET /api/tasks/:taskId/memory` – Chronological memory entries
- `POST /api/tasks/:taskId/memory` – Append memory capsule entry (`ADMIN`/`MEMBER`)
- `GET /api/memories/recent` – Recent memory entries across authorized workspaces

### Silent Blocker Radar
- `GET /api/tasks/:taskId/blockers` – Privacy-filtered blockers for a task
- `GET /api/workspaces/:workspaceId/blockers` – Privacy-filtered blockers for a workspace
- `GET /api/blockers/active` – Unresolved blockers across user's workspaces
- `POST /api/tasks/:taskId/blockers` – Report blocker (`ADMIN`/`MEMBER`)
- `PATCH /api/blockers/:id` – Acknowledge (`ADMIN`) or resolve (`ADMIN`/reporter) blocker

### Auto Handoff Mode
- `GET /api/tasks/:taskId/handoffs` – Chronological handoff records for a task
- `GET /api/handoffs/pending` – Unacknowledged handoffs assigned to current user
- `GET /api/workspaces/:workspaceId/handoffs` – Workspace handoff history
- `POST /api/tasks/:taskId/handoffs` – Transfer task to authorized workspace member
- `POST /api/handoffs/:id/acknowledge` – Receiver acknowledges handoff

### Project Health Pulse & Unified Timeline
- `GET /api/workspaces/:workspaceId/health` – Deterministic health score, warnings, aging & weekly summary
- `GET /api/workspaces/:workspaceId/health/history` – Historical health snapshots
- `POST /api/workspaces/:workspaceId/health/snapshot` – Capture snapshot (`ADMIN`)
- `GET /api/tasks/:id/timeline` – Unified chronological task history

---

## 7. Real-Time Socket.IO Events

| Event | Direction | Description |
| :--- | :--- | :--- |
| `join_workspace` / `join_admin_lobby` | Client → Server | Verifies membership/admin status and joins scoped rooms |
| `task_created` / `task_moved` / `task_updated` / `task_deleted` | Server → Room | Live Kanban board card updates |
| `new_comment` | Server → Room | Appends comment live |
| `task_memory_updated` | Server → Room | Syncs new Task Memory Capsule entries |
| `blocker_created` / `blocker_updated` / `blocker_resolved` | Server → Authorized Recipients | Emitted to workspace for `TEAM` or strictly to admin + reporter user rooms for private blockers |
| `handoff_created` / `handoff_acknowledged` | Server → Room & Receiver | Updates pending handoff badges and task context |
| `project_health_updated` | Server → Room | Live Project Health Pulse recalculations |
| `user_presence_changed` / `user_status_changed` | Server → Admin Lobby | Updates live online/activation status |

---

## 8. Quick Start & Migrations

```bash
# Backend setup & migrations
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev

# Frontend setup
cd ../frontend
npm install
npm run dev
```

### Verification Commands
```bash
cd backend && npm run typecheck
cd frontend && npx tsc -b && npm run build
```

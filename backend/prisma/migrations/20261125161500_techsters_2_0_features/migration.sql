-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "BlockerType" AS ENUM ('STUCK', 'TECHNICAL_ASSISTANCE', 'WAITING_FOR_PERSON', 'UNCLEAR_REQUIREMENTS', 'NEEDS_RESOURCES');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BlockerSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BlockerPrivacy" AS ENUM ('PRIVATE_ADMINS', 'TEAM', 'REPORTER_AND_ADMINS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable User (idempotent)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

-- AlterTable Task (idempotent)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "expectedHours" INTEGER;

-- CreateTable TaskMemoryEntry (idempotent)
CREATE TABLE IF NOT EXISTS "TaskMemoryEntry" (
    "id" TEXT NOT NULL,
    "originalProblem" TEXT,
    "expectedOutcome" TEXT,
    "workCompleted" TEXT,
    "approachesAttempted" TEXT,
    "technicalDecisions" TEXT,
    "outstandingQuestions" TEXT,
    "nextRecommendedAction" TEXT,
    "supportingLinks" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "TaskMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable TaskBlocker (idempotent)
CREATE TABLE IF NOT EXISTS "TaskBlocker" (
    "id" TEXT NOT NULL,
    "type" "BlockerType" NOT NULL,
    "severity" "BlockerSeverity" NOT NULL DEFAULT 'MEDIUM',
    "privacy" "BlockerPrivacy" NOT NULL DEFAULT 'PRIVATE_ADMINS',
    "status" "BlockerStatus" NOT NULL DEFAULT 'OPEN',
    "explanation" TEXT,
    "resolutionNote" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "acknowledgedById" TEXT,
    "resolvedById" TEXT,

    CONSTRAINT "TaskBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable TaskHandoff (idempotent)
CREATE TABLE IF NOT EXISTS "TaskHandoff" (
    "id" TEXT NOT NULL,
    "completedSummary" TEXT NOT NULL,
    "remainingWork" TEXT NOT NULL,
    "problemsEncountered" TEXT,
    "technicalDecisions" TEXT,
    "firstStepRecommended" TEXT NOT NULL,
    "importantLinks" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,

    CONSTRAINT "TaskHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable TaskHandoffAcknowledgment (idempotent)
CREATE TABLE IF NOT EXISTS "TaskHandoffAcknowledgment" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handoffId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskHandoffAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable ProjectHealthSnapshot (idempotent)
CREATE TABLE IF NOT EXISTS "ProjectHealthSnapshot" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "overdueCount" INTEGER NOT NULL,
    "unresolvedBlockers" INTEGER NOT NULL,
    "staleTasksCount" INTEGER NOT NULL,
    "reviewWaitingCount" INTEGER NOT NULL,
    "exceededTimeCount" INTEGER NOT NULL,
    "completedTasks" INTEGER NOT NULL,
    "pendingTasks" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "ProjectHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "TaskMemoryEntry_taskId_createdAt_idx" ON "TaskMemoryEntry"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "TaskMemoryEntry_workspaceId_idx" ON "TaskMemoryEntry"("workspaceId");
CREATE INDEX IF NOT EXISTS "TaskBlocker_taskId_idx" ON "TaskBlocker"("taskId");
CREATE INDEX IF NOT EXISTS "TaskBlocker_workspaceId_status_idx" ON "TaskBlocker"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "TaskBlocker_reporterId_idx" ON "TaskBlocker"("reporterId");
CREATE INDEX IF NOT EXISTS "TaskHandoff_taskId_createdAt_idx" ON "TaskHandoff"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "TaskHandoff_workspaceId_idx" ON "TaskHandoff"("workspaceId");
CREATE INDEX IF NOT EXISTS "TaskHandoff_toUserId_idx" ON "TaskHandoff"("toUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "TaskHandoffAcknowledgment_handoffId_key" ON "TaskHandoffAcknowledgment"("handoffId");
CREATE INDEX IF NOT EXISTS "TaskHandoffAcknowledgment_userId_idx" ON "TaskHandoffAcknowledgment"("userId");
CREATE INDEX IF NOT EXISTS "ProjectHealthSnapshot_workspaceId_createdAt_idx" ON "ProjectHealthSnapshot"("workspaceId", "createdAt");

-- AddForeignKey (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE "TaskMemoryEntry" ADD CONSTRAINT "TaskMemoryEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskMemoryEntry" ADD CONSTRAINT "TaskMemoryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskMemoryEntry" ADD CONSTRAINT "TaskMemoryEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskHandoffAcknowledgment" ADD CONSTRAINT "TaskHandoffAcknowledgment_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "TaskHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskHandoffAcknowledgment" ADD CONSTRAINT "TaskHandoffAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectHealthSnapshot" ADD CONSTRAINT "ProjectHealthSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

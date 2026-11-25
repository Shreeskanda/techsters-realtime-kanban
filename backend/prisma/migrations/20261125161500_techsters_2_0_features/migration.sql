-- CreateEnum
CREATE TYPE "BlockerType" AS ENUM ('STUCK', 'TECHNICAL_ASSISTANCE', 'WAITING_FOR_PERSON', 'UNCLEAR_REQUIREMENTS', 'NEEDS_RESOURCES');

-- CreateEnum
CREATE TYPE "BlockerSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BlockerPrivacy" AS ENUM ('PRIVATE_ADMINS', 'TEAM', 'REPORTER_AND_ADMINS');

-- CreateEnum
CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "expectedHours" INTEGER;

-- CreateTable
CREATE TABLE "TaskMemoryEntry" (
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

-- CreateTable
CREATE TABLE "TaskBlocker" (
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

-- CreateTable
CREATE TABLE "TaskHandoff" (
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

-- CreateTable
CREATE TABLE "TaskHandoffAcknowledgment" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handoffId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskHandoffAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectHealthSnapshot" (
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

-- CreateIndex
CREATE INDEX "TaskMemoryEntry_taskId_createdAt_idx" ON "TaskMemoryEntry"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskMemoryEntry_workspaceId_idx" ON "TaskMemoryEntry"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskBlocker_taskId_idx" ON "TaskBlocker"("taskId");

-- CreateIndex
CREATE INDEX "TaskBlocker_workspaceId_status_idx" ON "TaskBlocker"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TaskBlocker_reporterId_idx" ON "TaskBlocker"("reporterId");

-- CreateIndex
CREATE INDEX "TaskHandoff_taskId_createdAt_idx" ON "TaskHandoff"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskHandoff_workspaceId_idx" ON "TaskHandoff"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskHandoff_toUserId_idx" ON "TaskHandoff"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskHandoffAcknowledgment_handoffId_key" ON "TaskHandoffAcknowledgment"("handoffId");

-- CreateIndex
CREATE INDEX "TaskHandoffAcknowledgment_userId_idx" ON "TaskHandoffAcknowledgment"("userId");

-- CreateIndex
CREATE INDEX "ProjectHealthSnapshot_workspaceId_createdAt_idx" ON "ProjectHealthSnapshot"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskMemoryEntry" ADD CONSTRAINT "TaskMemoryEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMemoryEntry" ADD CONSTRAINT "TaskMemoryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMemoryEntry" ADD CONSTRAINT "TaskMemoryEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlocker" ADD CONSTRAINT "TaskBlocker_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandoff" ADD CONSTRAINT "TaskHandoff_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandoffAcknowledgment" ADD CONSTRAINT "TaskHandoffAcknowledgment_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "TaskHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandoffAcknowledgment" ADD CONSTRAINT "TaskHandoffAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHealthSnapshot" ADD CONSTRAINT "ProjectHealthSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

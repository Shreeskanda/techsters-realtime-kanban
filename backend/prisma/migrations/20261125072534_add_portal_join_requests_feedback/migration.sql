-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "systemRole" "SystemRole" NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFeedback" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "ProjectFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JoinRequest_workspaceId_idx" ON "JoinRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "JoinRequest_userId_idx" ON "JoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JoinRequest_userId_workspaceId_key" ON "JoinRequest"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "ProjectFeedback_workspaceId_idx" ON "ProjectFeedback"("workspaceId");

-- CreateIndex
CREATE INDEX "ProjectFeedback_userId_idx" ON "ProjectFeedback"("userId");

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeedback" ADD CONSTRAINT "ProjectFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeedback" ADD CONSTRAINT "ProjectFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

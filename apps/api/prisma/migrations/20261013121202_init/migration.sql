-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AppCategory" AS ENUM ('OFFICE', 'BROWSER', 'AI', 'COMMUNICATION', 'PDF', 'DEVELOPMENT', 'SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkRelevance" AS ENUM ('WORK', 'NEUTRAL', 'NON_WORK', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "ActivityState" AS ENUM ('ACTIVE', 'IDLE', 'LOCKED');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('AGENT', 'EXTENSION', 'MANUAL');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('IN_SCHEDULE', 'OUTSIDE_SCHEDULE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NEW', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'NEEDS_FIX', 'APPROVED', 'DONE', 'DELAYED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('OWNER', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_FIX', 'APPROVED');

-- CreateEnum
CREATE TYPE "AiAssisted" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AiUsageSource" AS ENUM ('AGENT_ACTIVITY', 'OFFICIAL_API', 'SELF_REPORT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mfaSecretEnc" TEXT,
    "mfaEnabledAt" TIMESTAMPTZ(3),
    "mfaLastUsedStep" BIGINT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "requiresMfa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiresMfa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "mfaVerifiedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" UUID,
    "headUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "departmentId" UUID,
    "position" TEXT,
    "employeeNumber" TEXT,
    "hiredAt" DATE,
    "monitoringConsentAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workstation" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "osVersion" TEXT,
    "machineIdHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEnrollmentCode" (
    "id" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEnrollmentCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInstallation" (
    "id" UUID NOT NULL,
    "workstationId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMPTZ(3),
    "lastConfigVersion" INTEGER,
    "queueDepth" INTEGER,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentErrorReport" (
    "id" UUID NOT NULL,
    "agentInstallationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringPolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "workSchedule" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "idleThresholdSec" INTEGER NOT NULL DEFAULT 300,
    "screenshotsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "screenshotIntervalSec" INTEGER NOT NULL DEFAULT 600,
    "excludedProcesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonitoringPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAssignment" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "departmentId" UUID,
    "employeeId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "processName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "AppCategory" NOT NULL DEFAULT 'OTHER',
    "workRelevance" "WorkRelevance" NOT NULL DEFAULT 'UNCLASSIFIED',
    "aiProviderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySession" (
    "id" UUID NOT NULL,
    "agentInstallationId" UUID NOT NULL,
    "clientSessionId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "agentInstallationId" UUID NOT NULL,
    "clientEventId" UUID NOT NULL,
    "sessionId" UUID,
    "employeeId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "domain" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "activeSec" INTEGER NOT NULL,
    "idleSec" INTEGER NOT NULL,
    "state" "ActivityState" NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'AGENT',
    "confidence" "Confidence" NOT NULL DEFAULT 'HIGH',
    "monitoringStatus" "MonitoringStatus" NOT NULL DEFAULT 'IN_SCHEDULE',
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id","startedAt")
) PARTITION BY RANGE ("startedAt");

-- Qo'lda qo'shilgan: oylik partitsiyalar ilova tomonidan yaratiladi
-- (nwi_ensure_activity_partition); mos partitsiya bo'lmasa yozuv shu yerga tushadi.
CREATE TABLE "ActivityEvent_default" PARTITION OF "ActivityEvent" DEFAULT;

-- CreateTable
CREATE TABLE "DailyActivitySummary" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "applicationId" UUID NOT NULL,
    "activeSec" INTEGER NOT NULL DEFAULT 0,
    "idleSec" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyActivitySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkSummary" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "observedSec" INTEGER NOT NULL DEFAULT 0,
    "activeSec" INTEGER NOT NULL DEFAULT 0,
    "idleSec" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyWorkSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screenshot" (
    "id" UUID NOT NULL,
    "agentInstallationId" UUID NOT NULL,
    "clientCaptureId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "encKeyWrapped" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenshotView" (
    "id" UUID NOT NULL,
    "screenshotId" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "ip" TEXT,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenshotView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditationCriterion" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "direction" TEXT,
    "parentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccreditationCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "direction" TEXT,
    "criterionId" UUID,
    "ownerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "expectedResult" TEXT,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "delayReason" TEXT,
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "role" "AssignmentRole" NOT NULL DEFAULT 'COLLABORATOR',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "fromStatus" "TaskStatus",
    "toStatus" "TaskStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT,
    "createdById" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "qualityScore" INTEGER,
    "aiAssisted" "AiAssisted" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "processNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageSession" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "taskId" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "activeSec" INTEGER,
    "source" "AiUsageSource" NOT NULL,
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "externalRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageEvent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AIUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIResultSubmission" (
    "id" UUID NOT NULL,
    "sessionId" UUID,
    "taskId" UUID NOT NULL,
    "documentId" UUID,
    "submittedById" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIResultSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "generatedById" UUID NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataCompletenessPct" DOUBLE PRECISION,
    "format" TEXT NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorAgentId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "diff" JSONB,
    "requestId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" UUID NOT NULL,
    "dataType" TEXT NOT NULL,
    "retainDays" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScoreFormula" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "minDataRequirements" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScoreFormula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_userId_codeHash_key" ON "MfaRecoveryCode"("userId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE INDEX "Department_headUserId_idx" ON "Department"("headUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_employeeNumber_key" ON "EmployeeProfile"("employeeNumber");

-- CreateIndex
CREATE INDEX "EmployeeProfile_departmentId_idx" ON "EmployeeProfile"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Workstation_machineIdHash_key" ON "Workstation"("machineIdHash");

-- CreateIndex
CREATE INDEX "Workstation_employeeId_idx" ON "Workstation"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentEnrollmentCode_codeHash_key" ON "AgentEnrollmentCode"("codeHash");

-- CreateIndex
CREATE INDEX "AgentEnrollmentCode_employeeId_idx" ON "AgentEnrollmentCode"("employeeId");

-- CreateIndex
CREATE INDEX "AgentEnrollmentCode_expiresAt_idx" ON "AgentEnrollmentCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentInstallation_tokenHash_key" ON "AgentInstallation"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentInstallation_workstationId_idx" ON "AgentInstallation"("workstationId");

-- CreateIndex
CREATE INDEX "AgentInstallation_status_lastSeenAt_idx" ON "AgentInstallation"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "AgentErrorReport_agentInstallationId_occurredAt_idx" ON "AgentErrorReport"("agentInstallationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringPolicy_name_key" ON "MonitoringPolicy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAssignment_departmentId_key" ON "PolicyAssignment"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAssignment_employeeId_key" ON "PolicyAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "PolicyAssignment_policyId_idx" ON "PolicyAssignment"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_processName_key" ON "Application"("processName");

-- CreateIndex
CREATE INDEX "Application_category_idx" ON "Application"("category");

-- CreateIndex
CREATE INDEX "Application_aiProviderId_idx" ON "Application"("aiProviderId");

-- CreateIndex
CREATE INDEX "ActivitySession_employeeId_startedAt_idx" ON "ActivitySession"("employeeId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySession_agentInstallationId_clientSessionId_key" ON "ActivitySession"("agentInstallationId", "clientSessionId");

-- CreateIndex
CREATE INDEX "ActivityEvent_employeeId_startedAt_idx" ON "ActivityEvent"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_applicationId_startedAt_idx" ON "ActivityEvent"("applicationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_agentInstallationId_clientEventId_startedAt_key" ON "ActivityEvent"("agentInstallationId", "clientEventId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyActivitySummary_date_idx" ON "DailyActivitySummary"("date");

-- CreateIndex
CREATE INDEX "DailyActivitySummary_applicationId_date_idx" ON "DailyActivitySummary"("applicationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivitySummary_employeeId_date_applicationId_key" ON "DailyActivitySummary"("employeeId", "date", "applicationId");

-- CreateIndex
CREATE INDEX "DailyWorkSummary_date_idx" ON "DailyWorkSummary"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkSummary_employeeId_date_key" ON "DailyWorkSummary"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Screenshot_employeeId_capturedAt_idx" ON "Screenshot"("employeeId", "capturedAt");

-- CreateIndex
CREATE INDEX "Screenshot_expiresAt_idx" ON "Screenshot"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_agentInstallationId_clientCaptureId_key" ON "Screenshot"("agentInstallationId", "clientCaptureId");

-- CreateIndex
CREATE INDEX "ScreenshotView_screenshotId_viewedAt_idx" ON "ScreenshotView"("screenshotId", "viewedAt");

-- CreateIndex
CREATE INDEX "ScreenshotView_viewerId_viewedAt_idx" ON "ScreenshotView"("viewerId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccreditationCriterion_code_key" ON "AccreditationCriterion"("code");

-- CreateIndex
CREATE INDEX "AccreditationCriterion_parentId_idx" ON "AccreditationCriterion"("parentId");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_ownerId_idx" ON "Task"("ownerId");

-- CreateIndex
CREATE INDEX "Task_criterionId_idx" ON "Task"("criterionId");

-- CreateIndex
CREATE INDEX "TaskAssignment_employeeId_idx" ON "TaskAssignment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_taskId_employeeId_key" ON "TaskAssignment"("taskId", "employeeId");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_taskId_changedAt_idx" ON "TaskStatusHistory"("taskId", "changedAt");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_taskId_status_idx" ON "Document"("taskId", "status");

-- CreateIndex
CREATE INDEX "Document_createdById_idx" ON "Document"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNo_key" ON "DocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_sha256_key" ON "DocumentVersion"("documentId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "AIProvider_code_key" ON "AIProvider"("code");

-- CreateIndex
CREATE INDEX "AIUsageSession_employeeId_startedAt_idx" ON "AIUsageSession"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "AIUsageSession_taskId_idx" ON "AIUsageSession"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageSession_providerId_source_externalRef_key" ON "AIUsageSession"("providerId", "source", "externalRef");

-- CreateIndex
CREATE INDEX "AIUsageEvent_sessionId_occurredAt_idx" ON "AIUsageEvent"("sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "AIResultSubmission_taskId_idx" ON "AIResultSubmission"("taskId");

-- CreateIndex
CREATE INDEX "AIResultSubmission_submittedById_idx" ON "AIResultSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "Report_generatedById_generatedAt_idx" ON "Report"("generatedById", "generatedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_occurredAt_idx" ON "AuditLog"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_occurredAt_idx" ON "AuditLog"("action", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_dataType_key" ON "RetentionPolicy"("dataType");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreFormula_name_key" ON "ScoreFormula"("name");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEnrollmentCode" ADD CONSTRAINT "AgentEnrollmentCode_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEnrollmentCode" ADD CONSTRAINT "AgentEnrollmentCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstallation" ADD CONSTRAINT "AgentInstallation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentErrorReport" ADD CONSTRAINT "AgentErrorReport_agentInstallationId_fkey" FOREIGN KEY ("agentInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "MonitoringPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "AIProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_agentInstallationId_fkey" FOREIGN KEY ("agentInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_agentInstallationId_fkey" FOREIGN KEY ("agentInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ActivitySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyActivitySummary" ADD CONSTRAINT "DailyActivitySummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyActivitySummary" ADD CONSTRAINT "DailyActivitySummary_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkSummary" ADD CONSTRAINT "DailyWorkSummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_agentInstallationId_fkey" FOREIGN KEY ("agentInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenshotView" ADD CONSTRAINT "ScreenshotView_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "Screenshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenshotView" ADD CONSTRAINT "ScreenshotView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditationCriterion" ADD CONSTRAINT "AccreditationCriterion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccreditationCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AccreditationCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageSession" ADD CONSTRAINT "AIUsageSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageSession" ADD CONSTRAINT "AIUsageSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageSession" ADD CONSTRAINT "AIUsageSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIUsageSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIResultSubmission" ADD CONSTRAINT "AIResultSubmission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIUsageSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIResultSubmission" ADD CONSTRAINT "AIResultSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIResultSubmission" ADD CONSTRAINT "AIResultSubmission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIResultSubmission" ADD CONSTRAINT "AIResultSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIResultSubmission" ADD CONSTRAINT "AIResultSubmission_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreFormula" ADD CONSTRAINT "ScoreFormula_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Qo'lda qo'shilgan: Prisma ifodalay olmaydigan cheklovlar ─────────────

ALTER TABLE "ActivityEvent"
  ADD CONSTRAINT "ActivityEvent_interval_check" CHECK ("endedAt" > "startedAt"),
  ADD CONSTRAINT "ActivityEvent_seconds_check" CHECK (
    "activeSec" >= 0 AND "idleSec" >= 0
    AND "activeSec" + "idleSec" <= CEIL(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")))
  );

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_progressPct_check" CHECK ("progressPct" BETWEEN 0 AND 100);

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_qualityScore_check" CHECK ("qualityScore" IS NULL OR "qualityScore" BETWEEN 1 AND 5);

ALTER TABLE "PolicyAssignment"
  ADD CONSTRAINT "PolicyAssignment_target_check" CHECK (num_nonnulls("departmentId", "employeeId") = 1);

ALTER TABLE "MonitoringPolicy"
  ADD CONSTRAINT "MonitoringPolicy_thresholds_check" CHECK ("idleThresholdSec" >= 30 AND "screenshotIntervalSec" >= 60);

ALTER TABLE "RetentionPolicy"
  ADD CONSTRAINT "RetentionPolicy_retainDays_check" CHECK ("retainDays" >= 1);

ALTER TABLE "AIUsageSession"
  ADD CONSTRAINT "AIUsageSession_interval_check" CHECK ("endedAt" >= "startedAt");

-- Faqat bitta sukut bo'yicha monitoring siyosati bo'lishi mumkin.
CREATE UNIQUE INDEX "MonitoringPolicy_single_default_idx" ON "MonitoringPolicy" ("isDefault") WHERE "isDefault";

-- Berilgan oy uchun ActivityEvent partitsiyasini yaratadi (mavjud bo'lsa hech narsa qilmaydi).
CREATE FUNCTION nwi_ensure_activity_partition(month_start date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  from_ts date := date_trunc('month', month_start)::date;
  to_ts date := (date_trunc('month', month_start) + interval '1 month')::date;
  part_name text := 'ActivityEvent_' || to_char(from_ts, 'YYYY_MM');
BEGIN
  IF to_regclass(format('%I', part_name)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "ActivityEvent" FOR VALUES FROM (%L) TO (%L)',
      part_name, from_ts::timestamp AT TIME ZONE 'UTC', to_ts::timestamp AT TIME ZONE 'UTC'
    );
  END IF;
EXCEPTION
  -- Parallel so'rov partitsiyani allaqachon yaratgan.
  WHEN duplicate_table THEN NULL;
  -- Sukut bo'yicha partitsiyada shu oyga tegishli qatorlar bor: ular o'sha yerda qoladi.
  WHEN check_violation THEN NULL;
END;
$$;

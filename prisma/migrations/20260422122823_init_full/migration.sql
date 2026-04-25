-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ACCOUNTANT', 'HR', 'OPERATIONS_MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStage" AS ENUM ('ASSIGNEE_PRE_DUE', 'ASSIGNEE_DUE_TODAY', 'ASSIGNEE_OVERDUE', 'ASSIGNEE_MANAGER_RESPONSE', 'MANAGER_OVERDUE_ESCALATION', 'MANAGER_APPROVAL_NUDGE', 'MANAGER_BLOCKER_ALERT', 'MANAGER_MORNING_DIGEST', 'MANAGER_MIDDAY_DIGEST');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkDecisionKind" AS ENUM ('APPROVAL_DECISION', 'DOCUMENT_DECISION', 'PAYMENT_APPROVAL', 'ESCALATION_REVIEW');

-- CreateEnum
CREATE TYPE "WorkDecisionStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpsEventTopic" AS ENUM ('DOCUMENT_EXTRACTION_REQUESTED', 'DOCUMENT_VERIFICATION_REQUESTED', 'BLOCKER_ESCALATION_REQUESTED', 'DECISION_SYNC_REQUESTED', 'WORK_ITEM_SUBMITTED', 'WHATSAPP_INTAKE_RECEIVED');

-- CreateEnum
CREATE TYPE "OpsEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEntity" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER NOT NULL,

    CONSTRAINT "ClientEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "department" TEXT,
    "name" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "phoneNumber" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "whatsappConsentAt" TIMESTAMP(3),
    "organizationId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "documentUrl" TEXT,
    "category" TEXT NOT NULL,
    "riskScore" TEXT,
    "aiPriorityIndex" DOUBLE PRECISION,
    "aiTags" TEXT[],
    "organizationId" INTEGER,
    "clientEntityId" INTEGER,
    "userId" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "remindDaysBefore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "documentUrl" TEXT,
    "category" TEXT NOT NULL,
    "notes" TEXT,
    "workflowState" JSONB,
    "workflowVersion" INTEGER NOT NULL DEFAULT 2,
    "workflowUpdatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "riskScore" TEXT,
    "aiPriorityIndex" DOUBLE PRECISION,
    "aiTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER,
    "clientEntityId" INTEGER,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "remindDaysBefore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "category" TEXT NOT NULL,
    "requiredDocumentLabel" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "riskScore" TEXT,
    "aiPriorityIndex" DOUBLE PRECISION,
    "aiTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER,
    "clientEntityId" INTEGER,
    "userId" INTEGER NOT NULL,
    "legacyComplianceItemId" INTEGER,
    "legacyTaskId" INTEGER,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemChecklistItem" (
    "id" SERIAL NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" INTEGER,

    CONSTRAINT "WorkItemChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemBlocker" (
    "id" SERIAL NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "waitingOn" TEXT,
    "needsManagerHelp" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedById" INTEGER,
    "clearedAt" TIMESTAMP(3),
    "clearedById" INTEGER,
    "resolutionNote" TEXT,
    "managerResponseKind" TEXT,
    "managerResponseLabel" TEXT,
    "managerResponseNote" TEXT,
    "managerRespondedAt" TIMESTAMP(3),
    "managerRespondedById" INTEGER,

    CONSTRAINT "WorkItemBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemApproval" (
    "id" SERIAL NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "submissionNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "decidedById" INTEGER,
    "rejectionReason" TEXT,
    "managerResponseKind" TEXT,
    "managerResponseLabel" TEXT,
    "managerResponseNote" TEXT,
    "managerRespondedAt" TIMESTAMP(3),
    "managerRespondedById" INTEGER,

    CONSTRAINT "WorkItemApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemEvidence" (
    "id" SERIAL NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PROOF',
    "label" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "documentId" INTEGER,
    "documentVersionId" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,

    CONSTRAINT "WorkItemEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemAuditEvent" (
    "id" SERIAL NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" INTEGER,

    CONSTRAINT "WorkItemAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "organizationId" INTEGER,
    "clientEntityId" INTEGER,
    "ownerUserId" INTEGER,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileExtension" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL_PRIVATE',
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER,
    "checksum" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "documentVersionId" INTEGER NOT NULL,
    "readStatus" TEXT NOT NULL,
    "engine" TEXT,
    "textPreview" TEXT,
    "extractedText" TEXT,
    "extractedFields" JSONB,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVerification" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "documentVersionId" INTEGER NOT NULL,
    "workItemId" INTEGER,
    "status" TEXT NOT NULL,
    "verificationSource" TEXT NOT NULL DEFAULT 'SYSTEM',
    "summary" TEXT,
    "fields" JSONB,
    "mismatches" JSONB,
    "notes" JSONB,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDecision" (
    "id" SERIAL NOT NULL,
    "kind" "WorkDecisionKind" NOT NULL,
    "status" "WorkDecisionStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER,
    "clientEntityId" INTEGER,
    "workItemId" INTEGER,
    "documentId" INTEGER,
    "documentVersionId" INTEGER,
    "sourceBlockerId" INTEGER,
    "sourceApprovalId" INTEGER,
    "requestedById" INTEGER,
    "assignedToId" INTEGER,
    "resolvedById" INTEGER,

    CONSTRAINT "WorkDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDecisionAuditEvent" (
    "id" SERIAL NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" INTEGER,

    CONSTRAINT "WorkDecisionAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEvent" (
    "id" SERIAL NOT NULL,
    "topic" "OpsEventTopic" NOT NULL,
    "status" "OpsEventStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER,
    "clientEntityId" INTEGER,
    "workItemId" INTEGER,
    "documentId" INTEGER,
    "documentVersionId" INTEGER,
    "decisionId" INTEGER,

    CONSTRAINT "OpsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTrace" (
    "id" SERIAL NOT NULL,
    "query" TEXT NOT NULL,
    "intent" TEXT,
    "toolName" TEXT,
    "mode" TEXT NOT NULL,
    "replyPreview" TEXT NOT NULL,
    "grounding" TEXT,
    "historyDepth" INTEGER NOT NULL DEFAULT 0,
    "usedSnapshot" BOOLEAN NOT NULL DEFAULT true,
    "usedDocumentSearch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" INTEGER,
    "userId" INTEGER,

    CONSTRAINT "AssistantTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantEvaluation" (
    "id" SERIAL NOT NULL,
    "traceId" INTEGER NOT NULL,
    "evaluator" TEXT NOT NULL DEFAULT 'HEURISTIC_V1',
    "overallScore" DOUBLE PRECISION NOT NULL,
    "groundingScore" DOUBLE PRECISION NOT NULL,
    "actionabilityScore" DOUBLE PRECISION NOT NULL,
    "completenessScore" DOUBLE PRECISION NOT NULL,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "budgetKES" INTEGER NOT NULL DEFAULT 5000,
    "costKES" INTEGER NOT NULL DEFAULT 0,
    "status" "TrainingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" SERIAL NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileUrl" TEXT,
    "attendanceId" INTEGER NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPERATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "serviceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextServiceDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "performedById" INTEGER NOT NULL,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 5,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "performedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalExpense" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,
    "vendorId" INTEGER,

    CONSTRAINT "OperationalExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReport" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "totalExpenses" DOUBLE PRECISION NOT NULL,
    "maintenanceCost" DOUBLE PRECISION NOT NULL,
    "inventoryValue" DOUBLE PRECISION NOT NULL,
    "generatedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftwareSubscription" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "cost" DOUBLE PRECISION NOT NULL,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "SoftwareSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "relatedId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBehaviorLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBehaviorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" SERIAL NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "stage" "NotificationStage" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "messagePreview" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "complianceItemId" INTEGER,
    "workItemId" INTEGER,
    "userId" INTEGER,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "ClientEntity_organizationId_isActive_idx" ON "ClientEntity"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClientEntity_organizationId_name_key" ON "ClientEntity"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_isActive_idx" ON "User"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Task_organizationId_deadline_idx" ON "Task"("organizationId", "deadline");

-- CreateIndex
CREATE INDEX "Task_clientEntityId_deadline_idx" ON "Task"("clientEntityId", "deadline");

-- CreateIndex
CREATE INDEX "ComplianceItem_organizationId_deadline_idx" ON "ComplianceItem"("organizationId", "deadline");

-- CreateIndex
CREATE INDEX "ComplianceItem_clientEntityId_deadline_idx" ON "ComplianceItem"("clientEntityId", "deadline");

-- CreateIndex
CREATE INDEX "ComplianceItem_status_deadline_idx" ON "ComplianceItem"("status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_legacyComplianceItemId_key" ON "WorkItem"("legacyComplianceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_legacyTaskId_key" ON "WorkItem"("legacyTaskId");

-- CreateIndex
CREATE INDEX "WorkItem_organizationId_deadline_idx" ON "WorkItem"("organizationId", "deadline");

-- CreateIndex
CREATE INDEX "WorkItem_clientEntityId_deadline_idx" ON "WorkItem"("clientEntityId", "deadline");

-- CreateIndex
CREATE INDEX "WorkItem_status_deadline_idx" ON "WorkItem"("status", "deadline");

-- CreateIndex
CREATE INDEX "WorkItem_archivedAt_deadline_idx" ON "WorkItem"("archivedAt", "deadline");

-- CreateIndex
CREATE INDEX "WorkItemChecklistItem_workItemId_sortOrder_idx" ON "WorkItemChecklistItem"("workItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkItemBlocker_workItemId_isActive_blockedAt_idx" ON "WorkItemBlocker"("workItemId", "isActive", "blockedAt");

-- CreateIndex
CREATE INDEX "WorkItemApproval_workItemId_submittedAt_idx" ON "WorkItemApproval"("workItemId", "submittedAt");

-- CreateIndex
CREATE INDEX "WorkItemEvidence_workItemId_isCurrent_uploadedAt_idx" ON "WorkItemEvidence"("workItemId", "isCurrent", "uploadedAt");

-- CreateIndex
CREATE INDEX "WorkItemEvidence_documentId_uploadedAt_idx" ON "WorkItemEvidence"("documentId", "uploadedAt");

-- CreateIndex
CREATE INDEX "WorkItemEvidence_documentVersionId_uploadedAt_idx" ON "WorkItemEvidence"("documentVersionId", "uploadedAt");

-- CreateIndex
CREATE INDEX "WorkItemAuditEvent_workItemId_createdAt_idx" ON "WorkItemAuditEvent"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_organizationId_createdAt_idx" ON "Document"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_clientEntityId_createdAt_idx" ON "Document"("clientEntityId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_ownerUserId_createdAt_idx" ON "Document"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_status_createdAt_idx" ON "Document"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_isCurrent_createdAt_idx" ON "DocumentVersion"("documentId", "isCurrent", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_storageProvider_storageKey_idx" ON "DocumentVersion"("storageProvider", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtraction_documentVersionId_key" ON "DocumentExtraction"("documentVersionId");

-- CreateIndex
CREATE INDEX "DocumentExtraction_documentId_extractedAt_idx" ON "DocumentExtraction"("documentId", "extractedAt");

-- CreateIndex
CREATE INDEX "DocumentVerification_documentId_verifiedAt_idx" ON "DocumentVerification"("documentId", "verifiedAt");

-- CreateIndex
CREATE INDEX "DocumentVerification_workItemId_verifiedAt_idx" ON "DocumentVerification"("workItemId", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVerification_documentVersionId_workItemId_verificat_key" ON "DocumentVerification"("documentVersionId", "workItemId", "verificationSource");

-- CreateIndex
CREATE INDEX "WorkDecision_organizationId_status_dueAt_idx" ON "WorkDecision"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkDecision_workItemId_status_dueAt_idx" ON "WorkDecision"("workItemId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkDecision_assignedToId_status_dueAt_idx" ON "WorkDecision"("assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkDecision_documentVersionId_status_idx" ON "WorkDecision"("documentVersionId", "status");

-- CreateIndex
CREATE INDEX "WorkDecisionAuditEvent_decisionId_createdAt_idx" ON "WorkDecisionAuditEvent"("decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "OpsEvent_status_scheduledAt_idx" ON "OpsEvent"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OpsEvent_topic_status_createdAt_idx" ON "OpsEvent"("topic", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OpsEvent_workItemId_createdAt_idx" ON "OpsEvent"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "OpsEvent_documentVersionId_createdAt_idx" ON "OpsEvent"("documentVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTrace_organizationId_createdAt_idx" ON "AssistantTrace"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTrace_userId_createdAt_idx" ON "AssistantTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantTrace_toolName_createdAt_idx" ON "AssistantTrace"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantEvaluation_traceId_createdAt_idx" ON "AssistantEvaluation"("traceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_trainingId_key" ON "Attendance"("userId", "trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certificateNo_key" ON "Certificate"("certificateNo");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_attendanceId_key" ON "Certificate"("attendanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_name_key" ON "InventoryItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationLog_channel_stage_status_idx" ON "NotificationLog"("channel", "stage", "status");

-- CreateIndex
CREATE INDEX "NotificationLog_complianceItemId_createdAt_idx" ON "NotificationLog"("complianceItemId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_workItemId_createdAt_idx" ON "NotificationLog"("workItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientEntity" ADD CONSTRAINT "ClientEntity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientEntityId_fkey" FOREIGN KEY ("clientEntityId") REFERENCES "ClientEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_clientEntityId_fkey" FOREIGN KEY ("clientEntityId") REFERENCES "ClientEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_clientEntityId_fkey" FOREIGN KEY ("clientEntityId") REFERENCES "ClientEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_legacyComplianceItemId_fkey" FOREIGN KEY ("legacyComplianceItemId") REFERENCES "ComplianceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_legacyTaskId_fkey" FOREIGN KEY ("legacyTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemChecklistItem" ADD CONSTRAINT "WorkItemChecklistItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemChecklistItem" ADD CONSTRAINT "WorkItemChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemBlocker" ADD CONSTRAINT "WorkItemBlocker_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemBlocker" ADD CONSTRAINT "WorkItemBlocker_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemBlocker" ADD CONSTRAINT "WorkItemBlocker_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemBlocker" ADD CONSTRAINT "WorkItemBlocker_managerRespondedById_fkey" FOREIGN KEY ("managerRespondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemApproval" ADD CONSTRAINT "WorkItemApproval_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemApproval" ADD CONSTRAINT "WorkItemApproval_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemApproval" ADD CONSTRAINT "WorkItemApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemApproval" ADD CONSTRAINT "WorkItemApproval_managerRespondedById_fkey" FOREIGN KEY ("managerRespondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemEvidence" ADD CONSTRAINT "WorkItemEvidence_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemEvidence" ADD CONSTRAINT "WorkItemEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemEvidence" ADD CONSTRAINT "WorkItemEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemEvidence" ADD CONSTRAINT "WorkItemEvidence_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemAuditEvent" ADD CONSTRAINT "WorkItemAuditEvent_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemAuditEvent" ADD CONSTRAINT "WorkItemAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientEntityId_fkey" FOREIGN KEY ("clientEntityId") REFERENCES "ClientEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVerification" ADD CONSTRAINT "DocumentVerification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVerification" ADD CONSTRAINT "DocumentVerification_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVerification" ADD CONSTRAINT "DocumentVerification_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_clientEntityId_fkey" FOREIGN KEY ("clientEntityId") REFERENCES "ClientEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_sourceBlockerId_fkey" FOREIGN KEY ("sourceBlockerId") REFERENCES "WorkItemBlocker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_sourceApprovalId_fkey" FOREIGN KEY ("sourceApprovalId") REFERENCES "WorkItemApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecisionAuditEvent" ADD CONSTRAINT "WorkDecisionAuditEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "WorkDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecisionAuditEvent" ADD CONSTRAINT "WorkDecisionAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvent" ADD CONSTRAINT "OpsEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvent" ADD CONSTRAINT "OpsEvent_clientEntityId_fkey" FOREIGN KEY ("clientEntityId") REFERENCES "ClientEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvent" ADD CONSTRAINT "OpsEvent_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvent" ADD CONSTRAINT "OpsEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvent" ADD CONSTRAINT "OpsEvent_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvent" ADD CONSTRAINT "OpsEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "WorkDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTrace" ADD CONSTRAINT "AssistantTrace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTrace" ADD CONSTRAINT "AssistantTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantEvaluation" ADD CONSTRAINT "AssistantEvaluation_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "AssistantTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReport" ADD CONSTRAINT "FinancialReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftwareSubscription" ADD CONSTRAINT "SoftwareSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "ComplianceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

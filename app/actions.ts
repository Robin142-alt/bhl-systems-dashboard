"use server";

import bcrypt from "bcryptjs";
import { addDays, startOfMonth } from "date-fns";
import {
  OpsEventTopic,
  Prisma,
  Role,
  TrainingStatus,
  WorkDecisionKind,
  WorkDecisionStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  blockerReasonCatalog,
  canApproveRole,
  hasActiveBlocker,
  isClosedStatus,
  managerResponseCatalog,
  type ComplianceBlockerCode,
  type ComplianceChecklistItem,
  type ComplianceManagerResponseKind,
} from "@/lib/compliance-workflow";
import {
  buildCompliancePackTasks,
  getCompliancePackDefinition,
  type CompliancePackId,
} from "@/lib/kenya-compliance-packs";
import {
  buildWorkItemScope,
  buildComplianceItemScope,
  ensureScopedUserByEmail,
  ensureUserInOrganization,
  getOrCreateClientEntity,
} from "@/lib/organizations";
import { normalizeKenyanPhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { settleDecisionForWorkItem } from "@/lib/decision-ops";
import {
  ensureLegacyEvidenceDocumentsBackfilled,
  migrateLegacyDocumentVersionStorage,
} from "@/lib/document-registry";
import { enqueueOpsEvent, processOpsEventById } from "@/lib/ops-events";
import {
  createWorkItem,
  createWorkItemsFromPack,
  ensureLegacyComplianceItemsBackfilled,
  ensureLegacyTasksBackfilled,
  getManagedWorkItem,
  hydrateWorkItem,
  listHydratedWorkItems,
  logWorkItemAuditEvent,
  replaceCurrentWorkItemEvidence,
  replaceWorkItemChecklist,
} from "@/lib/work-items";
import {
  retryWhatsAppNotificationLog,
  sendAssigneeManagerResponseNudge,
} from "@/lib/whatsapp-reminders";

interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
}

interface ComplianceActionResult {
  success: boolean;
  message?: string;
}

interface SubmitCompliancePayload {
  id: number;
  checklist: ComplianceChecklistItem[];
  documentUrl: string;
  documentId?: number;
  documentVersionId?: number;
  fileName?: string;
  submissionNote?: string;
}

interface GenerateCompliancePackPayload {
  packId: CompliancePackId;
  year: number;
  userId: number;
}

interface GenerateCompliancePackResult extends ComplianceActionResult {
  createdCount?: number;
  skippedCount?: number;
  packName?: string;
}

interface UpdateWhatsAppSettingsResult extends ComplianceActionResult {
  phoneNumber?: string | null;
  optedIn?: boolean;
}

interface RetryNotificationResult extends ComplianceActionResult {
  status?: string;
}

interface ReportComplianceBlockerPayload {
  id: number;
  code: ComplianceBlockerCode;
  reason: string;
  waitingOn?: string;
  needsManagerHelp: boolean;
}

interface AcknowledgeManagerResponsePayload {
  id: number;
  kind: ComplianceManagerResponseKind;
}

async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return null;
  }

  return ensureScopedUserByEmail(session.user.email);
}

function revalidateComplianceSurfaces() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/compliance");
  revalidatePath("/tasks");
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/copilot");
  revalidatePath("/dashboard/decisions");
}

async function getManagedComplianceItem(id: number, currentUser: AuthenticatedUser) {
  const item = await getManagedWorkItem({
    id,
    organizationId: currentUser.organizationId,
    organizationSlug: currentUser.organizationSlug,
  });

  return item ? hydrateWorkItem(item) : null;
}

function getWorkItemEventContext(item: {
  id: number;
  organizationId?: number | null;
  clientEntityId?: number | null;
}) {
  return {
    workItemId: item.id,
    organizationId: item.organizationId ?? null,
    clientEntityId: item.clientEntityId ?? null,
  };
}

async function queueAndProcessOpsEvent(input: {
  topic: OpsEventTopic;
  dedupeKey?: string | null;
  payload?: Prisma.InputJsonValue;
  organizationId?: number | null;
  clientEntityId?: number | null;
  workItemId?: number | null;
  documentId?: number | null;
  documentVersionId?: number | null;
}) {
  const eventId = await enqueueOpsEvent(prisma, input);
  return processOpsEventById(eventId);
}

/**
 * ==========================================
 * 1. COMPLIANCE & DASHBOARD OVERVIEW
 * ==========================================
 */

export async function getComplianceOverview() {
  try {
    const currentUser = await getAuthenticatedUser();

    if (!currentUser) {
      return { data: [], alerts: 0 };
    }

    const today = new Date();
    const soon = addDays(today, 7);

    const items = await listHydratedWorkItems({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
      canManage: true,
    });

    const upcomingDeadlines = items.filter(
      (item) => item.deadline <= soon && !isClosedStatus(item.status),
    );

    return { data: items, alerts: upcomingDeadlines.length };
  } catch (error) {
    console.error("[dashboard] Failed to fetch overview:", error);
    return { data: [], alerts: 0 };
  }
}

export async function requestDocumentExtraction(
  documentVersionId: number,
): Promise<void> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return;
  }

  const version = await prisma.documentVersion.findFirst({
    where: {
      id: documentVersionId,
      document: {
        is: {
          organizationId: currentUser.organizationId,
        },
      },
    },
    select: {
      id: true,
      documentId: true,
      document: {
        select: {
          organizationId: true,
          clientEntityId: true,
        },
      },
    },
  });

  if (!version) {
    return;
  }

  await queueAndProcessOpsEvent({
    topic: OpsEventTopic.DOCUMENT_EXTRACTION_REQUESTED,
    dedupeKey: `manual-extract:${documentVersionId}`,
    organizationId: version.document.organizationId ?? null,
    clientEntityId: version.document.clientEntityId ?? null,
    documentId: version.documentId,
    documentVersionId: version.id,
    payload: {
      requestedById: currentUser.id,
      source: "MANUAL_DOCUMENT_REGISTRY",
    },
  });

  revalidateComplianceSurfaces();
}

export async function requestWorkItemVerification(
  workItemId: number,
): Promise<void> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return;
  }

  const item = await prisma.workItem.findFirst({
    where: buildWorkItemScope(currentUser.organizationId, currentUser.organizationSlug, {
      id: workItemId,
      archivedAt: null,
    }),
    select: {
      id: true,
      organizationId: true,
      clientEntityId: true,
      evidence: {
        where: {
          documentVersionId: {
            not: null,
          },
        },
        orderBy: [{ isCurrent: "desc" }, { uploadedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          documentId: true,
          documentVersionId: true,
        },
      },
    },
  });

  if (!item) {
    return;
  }

  const currentEvidence = item.evidence[0] || null;

  await queueAndProcessOpsEvent({
    topic: OpsEventTopic.DOCUMENT_VERIFICATION_REQUESTED,
    dedupeKey: `manual-verify:${workItemId}`,
    organizationId: item.organizationId ?? null,
    clientEntityId: item.clientEntityId ?? null,
    workItemId: item.id,
    documentId: currentEvidence?.documentId ?? null,
    documentVersionId: currentEvidence?.documentVersionId ?? null,
    payload: {
      requestedById: currentUser.id,
      source: "MANUAL_DOCUMENT_REGISTRY",
    },
  });

  revalidateComplianceSurfaces();
}

export async function runLegacyCutoverSync(): Promise<void> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return;
  }

  await ensureLegacyComplianceItemsBackfilled({
    organizationId: currentUser.organizationId,
    organizationSlug: currentUser.organizationSlug,
  });

  await ensureLegacyTasksBackfilled({
    organizationId: currentUser.organizationId,
    organizationSlug: currentUser.organizationSlug,
  });

  await ensureLegacyEvidenceDocumentsBackfilled({
    organizationId: currentUser.organizationId,
  });

  const legacyLogs = await prisma.notificationLog.findMany({
    where: {
      workItemId: null,
      complianceItemId: {
        not: null,
      },
      complianceItem: {
        is: buildComplianceItemScope(currentUser.organizationId, currentUser.organizationSlug, {}),
      },
    },
    select: {
      id: true,
      complianceItem: {
        select: {
          workItem: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  for (const log of legacyLogs) {
    const workItemId = log.complianceItem?.workItem?.id;
    if (!workItemId) {
      continue;
    }

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        workItemId,
      },
    });
  }

  revalidateComplianceSurfaces();
  revalidatePath("/dashboard/intake");
  revalidatePath("/dashboard/portfolio");
  revalidatePath("/dashboard/cutover");
}

export async function migrateLegacyRegistryStorage(): Promise<void> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return;
  }

  const versions = await prisma.documentVersion.findMany({
    where: {
      document: {
        is: {
          organizationId: currentUser.organizationId,
        },
      },
      storageProvider: {
        in: ["LEGACY_PUBLIC_UPLOAD", "LEGACY_TEMP_UPLOAD", "LEGACY_REMOTE_URL"],
      },
    },
    orderBy: [{ id: "asc" }],
    select: {
      id: true,
    },
    take: 50,
  });

  for (const version of versions) {
    await migrateLegacyDocumentVersionStorage(prisma, version.id);
  }

  revalidateComplianceSurfaces();
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/cutover");
}

export async function createComplianceItem(formData: FormData): Promise<void> {
  const currentUser = await getAuthenticatedUser();
  if (!currentUser) return;

  const title = formData.get("title") as string;
  const category = formData.get("category") as string;
  const responsibleInput = formData.get("responsible") as string;
  const deadlineStr = formData.get("deadline") as string;
  const remindDays = parseInt(formData.get("remindDaysBefore") as string, 10) || 7;
  const frequency = (formData.get("frequency") as string) || "Monthly";
  const clientName = (formData.get("clientName") as string) || "";
  const selectedUserId = Number(formData.get("userId"));

  if (!title || !deadlineStr) return;

  try {
    const assignedUser =
      Number.isFinite(selectedUserId) && selectedUserId > 0
        ? await ensureUserInOrganization(selectedUserId, currentUser.organizationId)
        : currentUser;

    if (!assignedUser) return;

    const responsible = responsibleInput?.trim()
      ? responsibleInput.trim()
      : assignedUser.name || assignedUser.email;

    const clientEntity = await getOrCreateClientEntity(
      currentUser.organizationId,
      clientName,
    );

    await createWorkItem({
      title,
      category,
      responsible,
      deadline: new Date(deadlineStr),
      remindDaysBefore: Number(remindDays) || 0,
      frequency,
      organizationId: currentUser.organizationId,
      clientEntityId: clientEntity?.id,
      userId: assignedUser.id,
      createdBy: currentUser,
    });

    revalidateComplianceSurfaces();
  } catch (error) {
    console.error("[compliance] Failed to create item:", error);
  }
}

export async function generateCompliancePack(
  payload: GenerateCompliancePackPayload,
): Promise<GenerateCompliancePackResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return {
      success: false,
      message: "Only a manager can apply a compliance pack.",
    };
  }

  const definition = getCompliancePackDefinition(payload.packId);
  if (!definition) {
    return { success: false, message: "That compliance pack does not exist." };
  }

  if (!Number.isInteger(payload.year) || payload.year < 2024 || payload.year > 2100) {
    return { success: false, message: "Choose a valid rollout year." };
  }

  try {
    const assignedUser = await ensureUserInOrganization(
      payload.userId,
      currentUser.organizationId,
    );

    if (!assignedUser) {
      return { success: false, message: "The selected owner could not be found." };
    }

    const drafts = buildCompliancePackTasks(payload.packId, payload.year);
    const yearStart = new Date(Date.UTC(payload.year, 0, 1, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(payload.year, 11, 31, 23, 59, 59));

    const existingItems = await prisma.workItem.findMany({
      where: buildWorkItemScope(currentUser.organizationId, currentUser.organizationSlug, {
        archivedAt: null,
        userId: assignedUser.id,
        deadline: {
          gte: yearStart,
          lte: yearEnd,
        },
      }),
      select: {
        title: true,
        deadline: true,
      },
    });

    const existingKeys = new Set(
      existingItems.map(
        (item) => `${item.title}::${item.deadline.toISOString().slice(0, 10)}`,
      ),
    );

    const recordsToCreate = drafts
      .filter((draft) => {
        const key = `${draft.title}::${draft.deadline.toISOString().slice(0, 10)}`;
        return !existingKeys.has(key);
      });

    if (recordsToCreate.length > 0) {
      await createWorkItemsFromPack({
        drafts: recordsToCreate,
        organizationId: currentUser.organizationId,
        userId: assignedUser.id,
        responsible: assignedUser.name || assignedUser.email,
        actor: currentUser,
      });
    }

    revalidateComplianceSurfaces();

    return {
      success: true,
      createdCount: recordsToCreate.length,
      skippedCount: drafts.length - recordsToCreate.length,
      packName: definition.name,
      message:
        recordsToCreate.length > 0
          ? `${definition.name} applied for ${payload.year}.`
          : `All ${definition.name} tasks for ${payload.year} were already on the board.`,
    };
  } catch (error) {
    console.error("[compliance] Failed to generate pack:", error);
    return {
      success: false,
      message: "Pack rollout failed. Please try again.",
    };
  }
}

export async function markAsCompleted(id: number): Promise<void> {
  const currentUser = await getAuthenticatedUser();
  if (!id || !currentUser || !canApproveRole(currentUser.role)) return;

  try {
    const item = await getManagedComplianceItem(Number(id), currentUser);

    if (!item || !item.documentUrl || isClosedStatus(item.status)) {
      return;
    }

    const checklistComplete = item.workflow.checklist.every((step) => step.done);

    if (!checklistComplete) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: Number(id) },
        data: {
          status: "Approved",
        },
      });

      const approval = await tx.workItemApproval.findFirst({
        where: { workItemId: Number(id) },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (approval) {
        await tx.workItemApproval.update({
          where: { id: approval.id },
          data: {
            status: "Approved",
            decidedAt: new Date(),
            decidedById: currentUser.id,
            rejectionReason: null,
            managerResponseKind: null,
            managerResponseLabel: null,
            managerResponseNote: null,
            managerRespondedAt: null,
            managerRespondedById: null,
          },
        });
      }

      await logWorkItemAuditEvent(tx, {
        workItemId: Number(id),
        eventType: "APPROVED",
        detail: "Work item approved via legacy completion action.",
        actorUserId: currentUser.id,
      });
    });

    await settleDecisionForWorkItem({
      workItemId: Number(id),
      kinds: [WorkDecisionKind.APPROVAL_DECISION],
      status: WorkDecisionStatus.APPROVED,
      actorUserId: currentUser.id,
      resolutionNote: "Manager approved this work item via the legacy completion action.",
    });
    await settleDecisionForWorkItem({
      workItemId: Number(id),
      kinds: [
        WorkDecisionKind.DOCUMENT_DECISION,
        WorkDecisionKind.PAYMENT_APPROVAL,
        WorkDecisionKind.ESCALATION_REVIEW,
      ],
      status: WorkDecisionStatus.RESOLVED,
      actorUserId: currentUser.id,
      resolutionNote: "Related decision was resolved when the work item was approved.",
    });

    revalidateComplianceSurfaces();
  } catch (error) {
    console.error("[compliance] Failed to approve legacy action:", error);
  }
}

export async function deleteComplianceItem(id: number): Promise<void> {
  const currentUser = await getAuthenticatedUser();
  if (!id || !currentUser) return;

  try {
    const item = await getManagedComplianceItem(Number(id), currentUser);

    if (!item) {
      return;
    }

    if (!canApproveRole(currentUser.role) && item.userId !== currentUser.id) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: Number(id) },
        data: {
          archivedAt: new Date(),
        },
      });

      await logWorkItemAuditEvent(tx, {
        workItemId: Number(id),
        eventType: "ARCHIVED",
        detail: "Work item archived.",
        actorUserId: currentUser.id,
      });
    });

    await settleDecisionForWorkItem({
      workItemId: Number(id),
      status: WorkDecisionStatus.CANCELLED,
      actorUserId: currentUser.id,
      resolutionNote: "Work item was archived, so the outstanding decision was cancelled.",
    });

    revalidateComplianceSurfaces();
  } catch (error) {
    console.error("[compliance] Failed to delete item:", error);
  }
}

export async function reportComplianceBlocker(
  payload: ReportComplianceBlockerPayload,
): Promise<ComplianceActionResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser) {
    return { success: false, message: "You need to sign in before reporting a blocker." };
  }

  const trimmedReason = payload.reason.trim();
  if (!trimmedReason) {
    return { success: false, message: "Add a short explanation so the blocker is actionable." };
  }

  if (!blockerReasonCatalog.some((item) => item.code === payload.code)) {
    return { success: false, message: "Choose a valid blocker reason." };
  }

  try {
    const item = await getManagedComplianceItem(payload.id, currentUser);

    if (!item) {
      return { success: false, message: "That task could not be found." };
    }

    const isOwner = item.userId === currentUser.id;
    if (!isOwner && !canApproveRole(currentUser.role)) {
      return { success: false, message: "Only the assignee or a manager can update blockers." };
    }

    if (isClosedStatus(item.status) || item.status === "Submitted") {
      return {
        success: false,
        message: "Only active in-progress tasks can be marked as blocked.",
      };
    }

    const blockerLabel =
      blockerReasonCatalog.find((entry) => entry.code === payload.code)?.label || "Blocker";

    await prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: payload.id },
        data: {
          status: "Pending",
        },
      });

      await tx.workItemBlocker.updateMany({
        where: {
          workItemId: payload.id,
          isActive: true,
        },
        data: {
          isActive: false,
          clearedAt: new Date(),
          clearedById: currentUser.id,
          resolutionNote: "Superseded by a newer blocker update.",
          managerResponseKind: null,
          managerResponseLabel: null,
          managerResponseNote: null,
          managerRespondedAt: null,
          managerRespondedById: null,
        },
      });

      await tx.workItemBlocker.create({
        data: {
          workItemId: payload.id,
          code: payload.code,
          label: blockerLabel,
          reason: trimmedReason,
          waitingOn: payload.waitingOn?.trim() || null,
          needsManagerHelp: payload.needsManagerHelp,
          isActive: true,
          blockedAt: new Date(),
          blockedById: currentUser.id,
        },
      });

      const approval = await tx.workItemApproval.findFirst({
        where: { workItemId: payload.id },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (approval) {
        await tx.workItemApproval.update({
          where: { id: approval.id },
          data: {
            managerResponseKind: null,
            managerResponseLabel: null,
            managerResponseNote: null,
            managerRespondedAt: null,
            managerRespondedById: null,
          },
        });
      }

      await logWorkItemAuditEvent(tx, {
        workItemId: payload.id,
        eventType: "BLOCKER_REPORTED",
        detail: `Blocker reported: ${blockerLabel}.`,
        actorUserId: currentUser.id,
        payload: {
          code: payload.code,
          waitingOn: payload.waitingOn?.trim() || null,
          needsManagerHelp: payload.needsManagerHelp,
        },
      });
    });

    let blockerMessage = "Blocker saved.";
    const decisionSyncReport = await queueAndProcessOpsEvent({
      topic: OpsEventTopic.DECISION_SYNC_REQUESTED,
      ...getWorkItemEventContext(item),
    });

    if (decisionSyncReport?.status === "FAILED") {
      blockerMessage = `${blockerMessage} Decision queue update is retrying in the background.`;
    }

    if (payload.needsManagerHelp) {
      const alertReport = await queueAndProcessOpsEvent({
        topic: OpsEventTopic.BLOCKER_ESCALATION_REQUESTED,
        ...getWorkItemEventContext(item),
      });

      if (alertReport?.status === "COMPLETED") {
        blockerMessage = `${blockerMessage} ${alertReport.summary}`;
      } else if (alertReport?.status === "FAILED") {
        blockerMessage = `${blockerMessage} WhatsApp alert not sent: ${alertReport.summary}`;
      }
    }

    revalidateComplianceSurfaces();
    return { success: true, message: blockerMessage };
  } catch (error) {
    console.error("[compliance] Failed to report blocker:", error);
    return { success: false, message: "Could not save the blocker right now." };
  }
}

export async function clearComplianceBlocker(
  id: number,
  resolutionNote?: string,
): Promise<ComplianceActionResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser) {
    return { success: false, message: "You need to sign in before clearing a blocker." };
  }

  try {
    const item = await getManagedComplianceItem(id, currentUser);

    if (!item) {
      return { success: false, message: "That task could not be found." };
    }

    const isOwner = item.userId === currentUser.id;
    if (!isOwner && !canApproveRole(currentUser.role)) {
      return { success: false, message: "Only the assignee or a manager can clear blockers." };
    }

    if (!item.workflow.blocker) {
      return { success: false, message: "This task is not currently blocked." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.workItemBlocker.updateMany({
        where: {
          workItemId: id,
          isActive: true,
        },
        data: {
          isActive: false,
          clearedAt: new Date(),
          clearedById: currentUser.id,
          resolutionNote: resolutionNote?.trim() || null,
          managerResponseKind: null,
          managerResponseLabel: null,
          managerResponseNote: null,
          managerRespondedAt: null,
          managerRespondedById: null,
        },
      });

      await logWorkItemAuditEvent(tx, {
        workItemId: id,
        eventType: "BLOCKER_CLEARED",
        detail: "Blocker cleared.",
        actorUserId: currentUser.id,
        payload: {
          resolutionNote: resolutionNote?.trim() || null,
        },
      });
    });

    const decisionSyncReport = await queueAndProcessOpsEvent({
      topic: OpsEventTopic.DECISION_SYNC_REQUESTED,
      ...getWorkItemEventContext(item),
    });

    revalidateComplianceSurfaces();
    return {
      success: true,
      message:
        decisionSyncReport?.status === "FAILED"
          ? "Blocker cleared. Decision queue sync will retry in the background."
          : "Blocker cleared.",
    };
  } catch (error) {
    console.error("[compliance] Failed to clear blocker:", error);
    return { success: false, message: "Could not clear the blocker right now." };
  }
}

export async function submitComplianceItemForApproval(
  payload: SubmitCompliancePayload,
): Promise<ComplianceActionResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser) {
    return { success: false, message: "You need to sign in before submitting a task." };
  }

  try {
    const item = await getManagedComplianceItem(payload.id, currentUser);

    if (!item) {
      return { success: false, message: "That task could not be found." };
    }

    const isOwner = item.userId === currentUser.id;
    if (!isOwner && !canApproveRole(currentUser.role)) {
      return { success: false, message: "Only the assignee or a manager can submit this task." };
    }

    const checklist = payload.checklist.map((step) => ({
      id: step.id,
      label: step.label,
      done: Boolean(step.done),
    }));

    if (hasActiveBlocker(item.workflow)) {
      return {
        success: false,
        message: "Clear the active blocker before submitting this task.",
      };
    }

    if (!payload.documentUrl) {
      return {
        success: false,
        message: `Attach the ${item.workflow.requiredDocumentLabel.toLowerCase()} before submitting.`,
      };
    }

    if (!checklist.every((step) => step.done)) {
      return { success: false, message: "Complete the checklist before submitting for approval." };
    }

    await prisma.$transaction(async (tx) => {
      await replaceWorkItemChecklist(tx, {
        workItemId: payload.id,
        checklist,
        actorUserId: currentUser.id,
      });

      await replaceCurrentWorkItemEvidence(tx, {
        workItemId: payload.id,
        fileUrl: payload.documentUrl,
        fileName: payload.fileName,
        label: item.workflow.requiredDocumentLabel,
        documentId: payload.documentId,
        documentVersionId: payload.documentVersionId,
        uploadedById: currentUser.id,
      });

      await tx.workItem.update({
        where: { id: payload.id },
        data: {
          status: "Submitted",
        },
      });

      await tx.workItemBlocker.updateMany({
        where: {
          workItemId: payload.id,
          isActive: true,
        },
        data: {
          isActive: false,
          clearedAt: new Date(),
          clearedById: currentUser.id,
          resolutionNote: "Automatically cleared during submission.",
          managerResponseKind: null,
          managerResponseLabel: null,
          managerResponseNote: null,
          managerRespondedAt: null,
          managerRespondedById: null,
        },
      });

      await tx.workItemApproval.create({
        data: {
          workItemId: payload.id,
          status: "Submitted",
          submissionNote: payload.submissionNote?.trim() || null,
          submittedAt: new Date(),
          submittedById: currentUser.id,
        },
      });

      await logWorkItemAuditEvent(tx, {
        workItemId: payload.id,
        eventType: "SUBMITTED",
        detail: "Work item submitted for approval.",
        actorUserId: currentUser.id,
        payload: {
          submissionNote: payload.submissionNote?.trim() || null,
        },
      });
    });

    const submissionReport = await queueAndProcessOpsEvent({
      topic: OpsEventTopic.WORK_ITEM_SUBMITTED,
      dedupeKey: `submitted:${payload.id}:${payload.documentVersionId ?? 0}`,
      ...getWorkItemEventContext(item),
      documentId: payload.documentId ?? null,
      documentVersionId: payload.documentVersionId ?? null,
    });

    revalidateComplianceSurfaces();
    return {
      success: true,
      message:
        submissionReport?.status === "FAILED"
          ? "Task submitted. Manager queue and proof checks will retry in the background."
          : "Task submitted. Proof was checked and the manager queue was updated.",
    };
  } catch (error) {
    console.error("[compliance] Failed to submit item:", error);
    return { success: false, message: "Submission failed. Please try again." };
  }
}

export async function approveComplianceItem(id: number): Promise<ComplianceActionResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return { success: false, message: "Only managers can approve submitted tasks." };
  }

  try {
    const item = await getManagedComplianceItem(id, currentUser);

    if (!item) {
      return { success: false, message: "That task could not be found." };
    }

    if (item.status !== "Submitted") {
      return { success: false, message: "Only submitted tasks can be approved." };
    }

    if (!item.documentUrl) {
      return {
        success: false,
        message: `The ${item.workflow.requiredDocumentLabel.toLowerCase()} is still missing.`,
      };
    }

    if (!item.workflow.checklist.every((step) => step.done)) {
      return { success: false, message: "Checklist completion is required before approval." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id },
        data: {
          status: "Approved",
        },
      });

      const approval = await tx.workItemApproval.findFirst({
        where: { workItemId: id },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (approval) {
        await tx.workItemApproval.update({
          where: { id: approval.id },
          data: {
            status: "Approved",
            decidedAt: new Date(),
            decidedById: currentUser.id,
            rejectionReason: null,
            managerResponseKind: null,
            managerResponseLabel: null,
            managerResponseNote: null,
            managerRespondedAt: null,
            managerRespondedById: null,
          },
        });
      }

      await logWorkItemAuditEvent(tx, {
        workItemId: id,
        eventType: "APPROVED",
        detail: "Work item approved.",
        actorUserId: currentUser.id,
      });
    });

    await settleDecisionForWorkItem({
      workItemId: id,
      kinds: [WorkDecisionKind.APPROVAL_DECISION],
      status: WorkDecisionStatus.APPROVED,
      actorUserId: currentUser.id,
      resolutionNote: "Manager approved this work item.",
    });
    await settleDecisionForWorkItem({
      workItemId: id,
      kinds: [
        WorkDecisionKind.DOCUMENT_DECISION,
        WorkDecisionKind.PAYMENT_APPROVAL,
        WorkDecisionKind.ESCALATION_REVIEW,
      ],
      status: WorkDecisionStatus.RESOLVED,
      actorUserId: currentUser.id,
      resolutionNote: "Workflow moved forward after manager approval.",
    });
    await queueAndProcessOpsEvent({
      topic: OpsEventTopic.DECISION_SYNC_REQUESTED,
      ...getWorkItemEventContext(item),
    });

    revalidateComplianceSurfaces();
    return { success: true, message: "Work approved and the decision queue was updated." };
  } catch (error) {
    console.error("[compliance] Failed to approve item:", error);
    return { success: false, message: "Approval failed. Please try again." };
  }
}

export async function rejectComplianceItem(
  id: number,
  reason: string,
): Promise<ComplianceActionResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return { success: false, message: "Only managers can reject submitted tasks." };
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { success: false, message: "Add a short reason so the assignee knows what to fix." };
  }

  try {
    const item = await getManagedComplianceItem(id, currentUser);

    if (!item) {
      return { success: false, message: "That task could not be found." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id },
        data: {
          status: "Rejected",
        },
      });

      const approval = await tx.workItemApproval.findFirst({
        where: { workItemId: id },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (approval) {
        await tx.workItemApproval.update({
          where: { id: approval.id },
          data: {
            status: "Rejected",
            decidedAt: new Date(),
            decidedById: currentUser.id,
            rejectionReason: trimmedReason,
            managerResponseKind: null,
            managerResponseLabel: null,
            managerResponseNote: null,
            managerRespondedAt: null,
            managerRespondedById: null,
          },
        });
      }

      await logWorkItemAuditEvent(tx, {
        workItemId: id,
        eventType: "REJECTED",
        detail: "Work item rejected and returned to the assignee.",
        actorUserId: currentUser.id,
        payload: {
          rejectionReason: trimmedReason,
        },
      });
    });

    await settleDecisionForWorkItem({
      workItemId: id,
      kinds: [WorkDecisionKind.APPROVAL_DECISION],
      status: WorkDecisionStatus.REJECTED,
      actorUserId: currentUser.id,
      resolutionNote: "Manager rejected this work item and returned it to the assignee.",
    });
    await settleDecisionForWorkItem({
      workItemId: id,
      kinds: [
        WorkDecisionKind.DOCUMENT_DECISION,
        WorkDecisionKind.PAYMENT_APPROVAL,
        WorkDecisionKind.ESCALATION_REVIEW,
      ],
      status: WorkDecisionStatus.RESOLVED,
      actorUserId: currentUser.id,
      resolutionNote: "Related decision was closed because the submission was rejected.",
    });
    await queueAndProcessOpsEvent({
      topic: OpsEventTopic.DECISION_SYNC_REQUESTED,
      ...getWorkItemEventContext(item),
    });

    revalidateComplianceSurfaces();
    return {
      success: true,
      message: "Work rejected and the decision queue was updated for the assignee.",
    };
  } catch (error) {
    console.error("[compliance] Failed to reject item:", error);
    return { success: false, message: "Rejection failed. Please try again." };
  }
}

export async function acknowledgeManagerResponse(
  payload: AcknowledgeManagerResponsePayload,
): Promise<ComplianceActionResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return { success: false, message: "Only managers can acknowledge work from this inbox." };
  }

  if (!managerResponseCatalog.some((item) => item.kind === payload.kind)) {
    return { success: false, message: "Choose a valid manager response." };
  }

  try {
    const item = await getManagedComplianceItem(payload.id, currentUser);

    if (!item) {
      return { success: false, message: "That task could not be found." };
    }

    const responseLabel =
      managerResponseCatalog.find((item) => item.kind === payload.kind)?.label || "Manager response";

    let relatedTo: "BLOCKER" | "SUBMISSION";
    let note: string;

    if (item.status === "Submitted") {
      relatedTo = "SUBMISSION";
      note =
        payload.kind === "TAKING_OWNERSHIP"
          ? "Manager has taken over the next step on this submission."
          : "Manager has seen this submission and will review it shortly.";
    } else if (item.workflow.blocker) {
      relatedTo = "BLOCKER";
      note =
        payload.kind === "TAKING_OWNERSHIP"
          ? "Manager has taken ownership of this blocker and will handle it directly."
          : "Manager has seen this blocker and is reviewing it.";
    } else {
      return {
        success: false,
        message: "Only submitted work or active blockers can be acknowledged.",
      };
    }

    await prisma.$transaction(async (tx) => {
      if (relatedTo === "SUBMISSION") {
        const approval = await tx.workItemApproval.findFirst({
          where: { workItemId: payload.id },
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });

        if (!approval) {
          throw new Error("Missing approval record");
        }

        await tx.workItemApproval.update({
          where: { id: approval.id },
          data: {
            managerResponseKind: payload.kind,
            managerResponseLabel: responseLabel,
            managerResponseNote: note,
            managerRespondedAt: new Date(),
            managerRespondedById: currentUser.id,
          },
        });
      } else {
        const blocker = await tx.workItemBlocker.findFirst({
          where: {
            workItemId: payload.id,
            isActive: true,
          },
          orderBy: [{ blockedAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });

        if (!blocker) {
          throw new Error("Missing blocker record");
        }

        await tx.workItemBlocker.update({
          where: { id: blocker.id },
          data: {
            managerResponseKind: payload.kind,
            managerResponseLabel: responseLabel,
            managerResponseNote: note,
            managerRespondedAt: new Date(),
            managerRespondedById: currentUser.id,
          },
        });
      }

      await logWorkItemAuditEvent(tx, {
        workItemId: payload.id,
        eventType: "MANAGER_ACKNOWLEDGED",
        detail: `Manager response recorded: ${responseLabel}.`,
        actorUserId: currentUser.id,
        payload: {
          relatedTo,
          kind: payload.kind,
        },
      });
    });

    let responseMessage =
      payload.kind === "TAKING_OWNERSHIP"
        ? "Assignee can now see that you are handling this directly."
        : "Assignee can now see that you have seen this.";

    const nudgeReport = await sendAssigneeManagerResponseNudge(payload.id);

    if (nudgeReport.notifiedAssignee) {
      responseMessage = `${responseMessage} ${nudgeReport.message}`;
    } else if (!nudgeReport.success && nudgeReport.message) {
      responseMessage = `${responseMessage} WhatsApp nudge not sent: ${nudgeReport.message}`;
    } else if (
      nudgeReport.message &&
      nudgeReport.message !== "Assignee WhatsApp nudge was skipped."
    ) {
      responseMessage = `${responseMessage} ${nudgeReport.message}`;
    }

    revalidateComplianceSurfaces();

    return {
      success: true,
      message: responseMessage,
    };
  } catch (error) {
    console.error("[compliance] Failed to save manager acknowledgement:", error);
    return { success: false, message: "Could not save the manager response right now." };
  }
}

/**
 * ==========================================
 * 2. TRAINING & CERTIFICATE MODULE
 * ==========================================
 */

export async function createTrainingItem(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/dashboard?error=Unauthorized");

  const title = formData.get("title") as string;
  const startDateStr = formData.get("startDate") as string;
  const costKESStr = formData.get("costKES") as string;
  const location = formData.get("location") as string;
  const description = formData.get("description") as string;

  if (!title || !startDateStr || !costKESStr) redirect("/dashboard?error=Missing+fields");

  const startDate = new Date(startDateStr);
  const costKES = Math.round(parseFloat(costKESStr));

  if (costKES > 5000) {
    redirect("/dashboard?error=Budget+Exceeded");
  }

  let dbError = false;
  try {
    const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "HR")) {
      dbError = true;
    } else {
      await prisma.training.create({
        data: {
          title,
          description: description || null,
          startDate,
          endDate: new Date(startDate.getTime() + 2 * 60 * 60 * 1000),
          location: location || null,
          costKES,
          budgetKES: 5000,
          status: "SCHEDULED" as TrainingStatus,
          createdById: dbUser.id,
        },
      });
      revalidatePath("/");
      revalidatePath("/dashboard");
    }
  } catch (error) {
    console.error("[training] Failed to create training:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard?error=Database+error");
  } else {
    redirect("/dashboard?success=Training+created");
  }
}

export async function toggleAttendance(trainingId: number, userId: number): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return;

  try {
    const existing = await prisma.attendance.findUnique({
      where: { userId_trainingId: { userId, trainingId } },
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { attended: !existing.attended },
      });
    } else {
      await prisma.attendance.create({
        data: { trainingId, userId, attended: true },
      });
    }

    revalidatePath(`/dashboard/training/${trainingId}`);
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("[training] Failed to update attendance:", error);
  }
}

export async function generateCertificateRecord(attendanceId: number): Promise<string | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existingCert = await tx.certificate.findUnique({ where: { attendanceId } });
      if (existingCert) return existingCert.certificateNo;

      const attendance = await tx.attendance.findUnique({
        where: { id: attendanceId },
        include: { training: true },
      });

      if (!attendance || !attendance.attended) return null;

      const count = await tx.certificate.count();
      const year = new Date().getFullYear();
      const serial = (count + 1).toString().padStart(3, "0");
      const newCertNo = `BHL-${year}-${serial}`;

      const newCert = await tx.certificate.create({
        data: { certificateNo: newCertNo, attendanceId },
      });

      revalidatePath(`/dashboard/training/${attendance.trainingId}`);
      revalidatePath("/dashboard");
      return newCert.certificateNo;
    });
  } catch (error) {
    console.error("[certificate] Failed to generate certificate:", error);
    return null;
  }
}

/**
 * ==========================================
 * 3. STAFF & USER MANAGEMENT
 * ==========================================
 */

export async function createEmployee(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return;

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const roleInput = formData.get("role") as string;

  const allowedRoles = ["ADMIN", "HR", "ACCOUNTANT", "OPERATIONS_MANAGER"];
  const role = (allowedRoles.includes(roleInput) ? roleInput : "USER") as Role;

  if (!name || !email) return;

  try {
    const admin = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!admin || (admin.role !== "ADMIN" && admin.role !== "HR")) return;

    const hashedPassword = await bcrypt.hash("BHL-Temp-2026", 10);
    await prisma.user.create({
      data: {
        name,
        email,
        role,
        password: hashedPassword,
        isActive: true,
      },
    });

    revalidatePath("/staff");
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("[staff] Failed to create employee:", error);
  }
}

export async function deleteEmployee(id: number): Promise<void> {
  try {
    await prisma.user.delete({ where: { id: Number(id) } });
    revalidatePath("/staff");
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("[staff] Failed to delete employee:", error);
  }
}

export async function updateEmployeeWhatsAppSettings(
  userId: number,
  phoneNumber: string,
  whatsappOptIn: boolean,
): Promise<UpdateWhatsAppSettingsResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return { success: false, message: "Only managers can update WhatsApp settings." };
  }

  const normalizedPhone = phoneNumber.trim().length > 0
    ? normalizeKenyanPhoneNumber(phoneNumber)
    : null;

  if (phoneNumber.trim().length > 0 && !normalizedPhone) {
    return {
      success: false,
      message: "Use a valid Kenyan number like 0712345678 or +254712345678.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneNumber: normalizedPhone,
        whatsappOptIn: whatsappOptIn && Boolean(normalizedPhone),
        whatsappConsentAt: whatsappOptIn && normalizedPhone ? new Date() : null,
      },
    });

    revalidatePath("/staff");
    revalidatePath("/tasks");

    return {
      success: true,
      phoneNumber: normalizedPhone,
      optedIn: whatsappOptIn && Boolean(normalizedPhone),
    };
  } catch (error) {
    console.error("[staff] Failed to update WhatsApp settings:", error);
    return { success: false, message: "Could not update WhatsApp settings." };
  }
}

export async function retryWhatsAppDeliveryLog(
  logId: number,
): Promise<RetryNotificationResult> {
  const currentUser = await getAuthenticatedUser();

  if (!currentUser || !canApproveRole(currentUser.role)) {
    return { success: false, message: "Only managers can retry WhatsApp deliveries." };
  }

  const result = await retryWhatsAppNotificationLog(logId);

  revalidatePath("/dashboard/reports");

  return {
    success: result.success,
    message: result.message,
    status: result.success ? "SENT" : "FAILED",
  };
}

/**
 * ==========================================
 * 4. BUDGET & ICT FINANCIALS
 * ==========================================
 */

export async function getMonthlyBudgetStats() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, data: null };

  const firstDay = startOfMonth(new Date());

  try {
    const opEx = await prisma.operationalExpense.aggregate({
      where: { date: { gte: firstDay } },
      _sum: { amount: true },
    });

    const logs = await prisma.maintenanceLog.findMany({
      where: { serviceDate: { gte: firstDay } },
      include: { asset: true },
    });

    const hardwareSum = logs
      .filter((log) => log.asset.type === "HARDWARE")
      .reduce((sum, log) => sum + log.cost, 0);
    const softwareSum = logs
      .filter((log) => log.asset.type === "SOFTWARE")
      .reduce((sum, log) => sum + log.cost, 0);

    const trainingEx = await prisma.training.aggregate({
      where: { startDate: { gte: firstDay } },
      _sum: { costKES: true },
    });

    return {
      success: true,
      data: {
        operational: opEx._sum.amount || 0,
        maintenance: hardwareSum,
        softwareSubscriptions: softwareSum,
        training: trainingEx._sum.costKES || 0,
        totalSpent:
          (opEx._sum.amount || 0) +
          hardwareSum +
          softwareSum +
          (trainingEx._sum.costKES || 0),
        month: new Date().toLocaleString("default", { month: "long" }),
      },
    };
  } catch (error) {
    console.error("[budget] Failed to fetch monthly stats:", error);
    return { success: false, data: null };
  }
}

/**
 * ==========================================
 * 5. ICT & ASSET MANAGEMENT
 * ==========================================
 */

export async function createSoftwareSubscription(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/dashboard/ict/software?error=Unauthorized");

  const name = formData.get("name") as string;
  const provider = formData.get("provider") as string;
  const billingCycle = formData.get("billingCycle") as string;
  const cost = parseFloat(formData.get("cost") as string);
  const nextBillingDateStr = formData.get("nextBillingDate") as string;

  if (!name || Number.isNaN(cost) || !nextBillingDateStr) {
    redirect("/dashboard/ict/software?error=Missing+fields");
  }

  let dbError = false;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      dbError = true;
    } else {
      await prisma.softwareSubscription.create({
        data: {
          name,
          provider: provider || null,
          billingCycle: billingCycle || "MONTHLY",
          cost,
          nextBillingDate: new Date(nextBillingDateStr),
          userId: user.id,
        },
      });
      revalidatePath("/dashboard/ict/software");
      revalidatePath("/dashboard/ict");
    }
  } catch (error) {
    console.error("[ict] Failed to create software subscription:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/ict/software?error=Database+error");
  } else {
    redirect("/dashboard/ict/software?success=1");
  }
}

export async function deleteSoftwareSubscription(id: number): Promise<void> {
  if (!id) return;

  try {
    await prisma.softwareSubscription.delete({ where: { id: Number(id) } });
    revalidatePath("/dashboard/ict/software");
    revalidatePath("/dashboard/ict");
  } catch (error) {
    console.error("[ict] Failed to delete software subscription:", error);
  }
}

export async function createHardwareAsset(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/dashboard/ict/hardware?error=Unauthorized");

  const name = formData.get("name") as string;
  const serialNumber = formData.get("serialNumber") as string;
  const purchaseDateStr = formData.get("purchaseDate") as string;

  if (!name) redirect("/dashboard/ict/hardware?error=Name+required");

  let dbError = false;
  try {
    await prisma.asset.create({
      data: {
        name,
        type: "HARDWARE",
        serialNumber: serialNumber || null,
        purchaseDate: purchaseDateStr ? new Date(purchaseDateStr) : null,
      },
    });

    revalidatePath("/dashboard/ict/hardware");
    revalidatePath("/dashboard/ict");
  } catch (error) {
    console.error("[ict] Failed to create hardware asset:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/ict/hardware?error=Database+error");
  } else {
    redirect("/dashboard/ict/hardware?success=1");
  }
}

export async function addMaintenanceLog(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/dashboard/ict/hardware?error=Unauthorized");

  const assetId = parseInt(formData.get("assetId") as string, 10);
  const description = formData.get("description") as string;
  const cost = parseFloat(formData.get("cost") as string);
  const serviceDateStr = formData.get("serviceDate") as string;
  const nextServiceDateStr = formData.get("nextServiceDate") as string;

  if (Number.isNaN(assetId) || !description || Number.isNaN(cost)) {
    redirect("/dashboard/ict/hardware?error=Missing+fields");
  }

  let dbError = false;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      dbError = true;
    } else {
      await prisma.maintenanceLog.create({
        data: {
          assetId,
          description,
          cost,
          serviceDate: serviceDateStr ? new Date(serviceDateStr) : new Date(),
          nextServiceDate: nextServiceDateStr ? new Date(nextServiceDateStr) : null,
          performedById: user.id,
        },
      });

      revalidatePath("/dashboard/ict/hardware");
      revalidatePath("/dashboard/ict");
    }
  } catch (error) {
    console.error("[ict] Failed to add maintenance log:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/ict/hardware?error=Database+error");
  } else {
    redirect("/dashboard/ict/hardware?success=1");
  }
}

/**
 * ==========================================
 * 6. OFFICE ADMINISTRATION
 * ==========================================
 */

export async function createOfficeAsset(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/dashboard/office/facilities?error=Unauthorized");

  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const serialNumber = formData.get("serialNumber") as string;
  const purchaseDateStr = formData.get("purchaseDate") as string;

  if (!name || !type) redirect("/dashboard/office/facilities?error=Missing+fields");

  let dbError = false;
  try {
    await prisma.asset.create({
      data: {
        name,
        type,
        serialNumber: serialNumber || null,
        purchaseDate: purchaseDateStr ? new Date(purchaseDateStr) : null,
      },
    });

    revalidatePath("/dashboard/office/facilities");
    revalidatePath("/dashboard/office");
  } catch (error) {
    console.error("[office] Failed to create office asset:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/office/facilities?error=Database+error");
  } else {
    redirect("/dashboard/office/facilities?success=1");
  }
}

export async function logOfficeSupplyExpense(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/dashboard/office/supplies?error=Unauthorized");

  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const dateStr = formData.get("date") as string;

  if (!description || !category || Number.isNaN(amount)) {
    redirect("/dashboard/office/supplies?error=Missing+fields");
  }

  let dbError = false;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      dbError = true;
    } else {
      await prisma.operationalExpense.create({
        data: {
          description,
          category,
          amount,
          date: dateStr ? new Date(dateStr) : new Date(),
          createdById: user.id,
        },
      });

      revalidatePath("/dashboard/office/supplies");
      revalidatePath("/dashboard/office");
      revalidatePath("/dashboard/expenses");
    }
  } catch (error) {
    console.error("[office] Failed to log supply expense:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/office/supplies?error=Database+error");
  } else {
    redirect("/dashboard/office/supplies?success=1");
  }
}

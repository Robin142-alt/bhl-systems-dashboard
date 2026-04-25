import path from "path";
import { Prisma } from "@prisma/client";
import type { PrismaClient, Role } from "@prisma/client";
import {
  blockerReasonCatalog,
  createChecklistTemplate,
  inferRequiredDocumentLabel,
  managerResponseCatalog,
  normalizeWorkflowStatus,
  parseComplianceWorkflow,
  serializeComplianceWorkflowValue,
  type ComplianceBlockerCode,
  type ComplianceChecklistItem,
  type ComplianceManagerResponseKind,
  type ComplianceWorkflowActor,
  type ComplianceWorkflowData,
} from "@/lib/compliance-workflow";
import { ensureLegacyEvidenceDocumentsBackfilled } from "@/lib/document-registry";
import { buildComplianceItemScope, buildTaskScope, buildWorkItemScope } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

interface WorkflowBearingRecord {
  title: string;
  category: string;
  status?: string;
  notes?: string | null;
  workflowState?: unknown;
}

const userActorSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phoneNumber: true,
  whatsappOptIn: true,
} satisfies Prisma.UserSelect;

export const workItemDetailInclude = Prisma.validator<Prisma.WorkItemInclude>()({
  user: {
    select: userActorSelect,
  },
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  clientEntity: {
    select: {
      id: true,
      name: true,
    },
  },
  checklistItems: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
  blockers: {
    orderBy: [{ blockedAt: "desc" }, { id: "desc" }],
    include: {
      blockedBy: {
        select: userActorSelect,
      },
      clearedBy: {
        select: userActorSelect,
      },
      managerRespondedBy: {
        select: userActorSelect,
      },
    },
  },
  approvals: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    include: {
      submittedBy: {
        select: userActorSelect,
      },
      decidedBy: {
        select: userActorSelect,
      },
      managerRespondedBy: {
        select: userActorSelect,
      },
    },
  },
  evidence: {
    orderBy: [{ isCurrent: "desc" }, { uploadedAt: "desc" }, { id: "desc" }],
    include: {
      uploadedBy: {
        select: userActorSelect,
      },
      document: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          status: true,
        },
      },
      documentVersion: {
        include: {
          extraction: true,
        },
      },
    },
  },
} satisfies Prisma.WorkItemInclude);

export type WorkItemRecord = Prisma.WorkItemGetPayload<{
  include: typeof workItemDetailInclude;
}>;

type LegacyComplianceRecord = Prisma.ComplianceItemGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
        organizationId: true;
      };
    };
    organization: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
    clientEntity: {
      select: {
        id: true;
        name: true;
      };
    };
    workItem: {
      select: {
        id: true;
      };
    };
  };
}>;

type LegacyTaskRecord = Prisma.TaskGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
        organizationId: true;
      };
    };
    organization: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
    clientEntity: {
      select: {
        id: true;
        name: true;
      };
    };
    workItem: {
      select: {
        id: true;
      };
    };
  };
}>;

export interface WorkItemMutationActor {
  id: number;
  email: string;
  name: string | null;
  role: Role | string;
}

export interface CreateWorkItemInput {
  title: string;
  category: string;
  responsible: string;
  deadline: Date;
  frequency: string;
  remindDaysBefore: number;
  organizationId: number;
  clientEntityId?: number | null;
  userId: number;
  createdBy?: WorkItemMutationActor | null;
}

export interface PackWorkItemDraft {
  title: string;
  category: string;
  deadline: Date;
  frequency: string;
  remindDaysBefore?: number | null;
}

export function parseStoredComplianceWorkflow(record: WorkflowBearingRecord) {
  return parseComplianceWorkflow(
    record.workflowState ?? record.notes,
    record.title,
    record.category,
  );
}

export function buildComplianceWorkflowStorage(
  workflow: ComplianceWorkflowData,
): {
  notes: string | null;
  workflowState: Prisma.InputJsonValue;
  workflowVersion: number;
  workflowUpdatedAt: Date;
} {
  return {
    notes: workflow.legacyNotes?.trim() || null,
    workflowState:
      serializeComplianceWorkflowValue(workflow) as unknown as Prisma.InputJsonValue,
    workflowVersion: 2,
    workflowUpdatedAt: new Date(),
  };
}

export function hydrateComplianceItem<T extends WorkflowBearingRecord>(item: T) {
  return {
    ...item,
    status: normalizeWorkflowStatus(item.status || "Pending"),
    workflow: parseStoredComplianceWorkflow(item),
  };
}

function toWorkflowActor(
  user:
    | {
        id: number;
        name: string | null;
        email: string;
        role: string;
      }
    | null
    | undefined,
): ComplianceWorkflowActor | undefined {
  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function toDateString(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function getCurrentEvidence(item: WorkItemRecord) {
  return item.evidence.find((entry) => entry.isCurrent) || item.evidence[0] || null;
}

function getActiveBlocker(item: WorkItemRecord) {
  return item.blockers.find((entry) => entry.isActive) || null;
}

function getLastResolvedBlocker(item: WorkItemRecord) {
  return (
    item.blockers.find((entry) => !entry.isActive && entry.clearedAt) || null
  );
}

function getLatestApproval(item: WorkItemRecord) {
  return item.approvals[0] || null;
}

function isManagerResponseKind(
  value: string | null | undefined,
): value is ComplianceManagerResponseKind {
  return managerResponseCatalog.some((item) => item.kind === value);
}

function isBlockerCode(value: string | null | undefined): value is ComplianceBlockerCode {
  return blockerReasonCatalog.some((item) => item.code === value);
}

export function buildWorkflowFromWorkItem(item: WorkItemRecord): ComplianceWorkflowData {
  const latestApproval = getLatestApproval(item);
  const activeBlocker = getActiveBlocker(item);
  const lastResolvedBlocker = getLastResolvedBlocker(item);
  const managerResponseFromBlocker =
    activeBlocker &&
    activeBlocker.managerRespondedAt &&
    isManagerResponseKind(activeBlocker.managerResponseKind)
      ? {
          kind: activeBlocker.managerResponseKind,
          label:
            activeBlocker.managerResponseLabel ||
            managerResponseCatalog.find((entry) => entry.kind === activeBlocker.managerResponseKind)
              ?.label ||
            "Manager response",
          note:
            activeBlocker.managerResponseNote ||
            "Manager acknowledged the blocker.",
          relatedTo: "BLOCKER" as const,
          respondedAt: activeBlocker.managerRespondedAt.toISOString(),
          respondedBy: toWorkflowActor(activeBlocker.managerRespondedBy),
        }
      : undefined;
  const managerResponseFromApproval =
    latestApproval &&
    latestApproval.managerRespondedAt &&
    isManagerResponseKind(latestApproval.managerResponseKind)
      ? {
          kind: latestApproval.managerResponseKind,
          label:
            latestApproval.managerResponseLabel ||
            managerResponseCatalog.find((entry) => entry.kind === latestApproval.managerResponseKind)
              ?.label ||
            "Manager response",
          note:
            latestApproval.managerResponseNote ||
            "Manager acknowledged the submission.",
          relatedTo: "SUBMISSION" as const,
          respondedAt: latestApproval.managerRespondedAt.toISOString(),
          respondedBy: toWorkflowActor(latestApproval.managerRespondedBy),
        }
      : undefined;

  return {
    checklist:
      item.checklistItems.length > 0
        ? item.checklistItems.map((entry, index) => ({
            id: `work-item-${item.id}-checklist-${index + 1}`,
            label: entry.label,
            done: entry.isDone,
          }))
        : createChecklistTemplate(item.title, item.category),
    requiredDocumentLabel:
      item.requiredDocumentLabel || inferRequiredDocumentLabel(item.title, item.category),
    blocker:
      activeBlocker && isBlockerCode(activeBlocker.code)
        ? {
            code: activeBlocker.code,
            label: activeBlocker.label,
            reason: activeBlocker.reason,
            waitingOn: activeBlocker.waitingOn || undefined,
            needsManagerHelp: activeBlocker.needsManagerHelp,
            blockedAt: activeBlocker.blockedAt.toISOString(),
            blockedBy: toWorkflowActor(activeBlocker.blockedBy),
          }
        : undefined,
    lastResolvedBlocker:
      lastResolvedBlocker && isBlockerCode(lastResolvedBlocker.code)
        ? {
            code: lastResolvedBlocker.code,
            label: lastResolvedBlocker.label,
            reason: lastResolvedBlocker.reason,
            waitingOn: lastResolvedBlocker.waitingOn || undefined,
            needsManagerHelp: lastResolvedBlocker.needsManagerHelp,
            blockedAt: lastResolvedBlocker.blockedAt.toISOString(),
            blockedBy: toWorkflowActor(lastResolvedBlocker.blockedBy),
            clearedAt: lastResolvedBlocker.clearedAt!.toISOString(),
            clearedBy: toWorkflowActor(lastResolvedBlocker.clearedBy),
            resolutionNote: lastResolvedBlocker.resolutionNote || undefined,
          }
        : undefined,
    managerResponse: managerResponseFromBlocker || managerResponseFromApproval,
    submissionNote: latestApproval?.submissionNote || undefined,
    submittedAt: toDateString(latestApproval?.submittedAt),
    submittedBy: toWorkflowActor(latestApproval?.submittedBy),
    approvedAt:
      latestApproval?.status === "Approved" ? toDateString(latestApproval.decidedAt) : undefined,
    approvedBy:
      latestApproval?.status === "Approved"
        ? toWorkflowActor(latestApproval.decidedBy)
        : undefined,
    rejectedAt:
      latestApproval?.status === "Rejected" ? toDateString(latestApproval.decidedAt) : undefined,
    rejectedBy:
      latestApproval?.status === "Rejected"
        ? toWorkflowActor(latestApproval.decidedBy)
        : undefined,
    rejectionReason:
      latestApproval?.status === "Rejected"
        ? latestApproval.rejectionReason || undefined
        : undefined,
  };
}

export function hydrateWorkItem(item: WorkItemRecord) {
  const workflow = buildWorkflowFromWorkItem(item);
  const currentEvidence = getCurrentEvidence(item);

  return {
    ...item,
    status: normalizeWorkflowStatus(item.status || "Pending"),
    documentUrl: currentEvidence?.fileUrl || null,
    currentEvidence: currentEvidence
      ? {
          id: currentEvidence.id,
          kind: currentEvidence.kind,
          label: currentEvidence.label,
          fileUrl: currentEvidence.fileUrl,
          fileName: currentEvidence.fileName,
          uploadedAt: currentEvidence.uploadedAt.toISOString(),
          documentId: currentEvidence.documentId ?? null,
          documentVersionId: currentEvidence.documentVersionId ?? null,
          versionNumber: currentEvidence.documentVersion?.versionNumber ?? null,
          extraction: currentEvidence.documentVersion?.extraction
            ? {
                id: currentEvidence.documentVersion.extraction.id,
                readStatus: currentEvidence.documentVersion.extraction.readStatus,
                textPreview: currentEvidence.documentVersion.extraction.textPreview,
                extractedFields:
                  (currentEvidence.documentVersion.extraction.extractedFields as Record<string, unknown> | null) ??
                  null,
                extractedAt: currentEvidence.documentVersion.extraction.extractedAt.toISOString(),
              }
            : null,
        }
      : null,
    workflow,
  };
}

export async function logWorkItemAuditEvent(
  db: DbClient,
  input: {
    workItemId: number;
    eventType: string;
    detail: string;
    actorUserId?: number | null;
    payload?: Prisma.InputJsonValue;
  },
) {
  await db.workItemAuditEvent.create({
    data: {
      workItemId: input.workItemId,
      eventType: input.eventType,
      detail: input.detail,
      actorUserId: input.actorUserId ?? null,
      payload: input.payload,
    },
  });
}

export async function replaceWorkItemChecklist(
  db: DbClient,
  input: {
    workItemId: number;
    checklist: ComplianceChecklistItem[];
    actorUserId?: number | null;
  },
) {
  await db.workItemChecklistItem.deleteMany({
    where: { workItemId: input.workItemId },
  });

  if (input.checklist.length === 0) {
    return;
  }

  await db.workItemChecklistItem.createMany({
    data: input.checklist.map((entry, index) => ({
      workItemId: input.workItemId,
      label: entry.label,
      sortOrder: index,
      isDone: Boolean(entry.done),
      completedAt: entry.done ? new Date() : null,
      completedById: entry.done ? input.actorUserId ?? null : null,
    })),
  });
}

export async function replaceCurrentWorkItemEvidence(
  db: DbClient,
  input: {
    workItemId: number;
    fileUrl: string;
    fileName?: string | null;
    label?: string | null;
    documentId?: number | null;
    documentVersionId?: number | null;
    uploadedById?: number | null;
  },
) {
  await db.workItemEvidence.updateMany({
    where: {
      workItemId: input.workItemId,
      isCurrent: true,
    },
    data: {
      isCurrent: false,
    },
  });

  await db.workItemEvidence.create({
    data: {
      workItemId: input.workItemId,
      kind: "PROOF",
      label: input.label || null,
      fileUrl: input.fileUrl,
      fileName: input.fileName?.trim() || path.basename(input.fileUrl.split("?")[0] || input.fileUrl),
      documentId: input.documentId ?? null,
      documentVersionId: input.documentVersionId ?? null,
      uploadedById: input.uploadedById ?? null,
      isCurrent: true,
    },
  });
}

export async function addWorkItemEvidence(
  db: DbClient,
  input: {
    workItemId: number;
    fileUrl: string;
    fileName?: string | null;
    label?: string | null;
    kind?: string | null;
    documentId?: number | null;
    documentVersionId?: number | null;
    uploadedById?: number | null;
    isCurrent?: boolean;
  },
) {
  const shouldBeCurrent = Boolean(input.isCurrent);

  if (shouldBeCurrent) {
    await db.workItemEvidence.updateMany({
      where: {
        workItemId: input.workItemId,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
      },
    });
  }

  await db.workItemEvidence.create({
    data: {
      workItemId: input.workItemId,
      kind: input.kind?.trim() || "SUPPORTING",
      label: input.label || null,
      fileUrl: input.fileUrl,
      fileName: input.fileName?.trim() || path.basename(input.fileUrl.split("?")[0] || input.fileUrl),
      documentId: input.documentId ?? null,
      documentVersionId: input.documentVersionId ?? null,
      uploadedById: input.uploadedById ?? null,
      isCurrent: shouldBeCurrent,
    },
  });
}

export async function listHydratedWorkItems(input: {
  organizationId: number;
  organizationSlug?: string;
  userId?: number;
  canManage?: boolean;
}) {
  await ensureLegacyComplianceItemsBackfilled({
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
  });
  await ensureLegacyTasksBackfilled({
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
  });
  await ensureLegacyEvidenceDocumentsBackfilled({
    organizationId: input.organizationId,
  });

  const records = await prisma.workItem.findMany({
    where: buildWorkItemScope(input.organizationId, input.organizationSlug, {
      archivedAt: null,
      ...(input.canManage ? {} : input.userId ? { userId: input.userId } : {}),
    }),
    orderBy: [{ deadline: "asc" }, { id: "desc" }],
    include: workItemDetailInclude,
  });

  return records.map(hydrateWorkItem);
}

export async function listAllHydratedWorkItems() {
  await ensureLegacyComplianceItemsBackfilled();
  await ensureLegacyTasksBackfilled();
  await ensureLegacyEvidenceDocumentsBackfilled();

  const records = await prisma.workItem.findMany({
    where: {
      archivedAt: null,
    },
    orderBy: [{ deadline: "asc" }, { id: "desc" }],
    include: workItemDetailInclude,
  });

  return records.map(hydrateWorkItem);
}

export async function getManagedWorkItem(input: {
  id: number;
  organizationId: number;
  organizationSlug?: string;
}) {
  await ensureLegacyComplianceItemsBackfilled({
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
  });
  await ensureLegacyTasksBackfilled({
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
  });
  await ensureLegacyEvidenceDocumentsBackfilled({
    organizationId: input.organizationId,
  });

  const record = await prisma.workItem.findFirst({
    where: buildWorkItemScope(input.organizationId, input.organizationSlug, {
      id: input.id,
      archivedAt: null,
    }),
    include: workItemDetailInclude,
  });

  return record;
}

function buildLegacyApprovalCreateData(input: {
  workItemStatus: string;
  workflow: ComplianceWorkflowData;
  fallbackUserId: number;
}) {
  const normalizedStatus = normalizeWorkflowStatus(input.workItemStatus || "Pending");
  const hasSubmissionContext =
    Boolean(input.workflow.submittedAt) ||
    Boolean(input.workflow.submissionNote) ||
    normalizedStatus === "Submitted" ||
    normalizedStatus === "Approved" ||
    normalizedStatus === "Rejected";

  if (!hasSubmissionContext) {
    return null;
  }

  const submittedAt = input.workflow.submittedAt
    ? new Date(input.workflow.submittedAt)
    : input.workflow.approvedAt
      ? new Date(input.workflow.approvedAt)
      : input.workflow.rejectedAt
        ? new Date(input.workflow.rejectedAt)
        : new Date();

  const status =
    normalizedStatus === "Approved"
      ? "Approved"
      : normalizedStatus === "Rejected"
        ? "Rejected"
        : "Submitted";

  const managerResponse =
    input.workflow.managerResponse?.relatedTo === "SUBMISSION"
      ? input.workflow.managerResponse
      : undefined;

  return {
    status,
    submissionNote: input.workflow.submissionNote || undefined,
    submittedAt,
    submittedById: input.workflow.submittedBy?.id ?? input.fallbackUserId,
    decidedAt:
      status === "Approved"
        ? input.workflow.approvedAt
          ? new Date(input.workflow.approvedAt)
          : submittedAt
        : status === "Rejected"
          ? input.workflow.rejectedAt
            ? new Date(input.workflow.rejectedAt)
            : submittedAt
          : undefined,
    decidedById:
      status === "Approved"
        ? input.workflow.approvedBy?.id ?? undefined
        : status === "Rejected"
          ? input.workflow.rejectedBy?.id ?? undefined
          : undefined,
    rejectionReason:
      status === "Rejected" ? input.workflow.rejectionReason || undefined : undefined,
    managerResponseKind: managerResponse?.kind,
    managerResponseLabel: managerResponse?.label,
    managerResponseNote: managerResponse?.note,
    managerRespondedAt: managerResponse?.respondedAt
      ? new Date(managerResponse.respondedAt)
      : undefined,
    managerRespondedById: managerResponse?.respondedBy?.id ?? undefined,
  };
}

function buildLegacyBlockerCreateData(input: {
  blocker: ComplianceWorkflowData["blocker"];
  managerResponse?: ComplianceWorkflowData["managerResponse"];
}) {
  if (!input.blocker) {
    return null;
  }

  const managerResponse =
    input.managerResponse?.relatedTo === "BLOCKER" ? input.managerResponse : undefined;

  return {
    code: input.blocker.code,
    label: input.blocker.label,
    reason: input.blocker.reason,
    waitingOn: input.blocker.waitingOn || undefined,
    needsManagerHelp: input.blocker.needsManagerHelp,
    isActive: true,
    blockedAt: new Date(input.blocker.blockedAt),
    blockedById: input.blocker.blockedBy?.id ?? undefined,
    managerResponseKind: managerResponse?.kind,
    managerResponseLabel: managerResponse?.label,
    managerResponseNote: managerResponse?.note,
    managerRespondedAt: managerResponse?.respondedAt
      ? new Date(managerResponse.respondedAt)
      : undefined,
    managerRespondedById: managerResponse?.respondedBy?.id ?? undefined,
  };
}

function buildLegacyResolvedBlockerCreateData(
  blocker: ComplianceWorkflowData["lastResolvedBlocker"],
) {
  if (!blocker) {
    return null;
  }

  return {
    code: blocker.code,
    label: blocker.label,
    reason: blocker.reason,
    waitingOn: blocker.waitingOn || undefined,
    needsManagerHelp: blocker.needsManagerHelp,
    isActive: false,
    blockedAt: new Date(blocker.blockedAt),
    blockedById: blocker.blockedBy?.id ?? undefined,
    clearedAt: new Date(blocker.clearedAt),
    clearedById: blocker.clearedBy?.id ?? undefined,
    resolutionNote: blocker.resolutionNote || undefined,
  };
}

export async function ensureLegacyComplianceItemsBackfilled(input?: {
  organizationId?: number;
  organizationSlug?: string;
}) {
  const legacyItems = await prisma.complianceItem.findMany({
    where: input?.organizationId
      ? buildComplianceItemScope(input.organizationId, input.organizationSlug, {
          archivedAt: null,
          workItem: null,
        })
      : {
          archivedAt: null,
          workItem: null,
        },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationId: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      clientEntity: {
        select: {
          id: true,
          name: true,
        },
      },
      workItem: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [{ id: "asc" }],
  });

  if (legacyItems.length === 0) {
    return 0;
  }

  for (const legacyItem of legacyItems) {
    await migrateLegacyComplianceItem(legacyItem);
  }

  return legacyItems.length;
}

export async function ensureLegacyTasksBackfilled(input?: {
  organizationId?: number;
  organizationSlug?: string;
}) {
  const legacyTasks = await prisma.task.findMany({
    where: input?.organizationId
      ? buildTaskScope(input.organizationId, input.organizationSlug, {
          archivedAt: null,
          workItem: null,
        })
      : {
          archivedAt: null,
          workItem: null,
        },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationId: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      clientEntity: {
        select: {
          id: true,
          name: true,
        },
      },
      workItem: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [{ id: "asc" }],
  });

  if (legacyTasks.length === 0) {
    return 0;
  }

  for (const legacyTask of legacyTasks) {
    await migrateLegacyTask(legacyTask);
  }

  return legacyTasks.length;
}

async function migrateLegacyComplianceItem(legacyItem: LegacyComplianceRecord) {
  const workflow = parseStoredComplianceWorkflow(legacyItem);
  const normalizedStatus = normalizeWorkflowStatus(legacyItem.status);
  const resolvedBlocker = buildLegacyResolvedBlockerCreateData(
    workflow.lastResolvedBlocker,
  );
  const activeBlocker = buildLegacyBlockerCreateData({
    blocker: workflow.blocker,
    managerResponse: workflow.managerResponse,
  });
  const approval = buildLegacyApprovalCreateData({
    workItemStatus: normalizedStatus,
    workflow,
    fallbackUserId: legacyItem.userId,
  });
  const evidenceTimestamp =
    workflow.approvedAt ||
    workflow.rejectedAt ||
    workflow.submittedAt ||
    legacyItem.updatedAt.toISOString();
  const organizationId =
    legacyItem.organizationId ?? legacyItem.user.organizationId ?? null;

  await prisma.workItem.create({
    data: {
      title: legacyItem.title,
      deadline: legacyItem.deadline,
      frequency: legacyItem.frequency,
      responsible: legacyItem.responsible,
      remindDaysBefore: legacyItem.remindDaysBefore,
      status: normalizedStatus,
      category: legacyItem.category,
      requiredDocumentLabel:
        workflow.requiredDocumentLabel ||
        inferRequiredDocumentLabel(legacyItem.title, legacyItem.category),
      archivedAt: legacyItem.archivedAt,
      riskScore: legacyItem.riskScore,
      aiPriorityIndex: legacyItem.aiPriorityIndex,
      aiTags: legacyItem.aiTags,
      createdAt: legacyItem.createdAt,
      updatedAt: legacyItem.updatedAt,
      organizationId,
      clientEntityId: legacyItem.clientEntityId,
      userId: legacyItem.userId,
      legacyComplianceItemId: legacyItem.id,
      checklistItems: {
        create: workflow.checklist.map((entry, index) => ({
          label: entry.label,
          sortOrder: index,
          isDone: entry.done,
          completedAt: entry.done ? legacyItem.updatedAt : null,
          completedById: entry.done ? workflow.submittedBy?.id ?? legacyItem.userId : null,
        })),
      },
      evidence: legacyItem.documentUrl
        ? {
            create: [
              {
                kind: "PROOF",
                label: workflow.requiredDocumentLabel,
                fileUrl: legacyItem.documentUrl,
                fileName: path.basename(legacyItem.documentUrl),
                isCurrent: true,
                uploadedAt: new Date(evidenceTimestamp),
                uploadedById: workflow.submittedBy?.id ?? legacyItem.userId,
              },
            ],
          }
        : undefined,
      blockers:
        activeBlocker || resolvedBlocker
          ? {
              create: [resolvedBlocker, activeBlocker].filter(
                (entry): entry is NonNullable<typeof entry> => entry !== null,
              ),
            }
          : undefined,
      approvals: approval
        ? {
            create: [approval],
          }
        : undefined,
      auditEvents: {
        create: [
          {
            eventType: "MIGRATED_FROM_LEGACY_COMPLIANCE_ITEM",
            detail: "Migrated from the legacy ComplianceItem record.",
            actorUserId: legacyItem.userId,
            payload: {
              legacyComplianceItemId: legacyItem.id,
            },
          },
        ],
      },
    },
  });
}

async function migrateLegacyTask(legacyTask: LegacyTaskRecord) {
  const workflow = parseStoredComplianceWorkflow({
    title: legacyTask.title,
    category: legacyTask.category,
    status: legacyTask.status,
  });
  const normalizedStatus = normalizeWorkflowStatus(legacyTask.status);
  const organizationId =
    legacyTask.organizationId ?? legacyTask.user.organizationId ?? null;

  await prisma.workItem.create({
    data: {
      title: legacyTask.title,
      deadline: legacyTask.deadline,
      frequency: legacyTask.frequency,
      responsible: legacyTask.responsible,
      status: normalizedStatus,
      category: legacyTask.category,
      requiredDocumentLabel:
        workflow.requiredDocumentLabel ||
        inferRequiredDocumentLabel(legacyTask.title, legacyTask.category),
      archivedAt: legacyTask.archivedAt,
      riskScore: legacyTask.riskScore,
      aiPriorityIndex: legacyTask.aiPriorityIndex,
      aiTags: legacyTask.aiTags,
      organizationId,
      clientEntityId: legacyTask.clientEntityId,
      userId: legacyTask.userId,
      legacyTaskId: legacyTask.id,
      checklistItems: {
        create: workflow.checklist.map((entry, index) => ({
          label: entry.label,
          sortOrder: index,
          isDone: entry.done,
        })),
      },
      evidence: legacyTask.documentUrl
        ? {
            create: [
              {
                kind: "PROOF",
                label: workflow.requiredDocumentLabel,
                fileUrl: legacyTask.documentUrl,
                fileName: path.basename(legacyTask.documentUrl),
                isCurrent: true,
                uploadedById: legacyTask.userId,
              },
            ],
          }
        : undefined,
      auditEvents: {
        create: [
          {
            eventType: "MIGRATED_FROM_LEGACY_TASK",
            detail: "Migrated from the legacy Task record.",
            actorUserId: legacyTask.userId,
            payload: {
              legacyTaskId: legacyTask.id,
            },
          },
        ],
      },
    },
  });
}

export async function createWorkItem(
  input: CreateWorkItemInput,
) {
  const workflow = parseStoredComplianceWorkflow({
    title: input.title,
    category: input.category,
    status: "Pending",
  });

  const item = await prisma.workItem.create({
    data: {
      title: input.title,
      deadline: input.deadline,
      frequency: input.frequency,
      responsible: input.responsible,
      remindDaysBefore: input.remindDaysBefore,
      status: "Pending",
      category: input.category,
      requiredDocumentLabel: workflow.requiredDocumentLabel,
      organizationId: input.organizationId,
      clientEntityId: input.clientEntityId ?? null,
      userId: input.userId,
      checklistItems: {
        create: workflow.checklist.map((entry, index) => ({
          label: entry.label,
          sortOrder: index,
          isDone: entry.done,
        })),
      },
      auditEvents: input.createdBy
        ? {
            create: [
              {
                eventType: "CREATED",
                detail: "Work item created.",
                actorUserId: input.createdBy.id,
                payload: {
                  title: input.title,
                  category: input.category,
                },
              },
            ],
          }
        : undefined,
    },
    include: workItemDetailInclude,
  });

  return item;
}

export async function createWorkItemsFromPack(input: {
  drafts: PackWorkItemDraft[];
  organizationId: number;
  clientEntityId?: number | null;
  userId: number;
  responsible: string;
  actor?: WorkItemMutationActor | null;
}) {
  const createdItems: WorkItemRecord[] = [];

  for (const draft of input.drafts) {
    const item = await createWorkItem({
      title: draft.title,
      category: draft.category,
      responsible: input.responsible,
      deadline: draft.deadline,
      frequency: draft.frequency,
      remindDaysBefore: Number(draft.remindDaysBefore) || 0,
      organizationId: input.organizationId,
      clientEntityId: input.clientEntityId ?? null,
      userId: input.userId,
      createdBy: input.actor,
    });

    createdItems.push(item);
  }

  return createdItems;
}

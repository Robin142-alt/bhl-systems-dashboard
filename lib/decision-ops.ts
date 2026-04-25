import { Prisma, WorkDecisionKind, WorkDecisionStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { canApproveRole } from "@/lib/compliance-workflow";
import { prisma } from "@/lib/prisma";
import { buildWorkItemScope } from "@/lib/organizations";
import { hydrateWorkItem, workItemDetailInclude } from "@/lib/work-items";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const workDecisionDetailInclude = Prisma.validator<Prisma.WorkDecisionInclude>()({
  workItem: {
    include: workItemDetailInclude,
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
  sourceBlocker: true,
  sourceApproval: true,
  requestedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  auditEvents: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    include: {
      actorUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.WorkDecisionInclude);

export type WorkDecisionRecord = Prisma.WorkDecisionGetPayload<{
  include: typeof workDecisionDetailInclude;
}>;

interface DesiredDecision {
  kind: WorkDecisionKind;
  title: string;
  summary: string;
  dueAt?: Date | null;
  priority?: string;
  requestedById?: number | null;
  assignedToId?: number | null;
  documentId?: number | null;
  documentVersionId?: number | null;
  sourceBlockerId?: number | null;
  sourceApprovalId?: number | null;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

function getDecisionMatchKey(input: {
  kind: WorkDecisionKind;
  sourceBlockerId?: number | null;
  sourceApprovalId?: number | null;
  documentVersionId?: number | null;
}) {
  return [
    input.kind,
    input.sourceBlockerId ?? "none",
    input.sourceApprovalId ?? "none",
    input.documentVersionId ?? "none",
  ].join("::");
}

async function getDefaultDecisionAssignee(db: DbClient, organizationId?: number | null) {
  if (!organizationId) {
    return null;
  }

  const users = await db.user.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: {
      id: true,
      role: true,
    },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  const manager = users.find((user) => canApproveRole(user.role));
  return manager?.id ?? null;
}

async function logDecisionAuditEvent(
  db: DbClient,
  input: {
    decisionId: number;
    eventType: string;
    detail: string;
    actorUserId?: number | null;
    payload?: Prisma.InputJsonValue;
  },
) {
  await db.workDecisionAuditEvent.create({
    data: {
      decisionId: input.decisionId,
      eventType: input.eventType,
      detail: input.detail,
      actorUserId: input.actorUserId ?? null,
      payload: input.payload,
    },
  });
}

async function buildDesiredDecisions(
  db: DbClient,
  workItemId: number,
): Promise<DesiredDecision[]> {
  const record = await db.workItem.findUnique({
    where: { id: workItemId },
    include: workItemDetailInclude,
  });

  if (!record || record.archivedAt) {
    return [];
  }

  const item = hydrateWorkItem(record);
  const managerId = await getDefaultDecisionAssignee(db, item.organizationId);
  const decisions: DesiredDecision[] = [];
  const currentEvidence = item.currentEvidence;
  const latestApproval = record.approvals[0] ?? null;
  const activeBlocker = record.blockers.find((entry) => entry.isActive) ?? null;

  if (item.status === "Submitted" && latestApproval) {
    const submittedAt = latestApproval.submittedAt || item.updatedAt;
    decisions.push({
      kind: WorkDecisionKind.APPROVAL_DECISION,
      title: `Approve submission: ${item.title}`,
      summary:
        "Review the uploaded proof, checklist completion, and submission note to approve or reject this work item.",
      dueAt: addHours(submittedAt, 24),
      priority: "HIGH",
      requestedById: latestApproval.submittedById ?? item.userId,
      assignedToId: managerId,
      documentId: currentEvidence?.documentId ?? null,
      documentVersionId: currentEvidence?.documentVersionId ?? null,
      sourceApprovalId: latestApproval.id,
    });
  }

  if (activeBlocker) {
    const blockedAt = activeBlocker.blockedAt || item.updatedAt;
    const requestedById = activeBlocker.blockedById ?? item.userId;
    const baseDecision = {
      requestedById,
      assignedToId: managerId,
      sourceBlockerId: activeBlocker.id,
      documentId: currentEvidence?.documentId ?? null,
      documentVersionId: currentEvidence?.documentVersionId ?? null,
    };

    if (activeBlocker.code === "WAITING_PAYMENT") {
      decisions.push({
        ...baseDecision,
        kind: WorkDecisionKind.PAYMENT_APPROVAL,
        title: `Release payment: ${item.title}`,
        summary:
          "A payment-related blocker is active. Review the blocker reason and approve or resolve the required payment release.",
        dueAt: addHours(blockedAt, 6),
        priority: "CRITICAL",
      });
    } else if (activeBlocker.code === "MISSING_DOCUMENT") {
      decisions.push({
        ...baseDecision,
        kind: WorkDecisionKind.DOCUMENT_DECISION,
        title: `Document decision: ${item.title}`,
        summary:
          "The assignee needs a manager-level document decision. Clarify the expected proof or accept the uploaded evidence path.",
        dueAt: addHours(blockedAt, 8),
        priority: "HIGH",
      });
    } else if (activeBlocker.code === "WAITING_APPROVAL") {
      decisions.push({
        ...baseDecision,
        kind: WorkDecisionKind.APPROVAL_DECISION,
        title: `Grant sign-off: ${item.title}`,
        summary:
          "A manager sign-off blocker is active. Review the blocker details and provide the required approval so work can continue.",
        dueAt: addHours(blockedAt, 8),
        priority: "HIGH",
      });
    } else if (activeBlocker.needsManagerHelp) {
      decisions.push({
        ...baseDecision,
        kind: WorkDecisionKind.ESCALATION_REVIEW,
        title: `Resolve escalation: ${item.title}`,
        summary:
          "The assignee has requested manager intervention. Review the blocker details and decide the next action to unblock progress.",
        dueAt: addHours(blockedAt, 12),
        priority: "NORMAL",
      });
    }
  }

  return decisions;
}

export async function syncDecisionOpsForWorkItem(input: {
  workItemId: number;
  actorUserId?: number | null;
  db?: DbClient;
}) {
  const db = input.db ?? prisma;
  const desired = await buildDesiredDecisions(db, input.workItemId);
  const workItemMeta = await db.workItem.findUnique({
    where: { id: input.workItemId },
    select: {
      organizationId: true,
      clientEntityId: true,
    },
  });
  const existingOpen = await db.workDecision.findMany({
    where: {
      workItemId: input.workItemId,
      status: WorkDecisionStatus.OPEN,
    },
  });

  const desiredByKey = new Map(
    desired.map((decision) => [
      getDecisionMatchKey(decision),
      decision,
    ]),
  );
  const existingByKey = new Map(
    existingOpen.map((decision) => [
      getDecisionMatchKey(decision),
      decision,
    ]),
  );

  let openedCount = 0;
  let updatedCount = 0;
  let resolvedCount = 0;

  for (const existing of existingOpen) {
    const key = getDecisionMatchKey(existing);
    if (desiredByKey.has(key)) {
      const next = desiredByKey.get(key)!;
      await db.workDecision.update({
        where: { id: existing.id },
        data: {
          title: next.title,
          summary: next.summary,
          dueAt: next.dueAt ?? null,
          priority: next.priority || "NORMAL",
          assignedToId: next.assignedToId ?? null,
          requestedById: next.requestedById ?? null,
          documentId: next.documentId ?? null,
          documentVersionId: next.documentVersionId ?? null,
        },
      });
      updatedCount += 1;
    } else {
      await db.workDecision.update({
        where: { id: existing.id },
        data: {
          status: WorkDecisionStatus.RESOLVED,
          resolvedAt: new Date(),
          resolvedById: input.actorUserId ?? null,
          resolutionNote: "Decision no longer required after workflow state changed.",
        },
      });
      await logDecisionAuditEvent(db, {
        decisionId: existing.id,
        eventType: "RESOLVED_BY_SYNC",
        detail: "Decision automatically resolved because the workflow no longer needs it.",
        actorUserId: input.actorUserId ?? null,
      });
      resolvedCount += 1;
    }
  }

  for (const [key, next] of desiredByKey.entries()) {
    if (existingByKey.has(key)) {
      continue;
    }

    const created = await db.workDecision.create({
      data: {
        kind: next.kind,
        status: WorkDecisionStatus.OPEN,
        priority: next.priority || "NORMAL",
        title: next.title,
        summary: next.summary,
        requestedAt: new Date(),
        dueAt: next.dueAt ?? null,
        workItemId: input.workItemId,
        documentId: next.documentId ?? null,
        documentVersionId: next.documentVersionId ?? null,
        sourceBlockerId: next.sourceBlockerId ?? null,
        sourceApprovalId: next.sourceApprovalId ?? null,
        requestedById: next.requestedById ?? null,
        assignedToId: next.assignedToId ?? null,
        organizationId: workItemMeta?.organizationId ?? null,
        clientEntityId: workItemMeta?.clientEntityId ?? null,
      },
    });

    await logDecisionAuditEvent(db, {
      decisionId: created.id,
      eventType: "OPENED",
      detail: "Decision opened from workflow state.",
      actorUserId: input.actorUserId ?? null,
      payload: {
        kind: created.kind,
        workItemId: input.workItemId,
      },
    });
    openedCount += 1;
  }

  return {
    openedCount,
    updatedCount,
    resolvedCount,
  };
}

export async function settleDecisionForWorkItem(input: {
  workItemId: number;
  status: WorkDecisionStatus;
  actorUserId?: number | null;
  resolutionNote: string;
  kinds?: WorkDecisionKind[];
  db?: DbClient;
}) {
  const db = input.db ?? prisma;
  const decisions = await db.workDecision.findMany({
    where: {
      workItemId: input.workItemId,
      status: WorkDecisionStatus.OPEN,
      ...(input.kinds?.length ? { kind: { in: input.kinds } } : {}),
    },
    select: {
      id: true,
    },
  });

  for (const decision of decisions) {
    await db.workDecision.update({
      where: { id: decision.id },
      data: {
        status: input.status,
        resolvedAt: new Date(),
        resolvedById: input.actorUserId ?? null,
        resolutionNote: input.resolutionNote,
      },
    });

    await logDecisionAuditEvent(db, {
      decisionId: decision.id,
      eventType: input.status,
      detail: input.resolutionNote,
      actorUserId: input.actorUserId ?? null,
    });
  }

  return decisions.length;
}

export async function listDecisionOps(input: {
  organizationId: number;
  organizationSlug?: string;
  includeResolved?: boolean;
}) {
  const records = await prisma.workDecision.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.includeResolved
        ? {}
        : { status: { in: [WorkDecisionStatus.OPEN] } }),
      workItem: {
        is: buildWorkItemScope(input.organizationId, input.organizationSlug, {
          archivedAt: null,
        }),
      },
    },
    orderBy: [{ dueAt: "asc" }, { requestedAt: "asc" }, { id: "desc" }],
    include: workDecisionDetailInclude,
  });

  return records.map((record) => ({
    ...record,
    workItem: record.workItem ? hydrateWorkItem(record.workItem) : null,
  }));
}

export async function getDecisionOpsSnapshot(input: {
  organizationId: number;
  organizationSlug?: string;
}) {
  const decisions = await listDecisionOps(input);

  return {
    openCount: decisions.length,
    highPriorityCount: decisions.filter((decision) => decision.priority === "CRITICAL" || decision.priority === "HIGH").length,
    dueSoonCount: decisions.filter((decision) => decision.dueAt && decision.dueAt <= addHours(new Date(), 12)).length,
    decisions: decisions.slice(0, 8),
  };
}

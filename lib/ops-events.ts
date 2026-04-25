import { OpsEventStatus, OpsEventTopic, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { verifyWorkItemDocumentById } from "@/lib/assistant-documents";
import { syncDecisionOpsForWorkItem } from "@/lib/decision-ops";
import { ensureDocumentVersionExtraction, registerRemoteDocumentUpload } from "@/lib/document-registry";
import { prisma } from "@/lib/prisma";
import {
  addWorkItemEvidence,
  logWorkItemAuditEvent,
  workItemDetailInclude,
  type WorkItemRecord,
} from "@/lib/work-items";
import { sendManagerBlockerAlert } from "@/lib/whatsapp-reminders";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const opsEventDetailInclude = Prisma.validator<Prisma.OpsEventInclude>()({
  workItem: {
    include: workItemDetailInclude,
  },
  document: {
    select: {
      id: true,
      title: true,
      sourceType: true,
    },
  },
  documentVersion: {
    include: {
      extraction: true,
    },
  },
  decision: true,
});

type OpsEventRecord = Prisma.OpsEventGetPayload<{
  include: typeof opsEventDetailInclude;
}>;

export interface OpsEventProcessReport {
  success: boolean;
  topic: OpsEventTopic;
  status: OpsEventStatus;
  summary: string;
}

export async function enqueueOpsEvent(
  db: DbClient,
  input: {
    topic: OpsEventTopic;
    dedupeKey?: string | null;
    payload?: Prisma.InputJsonValue;
    organizationId?: number | null;
    clientEntityId?: number | null;
    workItemId?: number | null;
    documentId?: number | null;
    documentVersionId?: number | null;
    decisionId?: number | null;
    scheduledAt?: Date;
  },
) {
  if (input.dedupeKey) {
    const existing = await db.opsEvent.findFirst({
      where: {
        dedupeKey: input.dedupeKey,
        status: {
          in: [OpsEventStatus.PENDING, OpsEventStatus.PROCESSING],
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return existing.id;
    }
  }

  const event = await db.opsEvent.create({
    data: {
      topic: input.topic,
      dedupeKey: input.dedupeKey ?? null,
      payload: input.payload,
      scheduledAt: input.scheduledAt ?? new Date(),
      organizationId: input.organizationId ?? null,
      clientEntityId: input.clientEntityId ?? null,
      workItemId: input.workItemId ?? null,
      documentId: input.documentId ?? null,
      documentVersionId: input.documentVersionId ?? null,
      decisionId: input.decisionId ?? null,
    },
    select: {
      id: true,
    },
  });

  return event.id;
}

async function markEventCompleted(
  db: DbClient,
  eventId: number,
  input: { status: OpsEventStatus; summary?: string },
) {
  await db.opsEvent.update({
    where: { id: eventId },
    data: {
      status: input.status,
      completedAt: new Date(),
      lastError: input.status === OpsEventStatus.FAILED ? input.summary || null : null,
    },
  });
}

async function processEventRecord(
  event: OpsEventRecord,
): Promise<OpsEventProcessReport> {
  if (event.topic === OpsEventTopic.DOCUMENT_EXTRACTION_REQUESTED) {
    if (!event.documentVersionId) {
      return {
        success: true,
        topic: event.topic,
        status: OpsEventStatus.SKIPPED,
        summary: "Skipped document extraction because no document version was attached.",
      };
    }

    const extraction = await ensureDocumentVersionExtraction(prisma, event.documentVersionId);

    return {
      success: true,
      topic: event.topic,
      status: OpsEventStatus.COMPLETED,
      summary: extraction
        ? `Document extraction is available for version ${event.documentVersionId}.`
        : `Document version ${event.documentVersionId} could not be extracted.`,
    };
  }

  if (event.topic === OpsEventTopic.DOCUMENT_VERIFICATION_REQUESTED) {
    if (!event.workItemId) {
      return {
        success: true,
        topic: event.topic,
        status: OpsEventStatus.SKIPPED,
        summary: "Skipped document verification because no work item was attached.",
      };
    }

    const verification = await verifyWorkItemDocumentById({
      workItemId: event.workItemId,
    });

    return {
      success: true,
      topic: event.topic,
      status: OpsEventStatus.COMPLETED,
      summary:
        verification?.candidate.verification
          ? `Document verification completed with status ${verification.candidate.verification.status}.`
          : "Document verification finished without a verification payload.",
    };
  }

  if (event.topic === OpsEventTopic.BLOCKER_ESCALATION_REQUESTED) {
    if (!event.workItemId) {
      return {
        success: true,
        topic: event.topic,
        status: OpsEventStatus.SKIPPED,
        summary: "Skipped blocker escalation because no work item was attached.",
      };
    }

    const report = await sendManagerBlockerAlert(event.workItemId);
    return {
      success: report.success,
      topic: event.topic,
      status: report.success ? OpsEventStatus.COMPLETED : OpsEventStatus.FAILED,
      summary: report.message,
    };
  }

  if (
    event.topic === OpsEventTopic.DECISION_SYNC_REQUESTED ||
    event.topic === OpsEventTopic.WORK_ITEM_SUBMITTED
  ) {
    if (!event.workItemId) {
      return {
        success: true,
        topic: event.topic,
        status: OpsEventStatus.SKIPPED,
        summary: "Skipped decision sync because no work item was attached.",
      };
    }

    const decisionReport = await syncDecisionOpsForWorkItem({
      workItemId: event.workItemId,
    });

    if (event.topic === OpsEventTopic.WORK_ITEM_SUBMITTED) {
      const item = await prisma.workItem.findUnique({
        where: { id: event.workItemId },
        include: workItemDetailInclude,
      });

      const currentEvidence =
        item?.evidence.find((entry) => entry.isCurrent) || item?.evidence[0] || null;

      if (currentEvidence?.documentVersionId) {
        const verificationEventId = await enqueueOpsEvent(prisma, {
          topic: OpsEventTopic.DOCUMENT_VERIFICATION_REQUESTED,
          dedupeKey: `verify:${event.workItemId}:${currentEvidence.documentVersionId}`,
          organizationId: item?.organizationId ?? null,
          clientEntityId: item?.clientEntityId ?? null,
          workItemId: event.workItemId,
          documentId: currentEvidence.documentId ?? null,
          documentVersionId: currentEvidence.documentVersionId,
        });
        await processOpsEventById(verificationEventId);
      }
    }

    return {
      success: true,
      topic: event.topic,
      status: OpsEventStatus.COMPLETED,
      summary: `Decision sync completed. Opened ${decisionReport.openedCount}, updated ${decisionReport.updatedCount}, resolved ${decisionReport.resolvedCount}.`,
    };
  }

  if (event.topic === OpsEventTopic.WHATSAPP_INTAKE_RECEIVED) {
    const payload =
      event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
    const sender =
      typeof payload.sender === "string" && payload.sender.trim().length > 0
        ? payload.sender.trim()
        : "Unknown sender";
    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : null;
    const attachmentCount =
      typeof payload.attachmentCount === "number" ? payload.attachmentCount : 0;
    const actorUserId =
      typeof payload.matchedUserId === "number" ? payload.matchedUserId : null;
    const mediaUrls = Array.isArray(payload.mediaUrls)
      ? payload.mediaUrls.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
    const ingestedDocuments: Array<{
      documentId: number;
      documentVersionId: number;
      fileName: string;
      fileUrl: string;
    }> = [];

    let linkedItemRecord: WorkItemRecord | null = null;
    let linkedItemHasCurrentEvidence = false;
    if (event.workItemId) {
      linkedItemRecord = await prisma.workItem.findUnique({
        where: { id: event.workItemId },
        include: workItemDetailInclude,
      });
      linkedItemHasCurrentEvidence =
        linkedItemRecord?.evidence.some((entry) => entry.isCurrent) || false;
    }

    for (const [index, mediaUrl] of mediaUrls.entries()) {
      try {
        const registered = await registerRemoteDocumentUpload(prisma, {
          sourceUrl: mediaUrl,
          folder: "whatsapp-intake",
          title:
            event.workItemId && linkedItemRecord
              ? `${linkedItemRecord.title} WhatsApp attachment ${index + 1}`
              : `WhatsApp intake attachment ${index + 1}`,
          sourceType: "WHATSAPP_INTAKE",
          organizationId: event.organizationId ?? null,
          clientEntityId: event.clientEntityId ?? null,
          ownerUserId: actorUserId,
          uploadedById: actorUserId,
        });

        ingestedDocuments.push({
          documentId: registered.documentId,
          documentVersionId: registered.documentVersionId,
          fileName: registered.fileName,
          fileUrl: registered.fileUrl,
        });

        if (event.workItemId && linkedItemRecord) {
          await addWorkItemEvidence(prisma, {
            workItemId: event.workItemId,
            fileUrl: registered.fileUrl,
            fileName: registered.fileName,
            label: "WhatsApp intake attachment",
            kind: linkedItemHasCurrentEvidence ? "SUPPORTING" : "PROOF",
            documentId: registered.documentId,
            documentVersionId: registered.documentVersionId,
            uploadedById: actorUserId,
            isCurrent: !linkedItemHasCurrentEvidence,
          });
          if (!linkedItemHasCurrentEvidence) {
            linkedItemHasCurrentEvidence = true;
          }
        }
      } catch (attachmentError) {
        console.error("[ops-events] Failed to ingest WhatsApp attachment:", attachmentError);
      }
    }

    await prisma.opsEvent.update({
      where: { id: event.id },
      data: {
        payload: {
          ...payload,
          ingestedDocuments,
        } satisfies Prisma.InputJsonValue,
      },
    });

    if (event.workItemId) {
      await prisma.$transaction(async (tx) => {
        await logWorkItemAuditEvent(tx, {
          workItemId: event.workItemId!,
          eventType: "WHATSAPP_INTAKE",
          detail: `WhatsApp intake received from ${sender}.`,
          actorUserId,
          payload: {
            message,
            attachmentCount,
            sender,
            ingestedDocuments,
          },
        });
      });
    }

    return {
      success: true,
      topic: event.topic,
      status: OpsEventStatus.COMPLETED,
      summary: event.workItemId
        ? `WhatsApp intake was linked to work item ${event.workItemId}${ingestedDocuments.length > 0 ? ` and ${ingestedDocuments.length} attachment(s) were ingested.` : "."}`
        : ingestedDocuments.length > 0
          ? `${ingestedDocuments.length} WhatsApp attachment(s) were ingested for triage.`
          : "WhatsApp intake was stored for triage.",
    };
  }

  return {
    success: true,
    topic: event.topic,
    status: OpsEventStatus.SKIPPED,
    summary: "No processor is registered for this event topic yet.",
  };
}

export async function processOpsEventById(eventId: number) {
  const event = await prisma.opsEvent.findUnique({
    where: { id: eventId },
    include: opsEventDetailInclude,
  });

  if (!event) {
    return null;
  }

  await prisma.opsEvent.update({
    where: { id: eventId },
    data: {
      status: OpsEventStatus.PROCESSING,
      attempts: {
        increment: 1,
      },
      startedAt: new Date(),
      lastError: null,
    },
  });

  try {
    const report = await processEventRecord(event);
    await markEventCompleted(prisma, eventId, {
      status: report.status,
      summary: report.summary,
    });
    return report;
  } catch (error) {
    const summary =
      error instanceof Error ? error.message : "Unknown event processing failure.";
    await markEventCompleted(prisma, eventId, {
      status: OpsEventStatus.FAILED,
      summary,
    });
    return {
      success: false,
      topic: event.topic,
      status: OpsEventStatus.FAILED,
      summary,
    } satisfies OpsEventProcessReport;
  }
}

export async function processPendingOpsEvents(input?: { limit?: number }) {
  const events = await prisma.opsEvent.findMany({
    where: {
      status: OpsEventStatus.PENDING,
      scheduledAt: {
        lte: new Date(),
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: input?.limit ?? 25,
    select: {
      id: true,
    },
  });

  const reports: OpsEventProcessReport[] = [];

  for (const event of events) {
    const report = await processOpsEventById(event.id);
    if (report) {
      reports.push(report);
    }
  }

  return {
    checkedCount: events.length,
    completedCount: reports.filter((report) => report.status === OpsEventStatus.COMPLETED).length,
    failedCount: reports.filter((report) => report.status === OpsEventStatus.FAILED).length,
    skippedCount: reports.filter((report) => report.status === OpsEventStatus.SKIPPED).length,
    reports,
  };
}

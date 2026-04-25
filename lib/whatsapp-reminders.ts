import { NotificationChannel, NotificationStage, NotificationStatus, Role } from "@prisma/client";
import { sendAfricasTalkingWhatsAppMessage, isWhatsAppMessagingConfigured } from "@/lib/africastalking-whatsapp";
import {
  normalizeWorkflowStatus,
} from "@/lib/compliance-workflow";
import { prisma } from "@/lib/prisma";
import {
  hydrateWorkItem,
  listAllHydratedWorkItems,
  parseStoredComplianceWorkflow,
  type WorkItemRecord,
  workItemDetailInclude,
} from "@/lib/work-items";

const NAIROBI_TIME_ZONE = "Africa/Nairobi";
const reminderDateFormatter = new Intl.DateTimeFormat("en-KE", {
  timeZone: NAIROBI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const messageDateFormatter = new Intl.DateTimeFormat("en-KE", {
  timeZone: NAIROBI_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const reminderHourFormatter = new Intl.DateTimeFormat("en-KE", {
  timeZone: NAIROBI_TIME_ZONE,
  hour: "2-digit",
  hour12: false,
});

type NotifiableUser = {
  id: number;
  name: string | null;
  email: string;
  role: Role;
  phoneNumber: string | null;
  whatsappOptIn: boolean;
};

interface ReminderSweepOptions {
  now?: Date;
}

export interface ReminderSweepReport {
  success: boolean;
  message: string;
  checkedItems: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
}

interface NotificationSendOutcome {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

type ManagerDigestSlaState = "AT_RISK" | "BREACHED";

interface ManagerDigestEntry {
  itemId: number;
  title: string;
  assignee: string;
  queueLabel: string;
  ageHours: number;
  slaHours: number;
  slaState: ManagerDigestSlaState;
}

type ReminderItem = Awaited<ReturnType<typeof listAllHydratedWorkItems>>[number];

function getAppBaseUrl() {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, "");
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

function getTaskLink(workItemId: number) {
  return `${getAppBaseUrl()}/tasks#task-${workItemId}`;
}

function getTasksBoardLink() {
  return `${getAppBaseUrl()}/tasks`;
}

function formatReminderDate(date: Date) {
  return messageDateFormatter.format(date);
}

function getNairobiHour(date: Date) {
  const hour = Number.parseInt(reminderHourFormatter.format(date), 10);
  return Number.isNaN(hour) ? 0 : hour;
}

function toDateKey(date: Date) {
  const parts = reminderDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not derive Nairobi date parts.");
  }

  return `${year}-${month}-${day}`;
}

function keyToEpochDays(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function diffInNairobiDays(left: Date, right: Date) {
  return keyToEpochDays(toDateKey(left)) - keyToEpochDays(toDateKey(right));
}

function truncateMessage(message: string) {
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function getElapsedHours(startedAt: string) {
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 3600000;
  return elapsed > 0 ? elapsed : 0;
}

function formatElapsedTime(hours: number) {
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = Math.floor(hours / 24);
  const remainderHours = Math.round(hours % 24);

  if (remainderHours === 0) {
    return `${days}d`;
  }

  return `${days}d ${remainderHours}h`;
}

function getManagerDigestSlaState(ageHours: number, slaHours: number): ManagerDigestSlaState | null {
  if (ageHours >= slaHours) {
    return "BREACHED";
  }

  if (ageHours >= slaHours * 0.75) {
    return "AT_RISK";
  }

  return null;
}

function buildAssigneeReminderMessage(input: {
  title: string;
  dueDate: Date;
  requiredDocumentLabel: string;
  link: string;
  stage: NotificationStage;
}) {
  const dueDate = formatReminderDate(input.dueDate);

  if (input.stage === NotificationStage.ASSIGNEE_DUE_TODAY) {
    return `BHL action needed today: ${input.title} is due today (${dueDate}). Upload the ${input.requiredDocumentLabel.toLowerCase()} and submit for approval: ${input.link}`;
  }

  if (input.stage === NotificationStage.ASSIGNEE_OVERDUE) {
    return `BHL overdue: ${input.title} was due on ${dueDate} and is still waiting on submission. Upload the ${input.requiredDocumentLabel.toLowerCase()} now: ${input.link}`;
  }

  return `BHL reminder: ${input.title} is due on ${dueDate}. Required proof: ${input.requiredDocumentLabel}. Open task: ${input.link}`;
}

function buildManagerEscalationMessage(input: {
  title: string;
  dueDate: Date;
  assignee: string;
  link: string;
}) {
  return `BHL escalation: ${input.assignee} has not submitted ${input.title}. It was due on ${formatReminderDate(input.dueDate)}. Review the task board: ${input.link}`;
}

function buildApprovalNudgeMessage(input: {
  title: string;
  assignee: string;
  submittedAt: string;
  link: string;
}) {
  return `BHL approval queue: ${input.title} was submitted by ${input.assignee} on ${input.submittedAt} and still needs approval. Review: ${input.link}`;
}

function buildAssigneeManagerResponseMessage(input: {
  title: string;
  managerName: string;
  responseLabel: string;
  responseNote: string;
  relatedTo: "BLOCKER" | "SUBMISSION";
  link: string;
}) {
  const context =
    input.relatedTo === "SUBMISSION"
      ? "your submitted task"
      : "the blocker you raised";

  return `BHL update: ${input.managerName} marked ${input.title} as "${input.responseLabel}" on ${context}. ${input.responseNote} Open task: ${input.link}`;
}

function buildBlockerAlertMessage(input: {
  title: string;
  assignee: string;
  blockerLabel: string;
  blockerReason: string;
  waitingOn?: string;
  link: string;
}) {
  const waitingOnMessage = input.waitingOn
    ? ` Waiting on: ${input.waitingOn}.`
    : "";

  return `BHL blocker alert: ${input.assignee} is blocked on ${input.title} (${input.blockerLabel}). ${input.blockerReason}.${waitingOnMessage} Open task: ${input.link}`;
}

function getManagerDigestStage(now: Date) {
  return getNairobiHour(now) < 12
    ? NotificationStage.MANAGER_MORNING_DIGEST
    : NotificationStage.MANAGER_MIDDAY_DIGEST;
}

function isManagerDigestStage(stage: NotificationStage) {
  return (
    stage === NotificationStage.MANAGER_MORNING_DIGEST ||
    stage === NotificationStage.MANAGER_MIDDAY_DIGEST
  );
}

function getManagerDigestEntries(items: ReminderItem[]) {
  return items
    .map((item) => {
      const workflow = item.workflow;
      const assignee = item.user.name || item.user.email;
      const startedFallback = item.updatedAt?.toISOString?.() || item.createdAt?.toISOString?.() || new Date().toISOString();

      if (normalizeWorkflowStatus(item.status) === "Submitted") {
        const startedAt = workflow.submittedAt || startedFallback;
        const ageHours = getElapsedHours(startedAt);
        const slaState = getManagerDigestSlaState(ageHours, 24);

        if (!slaState) {
          return null;
        }

        return {
          itemId: item.id,
          title: item.title,
          assignee,
          queueLabel: "Approval decision",
          ageHours,
          slaHours: 24,
          slaState,
        } satisfies ManagerDigestEntry;
      }

      const blocker = workflow.blocker;
      if (!blocker) {
        return null;
      }

      const needsDecision =
        blocker.needsManagerHelp ||
        blocker.code === "WAITING_APPROVAL" ||
        blocker.code === "WAITING_PAYMENT" ||
        blocker.code === "MISSING_DOCUMENT";

      if (!needsDecision) {
        return null;
      }

      const startedAt = blocker.blockedAt || startedFallback;
      const ageHours = getElapsedHours(startedAt);

      if (blocker.code === "WAITING_PAYMENT") {
        const slaState = getManagerDigestSlaState(ageHours, 6);
        if (!slaState) {
          return null;
        }

        return {
          itemId: item.id,
          title: item.title,
          assignee,
          queueLabel: "Payment release",
          ageHours,
          slaHours: 6,
          slaState,
        } satisfies ManagerDigestEntry;
      }

      if (blocker.code === "WAITING_APPROVAL") {
        const slaState = getManagerDigestSlaState(ageHours, 8);
        if (!slaState) {
          return null;
        }

        return {
          itemId: item.id,
          title: item.title,
          assignee,
          queueLabel: "Manager sign-off",
          ageHours,
          slaHours: 8,
          slaState,
        } satisfies ManagerDigestEntry;
      }

      if (blocker.code === "MISSING_DOCUMENT") {
        const slaState = getManagerDigestSlaState(ageHours, 8);
        if (!slaState) {
          return null;
        }

        return {
          itemId: item.id,
          title: item.title,
          assignee,
          queueLabel: "Document decision",
          ageHours,
          slaHours: 8,
          slaState,
        } satisfies ManagerDigestEntry;
      }

      const slaState = getManagerDigestSlaState(ageHours, 12);
      if (!slaState) {
        return null;
      }

      return {
        itemId: item.id,
        title: item.title,
        assignee,
        queueLabel: "Manager help",
        ageHours,
        slaHours: 12,
        slaState,
      } satisfies ManagerDigestEntry;
    })
    .filter((entry): entry is ManagerDigestEntry => entry !== null)
    .sort((left, right) => {
      const priorityRank: Record<ManagerDigestSlaState, number> = {
        BREACHED: 0,
        AT_RISK: 1,
      };

      const stateGap = priorityRank[left.slaState] - priorityRank[right.slaState];
      if (stateGap !== 0) {
        return stateGap;
      }

      return right.ageHours - left.ageHours;
    });
}

function buildManagerDigestMessage(input: {
  managerName: string;
  stage: NotificationStage;
  entries: ManagerDigestEntry[];
}) {
  const breachedCount = input.entries.filter((entry) => entry.slaState === "BREACHED").length;
  const atRiskCount = input.entries.filter((entry) => entry.slaState === "AT_RISK").length;
  const digestLabel =
    input.stage === NotificationStage.MANAGER_MORNING_DIGEST ? "morning" : "midday";
  const topEntries = input.entries.slice(0, 3).map((entry, index) => {
    const slaCopy =
      entry.slaState === "BREACHED"
        ? `${formatElapsedTime(entry.ageHours - entry.slaHours)} over SLA`
        : `${formatElapsedTime(entry.slaHours - entry.ageHours)} left`;

    return `${index + 1}. ${entry.queueLabel}: ${entry.title} (${entry.assignee}) - ${slaCopy}`;
  });

  const moreCount = input.entries.length - topEntries.length;
  const moreLine = moreCount > 0 ? `+ ${moreCount} more waiting on you.` : "";
  const lines = [
    `BHL ${digestLabel} digest for ${input.managerName}: ${breachedCount} breached, ${atRiskCount} due soon.`,
    ...topEntries,
    moreLine,
    `Open the manager inbox: ${getTasksBoardLink()}`,
  ].filter(Boolean);

  return lines.join("\n");
}

async function createLogEntry(input: {
  dedupeKey: string;
  stage: NotificationStage;
  recipient: string;
  message: string;
  userId?: number;
  workItemId?: number;
  sendResult: NotificationSendOutcome;
}) {
  await prisma.notificationLog.create({
    data: {
      channel: NotificationChannel.WHATSAPP,
      stage: input.stage,
      status: input.sendResult.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      recipient: input.recipient,
      messagePreview: truncateMessage(input.message),
      dedupeKey: input.dedupeKey,
      providerMessageId: input.sendResult.providerMessageId,
      errorMessage: input.sendResult.errorMessage,
      retryCount: 0,
      lastAttemptAt: new Date(),
      sentAt: input.sendResult.success ? new Date() : null,
      userId: input.userId,
      workItemId: input.workItemId,
    },
  });
}

function buildMessageForStage(input: {
  stage: NotificationStage;
  item: {
    id: number;
    title: string;
    deadline: Date;
    category: string;
    notes: string | null;
    workflowState?: unknown;
    workflow?: ReminderItem["workflow"];
    user: {
      name: string | null;
      email: string;
    };
  };
}) {
  const workflow = input.item.workflow || parseStoredComplianceWorkflow(input.item);
  const link = getTaskLink(input.item.id);
  const assigneeName = input.item.user.name || input.item.user.email;

  if (
    input.stage === NotificationStage.ASSIGNEE_PRE_DUE ||
    input.stage === NotificationStage.ASSIGNEE_DUE_TODAY ||
    input.stage === NotificationStage.ASSIGNEE_OVERDUE
  ) {
    return buildAssigneeReminderMessage({
      title: input.item.title,
      dueDate: input.item.deadline,
      requiredDocumentLabel: workflow.requiredDocumentLabel,
      link,
      stage: input.stage,
    });
  }

  if (input.stage === NotificationStage.ASSIGNEE_MANAGER_RESPONSE) {
    return buildAssigneeManagerResponseMessage({
      title: input.item.title,
      managerName:
        workflow.managerResponse?.respondedBy?.name ||
        workflow.managerResponse?.respondedBy?.email ||
        "Your manager",
      responseLabel: workflow.managerResponse?.label || "Manager response",
      responseNote:
        workflow.managerResponse?.note || "There is a new manager update on this task.",
      relatedTo: workflow.managerResponse?.relatedTo || "BLOCKER",
      link,
    });
  }

  if (input.stage === NotificationStage.MANAGER_OVERDUE_ESCALATION) {
    return buildManagerEscalationMessage({
      title: input.item.title,
      dueDate: input.item.deadline,
      assignee: assigneeName,
      link,
    });
  }

  if (input.stage === NotificationStage.MANAGER_BLOCKER_ALERT) {
    return buildBlockerAlertMessage({
      title: input.item.title,
      assignee: assigneeName,
      blockerLabel: workflow.blocker?.label || "Blocker",
      blockerReason: workflow.blocker?.reason || "The assignee requested help.",
      waitingOn: workflow.blocker?.waitingOn,
      link,
    });
  }

  return buildApprovalNudgeMessage({
    title: input.item.title,
    assignee: assigneeName,
    submittedAt: workflow.submittedAt
      ? formatReminderDate(new Date(workflow.submittedAt))
      : formatReminderDate(input.item.deadline),
    link,
  });
}

async function sendLoggedWhatsAppNotification(input: {
  dedupeKey: string;
  recipientUser: NotifiableUser;
  stage: NotificationStage;
  message: string;
  workItemId?: number;
}) {
  const existing = await prisma.notificationLog.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  });

  if (existing) {
    return { outcome: "skipped" as const };
  }

  if (!input.recipientUser.whatsappOptIn || !input.recipientUser.phoneNumber) {
    return { outcome: "skipped" as const };
  }

  const result = await sendAfricasTalkingWhatsAppMessage({
    phoneNumber: input.recipientUser.phoneNumber,
    message: input.message,
  });

  await createLogEntry({
    dedupeKey: input.dedupeKey,
    stage: input.stage,
    recipient: input.recipientUser.phoneNumber,
    message: input.message,
    userId: input.recipientUser.id,
    workItemId: input.workItemId,
    sendResult: result,
  });

  return { outcome: result.success ? ("sent" as const) : ("failed" as const) };
}

async function resolveNotificationLogWorkItem(log: {
  id: number;
  workItem: WorkItemRecord | null;
  complianceItem: {
    workItem: {
      id: number;
    } | null;
  } | null;
}) {
  if (log.workItem) {
    return log.workItem;
  }

  const mappedWorkItemId = log.complianceItem?.workItem?.id;

  if (!mappedWorkItemId) {
    return null;
  }

  await prisma.notificationLog.update({
    where: { id: log.id },
    data: {
      workItemId: mappedWorkItemId,
    },
  });

  return prisma.workItem.findUnique({
    where: { id: mappedWorkItemId },
    include: workItemDetailInclude,
  });
}

export async function retryWhatsAppNotificationLog(logId: number) {
  const log = await prisma.notificationLog.findUnique({
    where: { id: logId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phoneNumber: true,
          whatsappOptIn: true,
        },
      },
      workItem: {
        include: workItemDetailInclude,
      },
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

  if (!log) {
    return { success: false, message: "Notification log not found." };
  }

  if (log.channel !== NotificationChannel.WHATSAPP) {
    return { success: false, message: "Only WhatsApp logs can be retried." };
  }

  if (!isWhatsAppMessagingConfigured()) {
    return { success: false, message: "Africa's Talking WhatsApp credentials are not configured." };
  }

  if (!log.user || !log.user.whatsappOptIn || !log.user.phoneNumber) {
    return { success: false, message: "Recipient no longer has a valid opted-in WhatsApp number." };
  }

  let message: string;

  if (isManagerDigestStage(log.stage)) {
    const digestItems = (await listAllHydratedWorkItems()).filter((item) =>
      ["Pending", "Rejected", "Submitted"].includes(item.status),
    );

    const entries = getManagerDigestEntries(digestItems);
    if (entries.length === 0) {
      return { success: false, message: "There are no due-soon or breached manager inbox items to include right now." };
    }

    message = buildManagerDigestMessage({
      managerName: log.user.name || log.user.email,
      stage: log.stage,
      entries,
    });
  } else {
    const resolvedWorkItem = await resolveNotificationLogWorkItem(log);

    if (!resolvedWorkItem) {
      return { success: false, message: "The original task is no longer available." };
    }

    const item = hydrateWorkItem(resolvedWorkItem);
    message = buildMessageForStage({
      stage: log.stage,
      item: {
        id: item.id,
        title: item.title,
        deadline: item.deadline,
        category: item.category,
        notes: null,
        workflow: item.workflow,
        user: item.user,
      },
    });
  }

  const result = await sendAfricasTalkingWhatsAppMessage({
    phoneNumber: log.user.phoneNumber,
    message,
  });

  await prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      providerMessageId: result.providerMessageId ?? log.providerMessageId,
      errorMessage: result.success ? null : result.errorMessage,
      messagePreview: truncateMessage(message),
      retryCount: { increment: 1 },
      lastAttemptAt: new Date(),
      sentAt: result.success ? new Date() : log.sentAt,
    },
  });

  return {
    success: result.success,
    message: result.success ? "WhatsApp notification resent." : result.errorMessage || "Retry failed.",
  };
}

function managerRoles() {
  return [Role.ADMIN, Role.ACCOUNTANT, Role.HR, Role.OPERATIONS_MANAGER];
}

async function sendManagerDigest(input: {
  manager: NotifiableUser;
  items: ReminderItem[];
  now: Date;
}) {
  const entries = getManagerDigestEntries(input.items);

  if (entries.length === 0) {
    return { outcome: "skipped" as const };
  }

  const stage = getManagerDigestStage(input.now);
  const message = buildManagerDigestMessage({
    managerName: input.manager.name || input.manager.email,
    stage,
    entries,
  });

  return sendLoggedWhatsAppNotification({
    dedupeKey: `whatsapp:${stage}:${toDateKey(input.now)}:${input.manager.id}`,
    recipientUser: input.manager,
    stage,
    message,
  });
}

export async function sendAssigneeManagerResponseNudge(workItemId: number) {
  if (!isWhatsAppMessagingConfigured()) {
    return {
      success: false,
      notifiedAssignee: false,
      failedCount: 0,
      skippedCount: 0,
      message: "Africa's Talking WhatsApp credentials are not configured.",
    };
  }

  const workItemRecord = await prisma.workItem.findUnique({
    where: { id: workItemId },
    include: workItemDetailInclude,
  });

  if (!workItemRecord) {
    return {
      success: false,
      notifiedAssignee: false,
      failedCount: 0,
      skippedCount: 0,
      message: "The task for this manager response could not be found.",
    };
  }

  const item = hydrateWorkItem(workItemRecord);
  const workflow = item.workflow;
  const managerResponse = workflow.managerResponse;

  if (!managerResponse) {
    return {
      success: false,
      notifiedAssignee: false,
      failedCount: 0,
      skippedCount: 0,
      message: "There is no manager response to send yet.",
    };
  }

  if (managerResponse.respondedBy?.id && managerResponse.respondedBy.id === item.user.id) {
    return {
      success: true,
      notifiedAssignee: false,
      failedCount: 0,
      skippedCount: 1,
      message: "Assignee notification was skipped because the assignee responded as manager.",
    };
  }

  const outcome = await sendLoggedWhatsAppNotification({
    dedupeKey: `whatsapp:${NotificationStage.ASSIGNEE_MANAGER_RESPONSE}:${managerResponse.respondedAt}:${item.id}:${item.user.id}`,
    recipientUser: item.user,
    stage: NotificationStage.ASSIGNEE_MANAGER_RESPONSE,
    message: buildAssigneeManagerResponseMessage({
      title: item.title,
      managerName:
        managerResponse.respondedBy?.name ||
        managerResponse.respondedBy?.email ||
        "Your manager",
      responseLabel: managerResponse.label,
      responseNote: managerResponse.note,
      relatedTo: managerResponse.relatedTo,
      link: getTaskLink(item.id),
    }),
    workItemId: item.id,
  });

  return {
    success: outcome.outcome !== "failed",
    notifiedAssignee: outcome.outcome === "sent",
    failedCount: outcome.outcome === "failed" ? 1 : 0,
    skippedCount: outcome.outcome === "skipped" ? 1 : 0,
    message:
      outcome.outcome === "sent"
        ? "Assignee was nudged on WhatsApp."
        : outcome.outcome === "failed"
          ? "Assignee WhatsApp nudge failed."
          : "Assignee WhatsApp nudge was skipped.",
  };
}

export async function sendManagerBlockerAlert(workItemId: number) {
  if (!isWhatsAppMessagingConfigured()) {
    return {
      success: false,
      notifiedManagers: 0,
      failedCount: 0,
      skippedCount: 0,
      message: "Africa's Talking WhatsApp credentials are not configured.",
    };
  }

  const workItemRecord = await prisma.workItem.findUnique({
    where: { id: workItemId },
    include: workItemDetailInclude,
  });

  if (!workItemRecord) {
    return {
      success: false,
      notifiedManagers: 0,
      failedCount: 0,
      skippedCount: 0,
      message: "The blocked task could not be found.",
    };
  }

  const item = hydrateWorkItem(workItemRecord);
  const workflow = item.workflow;
  const blocker = workflow.blocker;

  if (!blocker || !blocker.needsManagerHelp) {
    return {
      success: true,
      notifiedManagers: 0,
      failedCount: 0,
      skippedCount: 0,
      message: "No manager escalation was requested for this blocker.",
    };
  }

  const managers = await prisma.user.findMany({
    where: {
      id: { not: item.userId },
      isActive: true,
      role: { in: managerRoles() },
      whatsappOptIn: true,
      phoneNumber: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phoneNumber: true,
      whatsappOptIn: true,
    },
  });

  if (managers.length === 0) {
    return {
      success: true,
      notifiedManagers: 0,
      failedCount: 0,
      skippedCount: 0,
      message: "No opted-in managers were available for blocker alerts.",
    };
  }

  const message = buildBlockerAlertMessage({
    title: item.title,
    assignee: item.user.name || item.user.email,
    blockerLabel: blocker.label,
    blockerReason: blocker.reason,
    waitingOn: blocker.waitingOn,
    link: getTaskLink(item.id),
  });

  let notifiedManagers = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const manager of managers) {
    const outcome = await sendLoggedWhatsAppNotification({
      dedupeKey: `whatsapp:${NotificationStage.MANAGER_BLOCKER_ALERT}:${blocker.blockedAt}:${item.id}:${manager.id}`,
      recipientUser: manager,
      stage: NotificationStage.MANAGER_BLOCKER_ALERT,
      message,
      workItemId: item.id,
    });

    if (outcome.outcome === "sent") notifiedManagers += 1;
    if (outcome.outcome === "failed") failedCount += 1;
    if (outcome.outcome === "skipped") skippedCount += 1;
  }

  return {
    success: failedCount === 0,
    notifiedManagers,
    failedCount,
    skippedCount,
    message:
      notifiedManagers > 0
        ? `Alerted ${notifiedManagers} manager${notifiedManagers === 1 ? "" : "s"} on WhatsApp.`
        : failedCount > 0
          ? "Manager blocker alerts failed."
          : "Manager blocker alerts were skipped.",
  };
}

export async function runWhatsAppReminderSweep(
  options: ReminderSweepOptions = {},
): Promise<ReminderSweepReport> {
  if (!isWhatsAppMessagingConfigured()) {
    return {
      success: false,
      message: "Africa's Talking WhatsApp credentials are not configured.",
      checkedItems: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  const now = options.now ?? new Date();
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: managerRoles() },
      whatsappOptIn: true,
      phoneNumber: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phoneNumber: true,
      whatsappOptIn: true,
    },
  });

  const items = (await listAllHydratedWorkItems()).filter((item) =>
    ["Pending", "Rejected", "Submitted"].includes(item.status),
  );

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    const workflow = item.workflow;
    const status = normalizeWorkflowStatus(item.status);
    const daysUntilDeadline = diffInNairobiDays(item.deadline, now);
    const link = getTaskLink(item.id);

    const assigneeName = item.user.name || item.user.email;
    const reminderDaysBefore = item.remindDaysBefore ?? 7;

    if (status === "Pending" || status === "Rejected") {
      if (daysUntilDeadline === reminderDaysBefore) {
        const outcome = await sendLoggedWhatsAppNotification({
          dedupeKey: `whatsapp:${NotificationStage.ASSIGNEE_PRE_DUE}:${toDateKey(now)}:${item.id}:${item.user.id}`,
          recipientUser: item.user,
          stage: NotificationStage.ASSIGNEE_PRE_DUE,
          message: buildAssigneeReminderMessage({
            title: item.title,
            dueDate: item.deadline,
            requiredDocumentLabel: workflow.requiredDocumentLabel,
            link,
            stage: NotificationStage.ASSIGNEE_PRE_DUE,
          }),
          workItemId: item.id,
        });

        if (outcome.outcome === "sent") sentCount += 1;
        if (outcome.outcome === "failed") failedCount += 1;
        if (outcome.outcome === "skipped") skippedCount += 1;
      }

      if (daysUntilDeadline === 0) {
        const outcome = await sendLoggedWhatsAppNotification({
          dedupeKey: `whatsapp:${NotificationStage.ASSIGNEE_DUE_TODAY}:${toDateKey(now)}:${item.id}:${item.user.id}`,
          recipientUser: item.user,
          stage: NotificationStage.ASSIGNEE_DUE_TODAY,
          message: buildAssigneeReminderMessage({
            title: item.title,
            dueDate: item.deadline,
            requiredDocumentLabel: workflow.requiredDocumentLabel,
            link,
            stage: NotificationStage.ASSIGNEE_DUE_TODAY,
          }),
          workItemId: item.id,
        });

        if (outcome.outcome === "sent") sentCount += 1;
        if (outcome.outcome === "failed") failedCount += 1;
        if (outcome.outcome === "skipped") skippedCount += 1;
      }

      if (daysUntilDeadline === -1) {
        const assigneeOutcome = await sendLoggedWhatsAppNotification({
          dedupeKey: `whatsapp:${NotificationStage.ASSIGNEE_OVERDUE}:${toDateKey(now)}:${item.id}:${item.user.id}`,
          recipientUser: item.user,
          stage: NotificationStage.ASSIGNEE_OVERDUE,
          message: buildAssigneeReminderMessage({
            title: item.title,
            dueDate: item.deadline,
            requiredDocumentLabel: workflow.requiredDocumentLabel,
            link,
            stage: NotificationStage.ASSIGNEE_OVERDUE,
          }),
          workItemId: item.id,
        });

        if (assigneeOutcome.outcome === "sent") sentCount += 1;
        if (assigneeOutcome.outcome === "failed") failedCount += 1;
        if (assigneeOutcome.outcome === "skipped") skippedCount += 1;

        for (const manager of managers.filter((candidate) => candidate.id !== item.user.id)) {
          const managerOutcome = await sendLoggedWhatsAppNotification({
            dedupeKey: `whatsapp:${NotificationStage.MANAGER_OVERDUE_ESCALATION}:${toDateKey(now)}:${item.id}:${manager.id}`,
            recipientUser: manager,
            stage: NotificationStage.MANAGER_OVERDUE_ESCALATION,
            message: buildManagerEscalationMessage({
              title: item.title,
              dueDate: item.deadline,
              assignee: assigneeName,
              link,
            }),
            workItemId: item.id,
          });

          if (managerOutcome.outcome === "sent") sentCount += 1;
          if (managerOutcome.outcome === "failed") failedCount += 1;
          if (managerOutcome.outcome === "skipped") skippedCount += 1;
        }
      }
    }

    if (status === "Submitted") {
      const submittedAt = workflow.submittedAt ? new Date(workflow.submittedAt) : null;

      if (!submittedAt) {
        continue;
      }

      if (diffInNairobiDays(now, submittedAt) === 1) {
        for (const manager of managers.filter((candidate) => candidate.id !== item.user.id)) {
          const managerOutcome = await sendLoggedWhatsAppNotification({
            dedupeKey: `whatsapp:${NotificationStage.MANAGER_APPROVAL_NUDGE}:${toDateKey(now)}:${item.id}:${manager.id}`,
            recipientUser: manager,
            stage: NotificationStage.MANAGER_APPROVAL_NUDGE,
            message: buildApprovalNudgeMessage({
              title: item.title,
              assignee: assigneeName,
              submittedAt: formatReminderDate(submittedAt),
              link,
            }),
            workItemId: item.id,
          });

          if (managerOutcome.outcome === "sent") sentCount += 1;
          if (managerOutcome.outcome === "failed") failedCount += 1;
          if (managerOutcome.outcome === "skipped") skippedCount += 1;
        }
      }
    }
  }

  for (const manager of managers) {
    const digestOutcome = await sendManagerDigest({
      manager,
      items,
      now,
    });

    if (digestOutcome.outcome === "sent") sentCount += 1;
    if (digestOutcome.outcome === "failed") failedCount += 1;
    if (digestOutcome.outcome === "skipped") skippedCount += 1;
  }

  return {
    success: true,
    message: "WhatsApp reminder sweep and manager digest completed.",
    checkedItems: items.length,
    sentCount,
    skippedCount,
    failedCount,
  };
}

import {
  canApproveRole,
  hasActiveBlocker,
  isClosedStatus,
} from "@/lib/compliance-workflow";
import {
  buildUserScope,
} from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { listAllHydratedWorkItems, listHydratedWorkItems } from "@/lib/work-items";

export interface AssistantUserContext {
  id?: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: number;
  organizationName?: string | null;
  organizationSlug?: string | null;
}

export interface AssistantChatHistoryMessage {
  role: "user" | "assistant";
  text: string;
}

interface AssistantWorkItemSummary {
  id: number;
  title: string;
  owner: string;
  deadline: string;
  status: string;
  category: string;
  blockerLabel?: string;
  blockerReason?: string;
}

interface AssistantManagerQueueSummary {
  id: number;
  title: string;
  owner: string;
  queueLabel: string;
  ageHours: number;
  slaHours: number;
  slaState: "ON_TRACK" | "AT_RISK" | "BREACHED";
}

interface AssistantStockSummary {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
}

interface AssistantSubscriptionSummary {
  id: number;
  name: string;
  provider: string;
  nextBillingDate: string;
  cost: number;
}

interface AssistantMaintenanceSummary {
  id: number;
  assetName: string;
  assetType: string;
  nextServiceDate: string;
}

interface AssistantTrainingSummary {
  id: number;
  title: string;
  startDate: string;
  location: string;
  costKES: number;
  budgetKES: number;
}

interface AssistantNotificationFailureSummary {
  id: number;
  stage: string;
  recipient: string;
  errorMessage: string;
  taskTitle?: string;
}

interface AssistantWorkloadSummary {
  owner: string;
  openCount: number;
  urgentCount: number;
  blockedCount: number;
}

export interface AssistantContextSnapshot {
  generatedAt: string;
  scope: "organization" | "personal";
  userLabel: string;
  roleLabel: string;
  compliance: {
    openCount: number;
    urgentCount: number;
    blockedCount: number;
    dueTodayOrOverdueCount: number;
    submittedCount: number;
    waitingOnManagerCount: number;
    urgentItems: AssistantWorkItemSummary[];
    blockedItems: AssistantWorkItemSummary[];
    managerQueue: AssistantManagerQueueSummary[];
  };
  operations: {
    lowStock: AssistantStockSummary[];
    dueSubscriptions: AssistantSubscriptionSummary[];
    dueMaintenance: AssistantMaintenanceSummary[];
  };
  finance: {
    monthLabel: string;
    totalSpend: number;
    topCategories: Array<{ category: string; total: number }>;
  };
  training: {
    upcoming: AssistantTrainingSummary[];
    budgetRiskCount: number;
  };
  communications: {
    failedWhatsAppCount: number;
    recentFailures: AssistantNotificationFailureSummary[];
  };
  people: {
    activeStaffCount: number;
    workload: AssistantWorkloadSummary[];
  };
  kenyaReference: string[];
}

export interface AssistantReplyPayload {
  reply: string;
  suggestions: string[];
  grounding: string;
  mode: "openai-grounded" | "ai-service-grounded" | "local-copilot";
}

type ScopedComplianceItem = Awaited<ReturnType<typeof listHydratedWorkItems>>[number];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatShortDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
  });
}

function formatCurrency(amount: number) {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

function getElapsedHours(startedAt: string | Date) {
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 3600000;
  return elapsed > 0 ? elapsed : 0;
}

function getManagerQueueEntry(item: ScopedComplianceItem) {
  const workflow = item.workflow;
  const owner = item.user.name || item.user.email;
  const startedFallback = item.updatedAt.toISOString();

  if (item.status === "Submitted") {
    const ageHours = getElapsedHours(workflow.submittedAt || startedFallback);
    return {
      id: item.id,
      title: item.title,
      owner,
      queueLabel: "Approval decision",
      ageHours,
      slaHours: 24,
      slaState:
        ageHours >= 24 ? "BREACHED" : ageHours >= 18 ? "AT_RISK" : "ON_TRACK",
    } satisfies AssistantManagerQueueSummary;
  }

  if (!workflow.blocker) {
    return null;
  }

  const blocker = workflow.blocker;
  const needsDecision =
    blocker.needsManagerHelp ||
    blocker.code === "WAITING_APPROVAL" ||
    blocker.code === "WAITING_PAYMENT" ||
    blocker.code === "MISSING_DOCUMENT";

  if (!needsDecision) {
    return null;
  }

  const ageHours = getElapsedHours(blocker.blockedAt || startedFallback);

  if (blocker.code === "WAITING_PAYMENT") {
    return {
      id: item.id,
      title: item.title,
      owner,
      queueLabel: "Payment release",
      ageHours,
      slaHours: 6,
      slaState:
        ageHours >= 6 ? "BREACHED" : ageHours >= 4.5 ? "AT_RISK" : "ON_TRACK",
    } satisfies AssistantManagerQueueSummary;
  }

  if (blocker.code === "WAITING_APPROVAL") {
    return {
      id: item.id,
      title: item.title,
      owner,
      queueLabel: "Manager sign-off",
      ageHours,
      slaHours: 8,
      slaState:
        ageHours >= 8 ? "BREACHED" : ageHours >= 6 ? "AT_RISK" : "ON_TRACK",
    } satisfies AssistantManagerQueueSummary;
  }

  if (blocker.code === "MISSING_DOCUMENT") {
    return {
      id: item.id,
      title: item.title,
      owner,
      queueLabel: "Document decision",
      ageHours,
      slaHours: 8,
      slaState:
        ageHours >= 8 ? "BREACHED" : ageHours >= 6 ? "AT_RISK" : "ON_TRACK",
    } satisfies AssistantManagerQueueSummary;
  }

  return {
    id: item.id,
    title: item.title,
    owner,
    queueLabel: "Manager help",
    ageHours,
    slaHours: 12,
    slaState:
      ageHours >= 12 ? "BREACHED" : ageHours >= 9 ? "AT_RISK" : "ON_TRACK",
  } satisfies AssistantManagerQueueSummary;
}

function summarizeWorkItem(item: ScopedComplianceItem): AssistantWorkItemSummary {
  const workflow = item.workflow;

      return {
        id: item.id,
        title: item.title,
        owner: item.user.name || item.user.email,
    deadline: item.deadline.toISOString(),
    status: item.status,
    category: item.category,
    blockerLabel: workflow.blocker?.label,
    blockerReason: workflow.blocker?.reason,
  };
}

function rankUrgentItems(items: ScopedComplianceItem[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return items
    .filter((item) => !isClosedStatus(item.status))
    .sort((left, right) => {
      const leftWorkflow = left.workflow;
      const rightWorkflow = right.workflow;
      const leftDeadline = new Date(left.deadline);
      const rightDeadline = new Date(right.deadline);
      const leftUrgency =
        hasActiveBlocker(leftWorkflow) || left.status === "Submitted"
          ? 0
          : leftDeadline <= today
            ? 1
            : 2;
      const rightUrgency =
        hasActiveBlocker(rightWorkflow) || right.status === "Submitted"
          ? 0
          : rightDeadline <= today
            ? 1
            : 2;

      if (leftUrgency !== rightUrgency) {
        return leftUrgency - rightUrgency;
      }

      return leftDeadline.getTime() - rightDeadline.getTime();
    });
}

function formatWorkItemLine(item: AssistantWorkItemSummary) {
  const blockerPart = item.blockerLabel ? `, blocked by ${item.blockerLabel}` : "";
  return `${item.title} (${item.owner}, due ${formatShortDate(item.deadline)}, ${item.status}${blockerPart})`;
}

function formatManagerQueueLine(item: AssistantManagerQueueSummary) {
  const age = Math.round(item.ageHours);
  return `${item.queueLabel}: ${item.title} (${item.owner}, ${age}h waiting, ${item.slaState.toLowerCase()})`;
}

function formatStockLine(item: AssistantStockSummary) {
  return `${item.name} (${item.category}) is at ${item.quantity} with a minimum of ${item.minQuantity}`;
}

function formatSubscriptionLine(item: AssistantSubscriptionSummary) {
  return `${item.name} (${item.provider}) renews on ${formatShortDate(item.nextBillingDate)} at ${formatCurrency(item.cost)}`;
}

function formatMaintenanceLine(item: AssistantMaintenanceSummary) {
  return `${item.assetName} (${item.assetType}) needs service by ${formatShortDate(item.nextServiceDate)}`;
}

function formatTrainingLine(item: AssistantTrainingSummary) {
  return `${item.title} on ${formatShortDate(item.startDate)} at ${item.location} for ${formatCurrency(item.costKES)}`;
}

function formatFailureLine(item: AssistantNotificationFailureSummary) {
  return `${item.stage}: ${item.taskTitle || item.recipient} failed because ${item.errorMessage}`;
}

function formatWorkloadLine(item: AssistantWorkloadSummary) {
  return `${item.owner} has ${item.openCount} open tasks, ${item.urgentCount} urgent, and ${item.blockedCount} blocked`;
}

function getKenyaReference() {
  return [
    "PAYE, NSSF and SHA are usually handled by the 9th of each month in the current product logic.",
    "VAT is usually handled by the 20th of each month in the current product logic.",
    "Corporation tax balance review is tracked for April 30 and return filing for June 30 under the current annual assumptions.",
    "Business permit and workplace renewal are tracked for February 10 in the current brief, but county and licence rules may vary.",
    "Sheria House annual return is tracked for March 31 and CR12 reviews for June 30 and December 31 in the current pack.",
  ];
}

export async function buildAssistantSnapshot(
  currentUser: AssistantUserContext | null,
): Promise<AssistantContextSnapshot> {
  const now = new Date();
  const in7Days = addDays(now, 7);
  const in30Days = addDays(now, 30);
  const in45Days = addDays(now, 45);
  const in60Days = addDays(now, 60);
  const isManager = canApproveRole(currentUser?.role);
  const scope = isManager ? "organization" : "personal";
  const complianceWhere = currentUser?.organizationId
    ? {
        organizationId: currentUser.organizationId,
        organizationSlug: currentUser.organizationSlug || undefined,
        userId: currentUser.id,
        canManage: isManager,
      }
    : null;

  const [
    complianceItems,
    inventoryItems,
    subscriptions,
    maintenanceLogs,
    trainings,
    notificationFailures,
    expenseGroups,
    activeStaffCount,
  ] = await Promise.all([
    complianceWhere ? listHydratedWorkItems(complianceWhere) : listAllHydratedWorkItems(),
    prisma.inventoryItem.findMany({
      orderBy: [{ quantity: "asc" }, { updatedAt: "desc" }],
      take: 40,
    }),
    prisma.softwareSubscription.findMany({
      where: {
        status: "ACTIVE",
        nextBillingDate: { lte: in30Days },
      },
      orderBy: { nextBillingDate: "asc" },
      take: 10,
    }),
    prisma.maintenanceLog.findMany({
      where: {
        nextServiceDate: {
          not: null,
          lte: in45Days,
        },
      },
      include: {
        asset: {
          select: {
            name: true,
            type: true,
          },
        },
      },
      orderBy: { nextServiceDate: "asc" },
      take: 10,
    }),
    prisma.training.findMany({
      where: {
        status: "SCHEDULED",
        startDate: { gte: now, lte: in60Days },
      },
      orderBy: { startDate: "asc" },
      take: 10,
    }),
    prisma.notificationLog.findMany({
      where: {
        channel: "WHATSAPP",
        status: "FAILED",
        ...(currentUser?.organizationId
          ? {
              OR: [
                {
                  workItem: {
                    is: {
                      organizationId: currentUser.organizationId,
                    },
                  },
                },
                {
                  complianceItem: {
                    is: {
                      organizationId: currentUser.organizationId,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        workItem: {
          select: {
            title: true,
          },
        },
        complianceItem: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.operationalExpense.groupBy({
      by: ["category"],
      where: {
        date: {
          gte: startOfMonth(now),
          lte: endOfMonth(now),
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
      take: 5,
    }),
    prisma.user.count({
      where: currentUser?.organizationId
        ? buildUserScope(currentUser.organizationId, currentUser.organizationSlug || undefined, {
            isActive: true,
          })
        : { isActive: true },
    }),
  ]);

  const openCompliance = complianceItems.filter((item) => !isClosedStatus(item.status));
  const blockedItems = openCompliance.filter((item) =>
    hasActiveBlocker(item.workflow),
  );
  const dueTodayOrOverdueCount = openCompliance.filter((item) => item.deadline <= now).length;
  const urgentItems = rankUrgentItems(
    openCompliance.filter((item) => {
      const workflow = item.workflow;

      return (
        hasActiveBlocker(workflow) ||
        item.status === "Submitted" ||
        item.deadline <= in7Days
      );
    }),
  )
    .slice(0, 6)
    .map(summarizeWorkItem);

  const managerQueue = isManager
    ? openCompliance
        .map(getManagerQueueEntry)
        .filter((entry): entry is AssistantManagerQueueSummary => entry !== null)
        .sort((left, right) => {
          const priority: Record<AssistantManagerQueueSummary["slaState"], number> = {
            BREACHED: 0,
            AT_RISK: 1,
            ON_TRACK: 2,
          };

          const stateGap = priority[left.slaState] - priority[right.slaState];
          if (stateGap !== 0) {
            return stateGap;
          }

          return right.ageHours - left.ageHours;
        })
        .slice(0, 6)
    : [];

  const waitingOnManagerCount = isManager
    ? managerQueue.length
    : openCompliance.filter((item) => {
        const workflow = item.workflow;
        return item.status === "Submitted" || workflow.blocker?.needsManagerHelp;
      }).length;

  const lowStock = inventoryItems
    .filter((item) => item.quantity <= item.minQuantity)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
    }));

  const dueSubscriptions = subscriptions.map((item) => ({
    id: item.id,
    name: item.name,
    provider: item.provider || "Unknown provider",
    nextBillingDate: item.nextBillingDate.toISOString(),
    cost: item.cost,
  }));

  const dueMaintenance = maintenanceLogs
    .filter((item) => item.nextServiceDate)
    .map((item) => ({
      id: item.id,
      assetName: item.asset.name,
      assetType: item.asset.type,
      nextServiceDate: item.nextServiceDate!.toISOString(),
    }));

  const upcomingTrainings = trainings.map((item) => ({
    id: item.id,
    title: item.title,
    startDate: item.startDate.toISOString(),
    location: item.location || "TBD",
    costKES: item.costKES,
    budgetKES: item.budgetKES,
  }));

  const budgetRiskCount = upcomingTrainings.filter(
    (item) => item.costKES > item.budgetKES,
  ).length;

  const topCategories = expenseGroups.map((group) => ({
    category: group.category,
    total: group._sum.amount || 0,
  }));

  const totalSpend = topCategories.reduce((sum, group) => sum + group.total, 0);

  const workloadMap = new Map<string, AssistantWorkloadSummary>();
  for (const item of openCompliance) {
    const owner = item.user.name || item.user.email;
    const workflow = item.workflow;
    const entry = workloadMap.get(owner) || {
      owner,
      openCount: 0,
      urgentCount: 0,
      blockedCount: 0,
    };

    entry.openCount += 1;

    if (hasActiveBlocker(workflow) || item.status === "Submitted" || item.deadline <= in7Days) {
      entry.urgentCount += 1;
    }

    if (hasActiveBlocker(workflow)) {
      entry.blockedCount += 1;
    }

    workloadMap.set(owner, entry);
  }

  const workload = Array.from(workloadMap.values())
    .sort((left, right) => {
      if (left.urgentCount !== right.urgentCount) {
        return right.urgentCount - left.urgentCount;
      }

      return right.openCount - left.openCount;
    })
    .slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    scope,
    userLabel: currentUser?.name || currentUser?.email || "Current user",
    roleLabel: currentUser?.role?.replaceAll("_", " ") || "USER",
    compliance: {
      openCount: openCompliance.length,
      urgentCount: urgentItems.length,
      blockedCount: blockedItems.length,
      dueTodayOrOverdueCount,
      submittedCount: openCompliance.filter((item) => item.status === "Submitted").length,
      waitingOnManagerCount,
      urgentItems,
      blockedItems: blockedItems.slice(0, 6).map(summarizeWorkItem),
      managerQueue,
    },
    operations: {
      lowStock,
      dueSubscriptions,
      dueMaintenance,
    },
    finance: {
      monthLabel: now.toLocaleDateString("en-KE", { month: "long", year: "numeric" }),
      totalSpend,
      topCategories,
    },
    training: {
      upcoming: upcomingTrainings,
      budgetRiskCount,
    },
    communications: {
      failedWhatsAppCount: notificationFailures.length,
      recentFailures: notificationFailures.map((item) => ({
        id: item.id,
        stage: item.stage.replaceAll("_", " "),
        recipient: item.recipient,
        errorMessage: item.errorMessage || "Unknown error",
        taskTitle: item.workItem?.title || item.complianceItem?.title,
      })),
    },
    people: {
      activeStaffCount,
      workload,
    },
    kenyaReference: getKenyaReference(),
  };
}

export function buildAssistantGroundingLabel(snapshot: AssistantContextSnapshot) {
  return [
    `${snapshot.scope === "organization" ? "Org" : "Personal"} scope`,
    `${snapshot.compliance.openCount} open tasks`,
    `${snapshot.compliance.blockedCount} blocked`,
    `${snapshot.operations.lowStock.length} low-stock items`,
    `${snapshot.operations.dueSubscriptions.length} subscriptions due soon`,
    `${snapshot.communications.failedWhatsAppCount} WhatsApp failures`,
  ].join(" | ");
}

export function buildAssistantContextText(snapshot: AssistantContextSnapshot) {
  const lines = [
    `Scope: ${snapshot.scope}`,
    `User: ${snapshot.userLabel} (${snapshot.roleLabel})`,
    `Open tasks: ${snapshot.compliance.openCount}`,
    `Urgent tasks: ${snapshot.compliance.urgentCount}`,
    `Blocked tasks: ${snapshot.compliance.blockedCount}`,
    `Due today or overdue: ${snapshot.compliance.dueTodayOrOverdueCount}`,
    `Submitted waiting review: ${snapshot.compliance.submittedCount}`,
    `Waiting on manager: ${snapshot.compliance.waitingOnManagerCount}`,
    `Low stock items: ${snapshot.operations.lowStock.length}`,
    `Subscriptions due soon: ${snapshot.operations.dueSubscriptions.length}`,
    `Maintenance due soon: ${snapshot.operations.dueMaintenance.length}`,
    `Upcoming trainings: ${snapshot.training.upcoming.length}`,
    `WhatsApp failures: ${snapshot.communications.failedWhatsAppCount}`,
    `Monthly spend tracked: ${formatCurrency(snapshot.finance.totalSpend)}`,
    "",
    "Urgent work:",
    ...(snapshot.compliance.urgentItems.length > 0
      ? snapshot.compliance.urgentItems.map((item) => `- ${formatWorkItemLine(item)}`)
      : ["- No urgent work is currently highlighted."]),
    "",
    "Manager queue:",
    ...(snapshot.compliance.managerQueue.length > 0
      ? snapshot.compliance.managerQueue.map((item) => `- ${formatManagerQueueLine(item)}`)
      : ["- No manager queue items are currently highlighted."]),
    "",
    "Blocked work:",
    ...(snapshot.compliance.blockedItems.length > 0
      ? snapshot.compliance.blockedItems.map((item) => `- ${formatWorkItemLine(item)}`)
      : ["- No active blockers right now."]),
    "",
    "Operational issues:",
    ...(snapshot.operations.lowStock.length > 0
      ? snapshot.operations.lowStock.map((item) => `- ${formatStockLine(item)}`)
      : ["- No low-stock supply issue in the current snapshot."]),
    ...(snapshot.operations.dueSubscriptions.length > 0
      ? snapshot.operations.dueSubscriptions.map((item) => `- ${formatSubscriptionLine(item)}`)
      : []),
    ...(snapshot.operations.dueMaintenance.length > 0
      ? snapshot.operations.dueMaintenance.map((item) => `- ${formatMaintenanceLine(item)}`)
      : []),
    "",
    "Training pipeline:",
    ...(snapshot.training.upcoming.length > 0
      ? snapshot.training.upcoming.map((item) => `- ${formatTrainingLine(item)}`)
      : ["- No training is scheduled in the next 60 days."]),
    "",
    "Communication failures:",
    ...(snapshot.communications.recentFailures.length > 0
      ? snapshot.communications.recentFailures.map((item) => `- ${formatFailureLine(item)}`)
      : ["- No recent WhatsApp delivery failures."]),
    "",
    "Kenya compliance reference:",
    ...snapshot.kenyaReference.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}

function normalizeQuery(query: string) {
  return query.toLowerCase().trim();
}

function formatSection(title: string, lines: string[]) {
  if (lines.length === 0) {
    return "";
  }

  return `${title}\n${lines.join("\n")}`;
}

function buildPriorityReply(snapshot: AssistantContextSnapshot) {
  const urgentLines =
    snapshot.compliance.urgentItems.length > 0
      ? snapshot.compliance.urgentItems
          .slice(0, 3)
          .map((item, index) => `${index + 1}. ${formatWorkItemLine(item)}`)
      : ["1. No urgent tasks are currently flagged from live data."];

  const actionLines = [
    snapshot.compliance.managerQueue[0]
      ? `- Clear the top manager queue item first: ${formatManagerQueueLine(snapshot.compliance.managerQueue[0])}`
      : "- Start with the earliest due open item and clear its checklist today.",
    snapshot.compliance.blockedItems[0]
      ? `- Remove the hardest blocker: ${formatWorkItemLine(snapshot.compliance.blockedItems[0])}`
      : "- Keep blocked work at zero by logging help requests early.",
    snapshot.operations.lowStock[0]
      ? `- Replenish supplies at risk: ${formatStockLine(snapshot.operations.lowStock[0])}`
      : "- Check subscriptions and maintenance so support work does not turn into outages.",
  ];

  const riskLines = [
    `- ${snapshot.compliance.dueTodayOrOverdueCount} items are already due today or overdue.`,
    `- ${snapshot.communications.failedWhatsAppCount} WhatsApp deliveries failed recently, which weakens follow-through.`,
  ];

  return [
    formatSection("What matters now", [
      `- ${snapshot.compliance.openCount} open tasks are in scope and ${snapshot.compliance.blockedCount} are blocked.`,
      `- ${snapshot.compliance.waitingOnManagerCount} items are waiting on manager response or sign-off.`,
    ]),
    formatSection("Do these next", urgentLines),
    formatSection("Watchouts", riskLines),
    formatSection("Good move", actionLines),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildBlockerReply(snapshot: AssistantContextSnapshot) {
  const blockedLines =
    snapshot.compliance.blockedItems.length > 0
      ? snapshot.compliance.blockedItems
          .slice(0, 4)
          .map((item, index) => {
            const reason = item.blockerReason ? ` - ${item.blockerReason}` : "";
            return `${index + 1}. ${formatWorkItemLine(item)}${reason}`;
          })
      : ["1. No blocked tasks are active right now."];

  const actionLines = [
    snapshot.compliance.managerQueue[0]
      ? `- Clear manager-owned bottlenecks first: ${formatManagerQueueLine(snapshot.compliance.managerQueue[0])}`
      : "- If someone is stuck, log the blocker immediately instead of letting the task go silent.",
    "- Where work is waiting on money, approval, or proof, assign one named person to close that gap today.",
    "- If a blocker is environmental, like KRA portal or power, switch the assistant response to contingency planning instead of blame.",
  ];

  return [
    formatSection("Blocked work", [
      `- ${snapshot.compliance.blockedCount} tasks are currently blocked in the live snapshot.`,
    ]),
    formatSection("Current blockers", blockedLines),
    formatSection("Best response", actionLines),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildRiskReply(snapshot: AssistantContextSnapshot) {
  const riskLines: string[] = [];

  if (snapshot.compliance.dueTodayOrOverdueCount > 0) {
    riskLines.push(
      `- ${snapshot.compliance.dueTodayOrOverdueCount} compliance items are due today or overdue, which is your clearest fine or penalty exposure.`,
    );
  }

  if (snapshot.operations.dueSubscriptions.length > 0) {
    riskLines.push(
      `- ${snapshot.operations.dueSubscriptions.length} software or connectivity subscriptions are due soon, which is a live outage risk.`,
    );
  }

  if (snapshot.operations.lowStock.length > 0) {
    riskLines.push(
      `- ${snapshot.operations.lowStock.length} stock items are at or below minimum, which can interrupt daily office work.`,
    );
  }

  if (snapshot.communications.failedWhatsAppCount > 0) {
    riskLines.push(
      `- ${snapshot.communications.failedWhatsAppCount} WhatsApp notifications failed recently, so escalation may not be reaching people.`,
    );
  }

  if (riskLines.length === 0) {
    riskLines.push("- No major penalty or outage signals are standing out from the current snapshot.");
  }

  const actionLines = [
    snapshot.compliance.urgentItems[0]
      ? `- Start with ${snapshot.compliance.urgentItems[0].title} because it is the nearest operational exposure.`
      : "- Keep the urgent queue reviewed twice a day so risks do not age unseen.",
    snapshot.operations.dueSubscriptions[0]
      ? `- Confirm the owner and funding for ${snapshot.operations.dueSubscriptions[0].name} today.`
      : "- Use the ICT subscription tracker weekly to catch silent renewal risk.",
    snapshot.communications.recentFailures[0]
      ? `- Fix failed WhatsApp delivery first: ${formatFailureLine(snapshot.communications.recentFailures[0])}`
      : "- Keep manager digests running so overdue items do not hide in the dashboard.",
  ];

  return [
    formatSection("Main risks", riskLines),
    formatSection("Do next", actionLines),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildInventoryReply(snapshot: AssistantContextSnapshot) {
  const stockLines =
    snapshot.operations.lowStock.length > 0
      ? snapshot.operations.lowStock
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${formatStockLine(item)}`)
      : ["1. No low-stock items are flagged right now."];

  return [
    formatSection("Inventory pressure", [
      `- ${snapshot.operations.lowStock.length} items are at or below minimum stock in the live data.`,
    ]),
    formatSection("Items to act on", stockLines),
    formatSection("Best next move", [
      "- Replenish the items that stop daily work first: cleaning, water, beverages, toiletries, and any shared office consumables.",
      "- If the same items keep hitting minimum, raise the reorder threshold instead of firefighting stockouts.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSubscriptionReply(snapshot: AssistantContextSnapshot) {
  const lines =
    snapshot.operations.dueSubscriptions.length > 0
      ? snapshot.operations.dueSubscriptions
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${formatSubscriptionLine(item)}`)
      : ["1. No software or connectivity renewals are due in the next 30 days."];

  return [
    formatSection("Renewal pressure", [
      `- ${snapshot.operations.dueSubscriptions.length} subscriptions are due soon in the live snapshot.`,
    ]),
    formatSection("Due soon", lines),
    formatSection("Best next move", [
      "- Confirm owner, budget, and payment path now so critical services do not expire silently.",
      "- Put AWS, Microsoft 365, domain hosting, internet, and Starlink renewals under named owners if they are still shared informally.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildBudgetReply(snapshot: AssistantContextSnapshot) {
  const topCategories =
    snapshot.finance.topCategories.length > 0
      ? snapshot.finance.topCategories.map(
          (item, index) => `${index + 1}. ${item.category}: ${formatCurrency(item.total)}`,
        )
      : ["1. No operational expenses were captured for this month."];

  return [
    formatSection("Spend snapshot", [
      `- Tracked operational spend for ${snapshot.finance.monthLabel} is ${formatCurrency(snapshot.finance.totalSpend)}.`,
      `- ${snapshot.training.budgetRiskCount} scheduled trainings are above the standard budget threshold.`,
    ]),
    formatSection("Top categories", topCategories),
    formatSection("Best next move", [
      "- Review the top one or two categories for avoidable repeat spending before adding new controls.",
      "- Where maintenance or subscriptions are recurring, move them into named renewal plans instead of ad hoc payments.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildTrainingReply(snapshot: AssistantContextSnapshot) {
  const trainingLines =
    snapshot.training.upcoming.length > 0
      ? snapshot.training.upcoming
          .slice(0, 4)
          .map((item, index) => `${index + 1}. ${formatTrainingLine(item)}`)
      : ["1. No training is scheduled in the next 60 days."];

  return [
    formatSection("Training pipeline", [
      `- ${snapshot.training.upcoming.length} training items are scheduled in the next 60 days.`,
      `- ${snapshot.training.budgetRiskCount} are above the default budget threshold.`,
    ]),
    formatSection("Upcoming", trainingLines),
    formatSection("Best next move", [
      "- Make sure each session has an owner, attendees, budget clarity, and evidence upload ready before the date arrives.",
      "- If compliance-linked training is thin between April and June, schedule it now instead of letting CPD become a year-end rush.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDecisionQueueReply(snapshot: AssistantContextSnapshot) {
  const queueLines =
    snapshot.compliance.managerQueue.length > 0
      ? snapshot.compliance.managerQueue
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${formatManagerQueueLine(item)}`)
      : ["1. No manager decision queue items are active right now."];

  const nextAction =
    snapshot.compliance.managerQueue[0]
      ? `- Clear ${snapshot.compliance.managerQueue[0].title} first because it is the highest-pressure manager dependency right now.`
      : "- Keep the manager inbox reviewed twice daily so approvals do not age into blockers.";

  return [
    formatSection("Waiting on managers", [
      `- ${snapshot.compliance.waitingOnManagerCount} items are currently waiting on manager action or sign-off.`,
    ]),
    formatSection("Decision queue", queueLines),
    formatSection("Best next move", [
      nextAction,
      "- Resolve payment releases, sign-offs, and document decisions the same day whenever possible.",
      "- If a manager cannot act immediately, the assignee should still receive a clear response so the task does not go silent.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildMeetingBriefReply(snapshot: AssistantContextSnapshot) {
  const topPriority =
    snapshot.compliance.urgentItems[0]?.title || "No urgent task is currently leading the queue";
  const topBlocker =
    snapshot.compliance.blockedItems[0]?.title || "No blocked task is currently active";
  const topDecision =
    snapshot.compliance.managerQueue[0]?.title || "No manager decision is currently leading the queue";

  return [
    formatSection("90-second brief", [
      `- ${snapshot.compliance.openCount} open tasks are live, ${snapshot.compliance.blockedCount} are blocked, and ${snapshot.compliance.waitingOnManagerCount} are waiting on manager action.`,
      `- Top operating priority: ${topPriority}.`,
      `- Top blocker: ${topBlocker}.`,
      `- Top manager dependency: ${topDecision}.`,
    ]),
    formatSection("Decisions needed today", [
      snapshot.compliance.managerQueue[0]
        ? `- ${formatManagerQueueLine(snapshot.compliance.managerQueue[0])}`
        : "- No immediate manager decisions are standing out from live data.",
      snapshot.operations.dueSubscriptions[0]
        ? `- Confirm funding and ownership for ${snapshot.operations.dueSubscriptions[0].name}.`
        : "- Confirm no critical subscription payment is at risk of slipping.",
      snapshot.communications.recentFailures[0]
        ? `- Fix notification delivery reliability: ${formatFailureLine(snapshot.communications.recentFailures[0])}`
        : "- Keep reminder delivery healthy so action requests are actually seen.",
    ]),
    formatSection("What to say to the team", [
      `- Today's focus is ${topPriority}.`,
      "- Escalate blockers early, attach proof before submission, and clear manager-owned decisions the same day.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildWorkloadReply(snapshot: AssistantContextSnapshot) {
  const workloadLines =
    snapshot.people.workload.length > 0
      ? snapshot.people.workload
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${formatWorkloadLine(item)}`)
      : ["1. No workload concentration data is standing out right now."];

  const heaviest = snapshot.people.workload[0];

  return [
    formatSection("Workload concentration", [
      heaviest
        ? `- ${heaviest.owner} currently has the heaviest visible load in the system.`
        : "- No obvious workload concentration is visible from current data.",
      `- ${snapshot.people.activeStaffCount} active staff are currently in the live directory.`,
    ]),
    formatSection("Who may need help first", workloadLines),
    formatSection("Best next move", [
      heaviest
        ? `- Review whether ${heaviest.owner} is carrying work that can be reassigned or split today.`
        : "- Review owner balance weekly so hidden overload does not build up.",
      "- Where one person owns both the urgent task and the blocker resolution, split the unblock step if possible.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildImprovementReply(snapshot: AssistantContextSnapshot) {
  const lines = [
    snapshot.compliance.blockedCount > 0
      ? `- Your biggest friction is blocked work. ${snapshot.compliance.blockedCount} tasks are stuck, so the system should keep forcing visibility early.`
      : "- Keep the blocker workflow prominent so hidden delays do not return.",
    snapshot.compliance.waitingOnManagerCount > 0
      ? `- ${snapshot.compliance.waitingOnManagerCount} items are waiting on managers, so same-day decision discipline matters more than more reminders.`
      : "- Use the manager inbox daily even when counts are low so the habit sticks before the next spike.",
    snapshot.communications.failedWhatsAppCount > 0
      ? `- Fix failed WhatsApp delivery because broken escalation undermines trust in the whole workflow.`
      : "- Keep using WhatsApp for last-mile action, because in this context it drives follow-through better than passive dashboard alerts.",
    snapshot.people.workload[0]
      ? `- ${snapshot.people.workload[0].owner} currently carries the heaviest visible load, which may signal concentration risk or a delegation gap.`
      : "- Keep tracking workload concentration so key work does not pile up on one person silently.",
  ];

  return [
    formatSection("What is slowing the organisation down", lines),
    formatSection("High-value improvements", [
      "- Make every critical task either submitted, blocked, or approved. Avoid the vague middle.",
      "- Use the assistant for daily prioritisation, message drafting, and risk scans so staff waste less time on status-chasing.",
      "- Review the manager inbox twice daily and the blocker queue once daily.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildKenyaReferenceReply(query: string) {
  const normalized = normalizeQuery(query);

  if (normalized.includes("vat")) {
    return [
      "Kenya VAT in your current product logic is tracked for the 20th of each month.",
      "Best practice in this system: prepare figures early, file in iTax, and attach the KRA filing receipt before closing the task.",
    ].join("\n\n");
  }

  if (normalized.includes("paye") || normalized.includes("nssf") || normalized.includes("sha") || normalized.includes("nhif")) {
    return [
      "PAYE, NSSF and SHA are currently tracked in this system for the 9th of each month.",
      "Best practice in this workflow: reconcile payroll deductions, prepare the return or remittance, and attach the payment slip or receipt before submission.",
    ].join("\n\n");
  }

  if (normalized.includes("corporation tax") || normalized.includes("income tax")) {
    return [
      "The current annual tax logic tracks a corporation tax balance review on April 30 and return filing on June 30, assuming a January to December year.",
      "If the company has a different accounting year, that assumption should be adjusted in the pack logic.",
    ].join("\n\n");
  }

  if (normalized.includes("permit") || normalized.includes("workplace")) {
    return [
      "The current statutory pack tracks business permit and workplace renewal for February 10.",
      "That date should still be checked against county and sector-specific rules, because permit timing can vary.",
    ].join("\n\n");
  }

  if (normalized.includes("cr12") || normalized.includes("sheria")) {
    return [
      "The current pack tracks Sheria House annual return for March 31 and CR12 reviews for June 30 and December 31.",
      "Use those as operating checkpoints, but confirm registrar expectations if the organisation has special filing needs.",
    ].join("\n\n");
  }

  return "";
}

function buildDraftReply(query: string, snapshot: AssistantContextSnapshot) {
  const normalized = normalizeQuery(query);
  const focusItem =
    snapshot.compliance.blockedItems[0] ||
    snapshot.compliance.urgentItems[0] ||
    null;

  if (normalized.includes("manager") || normalized.includes("director") || normalized.includes("leadership")) {
    const priorityLine = focusItem
      ? `Top priority is ${focusItem.title}, currently ${focusItem.status.toLowerCase()}.`
      : "No single urgent item is dominating the current view.";
    const blockerLine =
      snapshot.compliance.blockedItems[0]
        ? `Main blocker is ${snapshot.compliance.blockedItems[0].title}.`
        : "No active blocker is currently leading the queue.";

    const message = `Morning update: ${snapshot.compliance.openCount} tasks are open, ${snapshot.compliance.blockedCount} are blocked, and ${snapshot.compliance.waitingOnManagerCount} are waiting on manager action. ${priorityLine} ${blockerLine} The team should clear the top dependency and close proof-backed submissions today.`;

    return [
      formatSection("Suggested draft", [message]),
      formatSection("Why this draft works", [
        "- It gives leadership a real operating picture, not just a vague status line.",
        "- It names the top pressure point and pushes for action the same day.",
      ]),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const greeting = normalized.includes("vendor") ? "Hello" : "Hi team";
  const message =
    focusItem
      ? `${greeting}, quick update on ${focusItem.title}: it is currently ${focusItem.status.toLowerCase()} and needs attention today. Please close the outstanding step, upload proof, and update the task board immediately so we can keep work moving.`
      : `${greeting}, quick status check: please update any overdue, blocked, or submitted work in the task board today so the team has one accurate view of what needs action.`;

  return [
    formatSection("Suggested draft", [message]),
    formatSection("Why this draft works", [
      "- It names the work clearly.",
      "- It asks for one concrete action instead of a vague update.",
      "- It pushes people back into the system of record, not side chats.",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDefaultReply(snapshot: AssistantContextSnapshot) {
  return [
    formatSection("Operational picture", [
      `- ${snapshot.compliance.openCount} open tasks are in scope, ${snapshot.compliance.blockedCount} are blocked, and ${snapshot.compliance.waitingOnManagerCount} are waiting on manager action.`,
      `- ${snapshot.operations.lowStock.length} stock items, ${snapshot.operations.dueSubscriptions.length} subscriptions, and ${snapshot.operations.dueMaintenance.length} maintenance items are showing operational pressure.`,
    ]),
    formatSection("Best next moves", [
      snapshot.compliance.urgentItems[0]
        ? `1. Handle ${snapshot.compliance.urgentItems[0].title} first.`
        : "1. Review the earliest due work first.",
      snapshot.compliance.managerQueue[0]
        ? `2. Clear ${snapshot.compliance.managerQueue[0].queueLabel.toLowerCase()} on ${snapshot.compliance.managerQueue[0].title}.`
        : "2. Clear any submitted or manager-owned blockers quickly.",
      snapshot.communications.recentFailures[0]
        ? `3. Fix notification reliability: ${formatFailureLine(snapshot.communications.recentFailures[0])}`
        : "3. Keep reminder and digest delivery healthy so people act on time.",
    ]),
    formatSection("You can ask me things like", [
      "- What needs attention today?",
      "- Do we already have the latest KRA receipt?",
      "- Which blockers need manager help?",
      "- What could trigger fines or outages this week?",
      "- Draft a reminder to the accountant or operations manager.",
      "- Where are we losing time right now?",
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function generateAssistantFallbackReply(
  query: string,
  snapshot: AssistantContextSnapshot,
) {
  const normalized = normalizeQuery(query);
  const kenyaReply = buildKenyaReferenceReply(query);

  if (kenyaReply) {
    return kenyaReply;
  }

  if (
    normalized.includes("meeting") ||
    normalized.includes("standup") ||
    normalized.includes("briefing") ||
    normalized.includes("summary")
  ) {
    return buildMeetingBriefReply(snapshot);
  }

  if (
    normalized.includes("decision") ||
    normalized.includes("approve") ||
    normalized.includes("approval") ||
    normalized.includes("waiting on me")
  ) {
    return buildDecisionQueueReply(snapshot);
  }

  if (
    normalized.includes("workload") ||
    normalized.includes("capacity") ||
    normalized.includes("overload") ||
    normalized.includes("delegat") ||
    (normalized.includes("who") &&
      (normalized.includes("help") || normalized.includes("owner")))
  ) {
    return buildWorkloadReply(snapshot);
  }

  if (
    normalized.includes("today") ||
    normalized.includes("priority") ||
    normalized.includes("attention") ||
    normalized.includes("first")
  ) {
    return buildPriorityReply(snapshot);
  }

  if (
    normalized.includes("block") ||
    normalized.includes("stuck") ||
    normalized.includes("waiting")
  ) {
    return buildBlockerReply(snapshot);
  }

  if (
    normalized.includes("risk") ||
    normalized.includes("fine") ||
    normalized.includes("penalt") ||
    normalized.includes("outage")
  ) {
    return buildRiskReply(snapshot);
  }

  if (
    normalized.includes("stock") ||
    normalized.includes("inventory") ||
    normalized.includes("supply")
  ) {
    return buildInventoryReply(snapshot);
  }

  if (
    normalized.includes("subscription") ||
    normalized.includes("renew") ||
    normalized.includes("billing") ||
    normalized.includes("domain") ||
    normalized.includes("microsoft 365") ||
    normalized.includes("aws") ||
    normalized.includes("starlink")
  ) {
    return buildSubscriptionReply(snapshot);
  }

  if (
    normalized.includes("budget") ||
    normalized.includes("expense") ||
    normalized.includes("spend")
  ) {
    return buildBudgetReply(snapshot);
  }

  if (
    normalized.includes("training") ||
    normalized.includes("cpd")
  ) {
    return buildTrainingReply(snapshot);
  }

  if (
    normalized.includes("improve") ||
    normalized.includes("problem") ||
    normalized.includes("bottleneck") ||
    normalized.includes("satisfaction") ||
    normalized.includes("workflow")
  ) {
    return buildImprovementReply(snapshot);
  }

  if (
    normalized.includes("draft") ||
    normalized.includes("message") ||
    normalized.includes("email") ||
    normalized.includes("whatsapp")
  ) {
    return buildDraftReply(query, snapshot);
  }

  return buildDefaultReply(snapshot);
}

export function buildAssistantSuggestions(
  snapshot: AssistantContextSnapshot,
  query?: string,
) {
  const suggestions = new Set<string>();
  const normalized = query ? normalizeQuery(query) : "";

  if (!normalized || normalized.includes("today") || normalized.includes("priority")) {
    suggestions.add("What needs attention today?");
    suggestions.add("Which blockers need manager help?");
  }

  if (!normalized || normalized.includes("brief") || normalized.includes("summary")) {
    suggestions.add("Give me a 90-second manager briefing.");
  }

  if (!normalized || normalized.includes("risk") || normalized.includes("outage")) {
    suggestions.add("What could trigger fines or outages this week?");
  }

  if (
    !normalized ||
    normalized.includes("document") ||
    normalized.includes("receipt") ||
    normalized.includes("proof") ||
    normalized.includes("certificate")
  ) {
    suggestions.add("Do we already have the latest KRA receipt?");
  }

  if (!normalized || normalized.includes("draft") || normalized.includes("message")) {
    suggestions.add("Draft a concise reminder to the assignee with the oldest blocker.");
  }

  if (snapshot.operations.lowStock.length > 0) {
    suggestions.add("Which office or stock items are at risk of running out?");
  }

  if (snapshot.operations.dueSubscriptions.length > 0) {
    suggestions.add("Which ICT subscriptions or renewals should be paid first?");
  }

  if (snapshot.compliance.managerQueue.length > 0) {
    suggestions.add("What should managers clear first from the waiting-on-me queue?");
    suggestions.add("What decisions are waiting on managers right now?");
  }

  if (snapshot.people.workload.length > 0) {
    suggestions.add("Where are we losing time right now?");
    suggestions.add("Who needs help first today?");
  }

  return Array.from(suggestions).slice(0, 5);
}

export function buildAssistantSystemPrompt(
  snapshot: AssistantContextSnapshot,
) {
  return [
    "You are BHL Copilot, a grounded operations assistant for Kenyan organisations.",
    "Your job is to reduce missed deadlines, blocked work, outages, wasted time, and status-chasing.",
    "You must answer using the live workspace snapshot provided below, not generic business advice.",
    "Be decisive, practical, and specific. Start with what matters now.",
    "When the user asks for a brief or summary, produce something a manager could read out in under two minutes.",
    "When helpful, include a short draft WhatsApp or email message.",
    "If you are making an inference, say so clearly.",
    "Keep answers concise but satisfying. Use short section headers when useful.",
    "Do not invent records, users, approvals, receipts, or deadlines that are not supported by the snapshot or Kenya reference.",
    "",
    "Live workspace snapshot:",
    buildAssistantContextText(snapshot),
  ].join("\n");
}

export function buildAssistantUserPrompt(input: {
  query: string;
  history: AssistantChatHistoryMessage[];
}) {
  const historyText =
    input.history.length > 0
      ? input.history
          .slice(-6)
          .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.text}`)
          .join("\n")
      : "No prior conversation.";

  return [
    "Recent conversation:",
    historyText,
    "",
    `Current user request: ${input.query}`,
    "",
    "Answer directly and helpfully.",
  ].join("\n");
}

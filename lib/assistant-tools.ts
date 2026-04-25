import { WorkDecisionKind } from "@prisma/client";
import { canApproveRole, hasActiveBlocker, isClosedStatus } from "@/lib/compliance-workflow";
import {
  buildAssistantGroundingLabel,
  type AssistantContextSnapshot,
  type AssistantUserContext,
} from "@/lib/assistant-engine";
import {
  searchAssistantDocuments,
  verifyWorkItemDocumentById,
} from "@/lib/assistant-documents";
import { listDecisionOps } from "@/lib/decision-ops";
import { prisma } from "@/lib/prisma";
import { listAllHydratedWorkItems, listHydratedWorkItems } from "@/lib/work-items";

export type AssistantToolName =
  | "verify_proof"
  | "draft_escalation"
  | "prepare_approval_decision"
  | "build_audit_pack"
  | "summarize_risk";

export interface AssistantToolResult {
  toolName: AssistantToolName;
  intent: string;
  reply: string;
  grounding: string;
  suggestions: string[];
  usedDocumentSearch: boolean;
}

type ScopedWorkItem = Awaited<ReturnType<typeof listHydratedWorkItems>>[number];
type ScopedDecision = Awaited<ReturnType<typeof listDecisionOps>>[number];

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "latest",
  "proof",
  "task",
  "work",
  "item",
  "against",
  "what",
  "which",
  "show",
  "give",
  "latest",
  "audit",
  "pack",
  "binder",
  "q1",
  "q2",
  "q3",
  "q4",
  "need",
  "does",
  "have",
  "into",
  "about",
]);

function normalizeQuery(query: string) {
  return query.toLowerCase().trim();
}

function formatDate(value?: Date | string | null) {
  if (!value) {
    return "No date";
  }

  return new Date(value).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDaysUntil(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const today = new Date();
  const target = new Date(value);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function formatDecisionKind(kind: WorkDecisionKind) {
  switch (kind) {
    case WorkDecisionKind.APPROVAL_DECISION:
      return "approval decision";
    case WorkDecisionKind.DOCUMENT_DECISION:
      return "document decision";
    case WorkDecisionKind.PAYMENT_APPROVAL:
      return "payment approval";
    case WorkDecisionKind.ESCALATION_REVIEW:
      return "escalation review";
    default:
      return "decision";
  }
}

function tokenizeQuery(query: string) {
  return normalizeQuery(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

async function listScopedWorkItems(currentUser: AssistantUserContext | null) {
  if (currentUser?.organizationId) {
    return listHydratedWorkItems({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug || undefined,
      userId: currentUser.id,
      canManage: canApproveRole(currentUser.role),
    });
  }

  return listAllHydratedWorkItems();
}

function getRelevantText(item: ScopedWorkItem) {
  return [
    item.title,
    item.category,
    item.workflow.requiredDocumentLabel,
    item.workflow.blocker?.label,
    item.workflow.blocker?.reason,
    item.workflow.blocker?.waitingOn,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function selectRelevantWorkItem(
  query: string,
  currentUser: AssistantUserContext | null,
  options?: {
    requireEvidence?: boolean;
    preferSubmitted?: boolean;
    preferBlocked?: boolean;
  },
): Promise<ScopedWorkItem | null> {
  const items = await listScopedWorkItems(currentUser);

  if (items.length === 0) {
    return null;
  }

  const normalized = normalizeQuery(query);
  const explicitIdMatch = normalized.match(/(?:task|work item|item)\s+#?(\d+)/i) || normalized.match(/#(\d+)/);
  if (explicitIdMatch) {
    const explicitId = Number(explicitIdMatch[1]);
    const exact = items.find((item) => item.id === explicitId);
    if (exact) {
      return exact;
    }
  }

  const tokens = tokenizeQuery(query);
  const ranked = items
    .map((item) => {
      let score = 0;
      const haystack = getRelevantText(item);
      const hasEvidence = Boolean(item.currentEvidence?.documentVersionId);

      if (options?.requireEvidence) {
        score += hasEvidence ? 12 : -6;
      }

      if (options?.preferSubmitted && item.status === "Submitted") {
        score += 8;
      }

      if (options?.preferBlocked && hasActiveBlocker(item.workflow)) {
        score += 8;
      }

      if (!isClosedStatus(item.status)) {
        score += 1;
      }

      for (const token of tokens) {
        if (haystack.includes(token)) {
          score += 4;
        }
      }

      if (normalized.includes("latest") || normalized.includes("recent")) {
        score += hasEvidence ? 4 : 0;
      }

      if (normalized.includes("receipt") || normalized.includes("proof")) {
        score += hasEvidence ? 4 : 0;
      }

      return { item, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightUploadedAt = right.item.currentEvidence?.uploadedAt
        ? new Date(right.item.currentEvidence.uploadedAt).getTime()
        : 0;
      const leftUploadedAt = left.item.currentEvidence?.uploadedAt
        ? new Date(left.item.currentEvidence.uploadedAt).getTime()
        : 0;

      if (rightUploadedAt !== leftUploadedAt) {
        return rightUploadedAt - leftUploadedAt;
      }

      return right.item.updatedAt.getTime() - left.item.updatedAt.getTime();
    });

  if (ranked[0]?.score > 0) {
    return ranked[0].item;
  }

  if (options?.requireEvidence) {
    return (
      items
        .filter((item) => item.currentEvidence?.documentVersionId)
        .sort((left, right) => {
          const rightUploadedAt = right.currentEvidence?.uploadedAt
            ? new Date(right.currentEvidence.uploadedAt).getTime()
            : 0;
          const leftUploadedAt = left.currentEvidence?.uploadedAt
            ? new Date(left.currentEvidence.uploadedAt).getTime()
            : 0;
          return rightUploadedAt - leftUploadedAt;
        })[0] || null
    );
  }

  return ranked[0]?.item ?? null;
}

function buildToolGrounding(snapshot: AssistantContextSnapshot, label: string) {
  return `${buildAssistantGroundingLabel(snapshot)} | ${label}`;
}

function getDecisionKindsForQuery(query: string) {
  const normalized = normalizeQuery(query);

  if (normalized.includes("payment")) {
    return [WorkDecisionKind.PAYMENT_APPROVAL];
  }

  if (normalized.includes("document") || normalized.includes("proof")) {
    return [WorkDecisionKind.DOCUMENT_DECISION];
  }

  if (normalized.includes("escalat") || normalized.includes("blocker")) {
    return [WorkDecisionKind.ESCALATION_REVIEW];
  }

  return [
    WorkDecisionKind.APPROVAL_DECISION,
    WorkDecisionKind.DOCUMENT_DECISION,
    WorkDecisionKind.PAYMENT_APPROVAL,
    WorkDecisionKind.ESCALATION_REVIEW,
  ];
}

async function listScopedDecisions(currentUser: AssistantUserContext | null) {
  if (!currentUser?.organizationId) {
    return [] as ScopedDecision[];
  }

  return listDecisionOps({
    organizationId: currentUser.organizationId,
    organizationSlug: currentUser.organizationSlug || undefined,
  });
}

function chooseDecision(query: string, decisions: ScopedDecision[]) {
  const kinds = getDecisionKindsForQuery(query);
  const ordered = decisions
    .filter((decision) => kinds.includes(decision.kind))
    .sort((left, right) => {
      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime();
    });

  return ordered[0] || decisions[0] || null;
}

async function runVerifyProofTool(input: {
  query: string;
  snapshot: AssistantContextSnapshot;
  currentUser: AssistantUserContext | null;
}): Promise<AssistantToolResult> {
  const item = await selectRelevantWorkItem(input.query, input.currentUser, {
    requireEvidence: false,
    preferSubmitted: true,
  });

  if (item?.currentEvidence?.documentVersionId) {
    const verification = await verifyWorkItemDocumentById({
      workItemId: item.id,
    });

    if (verification) {
      const mismatches = verification.candidate.verification?.mismatches || [];
      const suggestions =
        mismatches.length > 0
          ? [
              "Draft an escalation for the assignee to correct this proof.",
              "Prepare the approval decision for this task.",
              "Build an audit pack for this period.",
            ]
          : [
              "Prepare the approval decision for this task.",
              "Build an audit pack for this period.",
              "What risks are still open this week?",
            ];

      return {
        toolName: "verify_proof",
        intent: "Verify uploaded proof against its work item.",
        reply: verification.reply,
        grounding: buildToolGrounding(input.snapshot, verification.groundingLabel),
        suggestions,
        usedDocumentSearch: true,
      };
    }
  }

  if (item) {
    return {
      toolName: "verify_proof",
      intent: "Verify uploaded proof against its work item.",
      reply: [
        "Verification target",
        `- ${item.title} is assigned to ${item.user.name || item.user.email} and is due ${formatDate(item.deadline)}.`,
        "",
        "What I found",
        `- No registry-backed proof is currently attached to this work item.`,
        `- The required document is ${item.workflow.requiredDocumentLabel}.`,
        "",
        "Best next action",
        "- Upload the proof first, then ask me to verify it against the task.",
      ].join("\n"),
      grounding: buildToolGrounding(input.snapshot, "Tool verify_proof | no linked proof"),
      suggestions: [
        "Draft an escalation asking for the missing proof.",
        "What decisions are waiting on managers right now?",
      ],
      usedDocumentSearch: false,
    };
  }

  const documentSearch = await searchAssistantDocuments({
    query: input.query,
    currentUser: input.currentUser,
  });

  return {
    toolName: "verify_proof",
    intent: "Verify uploaded proof against its work item.",
    reply: documentSearch.fallbackReply,
    grounding: buildToolGrounding(input.snapshot, documentSearch.groundingLabel),
    suggestions: documentSearch.suggestions,
    usedDocumentSearch: true,
  };
}

async function runDraftEscalationTool(input: {
  query: string;
  snapshot: AssistantContextSnapshot;
  currentUser: AssistantUserContext | null;
}): Promise<AssistantToolResult> {
  const decisions = await listScopedDecisions(input.currentUser);
  const targetDecision = chooseDecision(input.query, decisions);
  const targetItem =
    targetDecision?.workItem ||
    (await selectRelevantWorkItem(input.query, input.currentUser, { preferBlocked: true }));

  if (!targetItem) {
    return {
      toolName: "draft_escalation",
      intent: "Draft a short escalation for a blocked task or pending decision.",
      reply:
        "I do not have a blocked work item or open manager decision to draft from right now. Once a blocker or decision is on record, I can draft the exact escalation message.",
      grounding: buildToolGrounding(input.snapshot, "Tool draft_escalation | no target"),
      suggestions: [
        "Which blockers need manager help?",
        "What decisions are waiting on managers right now?",
      ],
      usedDocumentSearch: false,
    };
  }

  const owner = targetItem.user.name || targetItem.user.email;
  const dueLabel = formatDate(targetItem.deadline);
  const blockerReason = targetItem.workflow.blocker?.reason || targetDecision?.summary || "decision needed";
  const dueGap = getDaysUntil(targetItem.deadline);
  const urgencyLine =
    dueGap === null
      ? "This needs same-day attention."
      : dueGap < 0
        ? `This is already ${Math.abs(dueGap)} day${Math.abs(dueGap) === 1 ? "" : "s"} overdue.`
        : dueGap === 0
          ? "This is due today."
          : `This is due in ${dueGap} day${dueGap === 1 ? "" : "s"}.`;
  const managerDraft = `Please review ${targetItem.title} for ${owner}. ${blockerReason}. The task is due ${dueLabel}. ${urgencyLine} Open it here: /tasks#task-${targetItem.id}`;
  const assigneeDraft = `Quick follow-up on ${targetItem.title}: the blocker is now escalated for manager action. Keep any supporting proof ready and update the task as soon as the dependency clears.`;

  return {
    toolName: "draft_escalation",
    intent: "Draft a short escalation for a blocked task or pending decision.",
    reply: [
      "Escalation target",
      `- ${targetItem.title} for ${owner}.`,
      `- Reason: ${blockerReason}.`,
      `- Due: ${dueLabel}. ${urgencyLine}`,
      "",
      "WhatsApp draft to manager",
      managerDraft,
      "",
      "Reply to assignee",
      assigneeDraft,
      "",
      "Why this works",
      "- It names the task, the owner, the exact dependency, and the deadline in one short message.",
    ].join("\n"),
    grounding: buildToolGrounding(
      input.snapshot,
      `Tool draft_escalation | ${targetDecision ? formatDecisionKind(targetDecision.kind) : "blocked task"}`,
    ),
    suggestions: [
      "Prepare the approval decision for this task.",
      "What risks are still open this week?",
    ],
    usedDocumentSearch: false,
  };
}

async function runPrepareApprovalDecisionTool(input: {
  query: string;
  snapshot: AssistantContextSnapshot;
  currentUser: AssistantUserContext | null;
}): Promise<AssistantToolResult> {
  const decisions = await listScopedDecisions(input.currentUser);
  const decision = chooseDecision(input.query, decisions);

  if (!decision || !decision.workItem) {
    return {
      toolName: "prepare_approval_decision",
      intent: "Prepare the next approval, document, or payment decision.",
      reply:
        "There is no open decision in scope right now. When a submission, blocker, or payment request is waiting, I can prepare the recommendation and draft note.",
      grounding: buildToolGrounding(input.snapshot, "Tool prepare_approval_decision | no open decision"),
      suggestions: [
        "What needs attention today?",
        "Which blockers need manager help?",
      ],
      usedDocumentSearch: false,
    };
  }

  const item = decision.workItem;
  const verification =
    decision.kind === WorkDecisionKind.PAYMENT_APPROVAL || !item.currentEvidence?.documentVersionId
      ? null
      : await verifyWorkItemDocumentById({ workItemId: item.id });
  const verificationStatus = verification?.candidate.verification?.status;
  const allChecklistDone = item.workflow.checklist.every((step) => step.done);
  let recommendation = "Review manually";
  let rationale = "This decision needs a manager review.";
  let managerNote = `Please review ${item.title} and update the task once the decision is made.`;

  if (decision.kind === WorkDecisionKind.PAYMENT_APPROVAL) {
    recommendation = "Release payment if the stated blocker reason is valid and funding is confirmed";
    rationale =
      item.workflow.blocker?.reason ||
      "A payment-related blocker is active and work cannot continue until funds are released.";
    managerNote = `Payment request reviewed for ${item.title}. Release the required payment or give a clear hold reason today.`;
  } else if (!item.currentEvidence?.documentVersionId) {
    recommendation = "Hold and request the required proof";
    rationale = "The work item has no linked registry proof yet.";
    managerNote = `I cannot approve ${item.title} yet because the required ${item.workflow.requiredDocumentLabel.toLowerCase()} is missing. Please upload it and resubmit.`;
  } else if (!allChecklistDone) {
    recommendation = "Hold until the checklist is complete";
    rationale = "Checklist completion is still incomplete, so approval would be premature.";
    managerNote = `Please complete every checklist step on ${item.title} before I approve it.`;
  } else if (verificationStatus === "MATCHED") {
    recommendation =
      decision.kind === WorkDecisionKind.DOCUMENT_DECISION
        ? "Accept the uploaded proof"
        : "Approve";
    rationale = "The linked proof matches the task expectations and no verification mismatch is standing out.";
    managerNote =
      decision.kind === WorkDecisionKind.DOCUMENT_DECISION
        ? `The uploaded proof for ${item.title} looks acceptable. Continue the workflow.`
        : `Approved. The proof on ${item.title} looks consistent with the task requirements.`;
  } else if (verificationStatus === "CHECK_NEEDED") {
    recommendation = "Hold for clarification";
    rationale =
      "The proof is present, but the automated check found warnings that should be clarified before approval.";
    managerNote = `I reviewed ${item.title}. The proof needs clarification before approval, so please correct the flagged fields and resubmit.`;
  } else if (verificationStatus === "MISMATCH") {
    recommendation = "Reject and return to assignee";
    rationale =
      "The proof appears inconsistent with the task, so approval would weaken the audit trail.";
    managerNote = `I cannot approve ${item.title} yet because the proof does not match the task requirements. Please correct the proof and resubmit.`;
  }

  return {
    toolName: "prepare_approval_decision",
    intent: "Prepare the next approval, document, or payment decision.",
    reply: [
      "Decision in focus",
      `- ${decision.title}`,
      `- Kind: ${formatDecisionKind(decision.kind)}.`,
      `- Work item: ${item.title} for ${item.user.name || item.user.email}.`,
      decision.dueAt ? `- Due by: ${formatDate(decision.dueAt)}.` : "- Due by: No SLA date recorded.",
      "",
      "Recommended action",
      `- ${recommendation}.`,
      "",
      "Why",
      `- ${rationale}`,
      verification?.candidate.verification
        ? `- Verification status: ${verification.candidate.verification.status}.`
        : "",
      "",
      "Suggested manager note",
      managerNote,
    ]
      .filter(Boolean)
      .join("\n"),
    grounding: buildToolGrounding(
      input.snapshot,
      `Tool prepare_approval_decision | ${formatDecisionKind(decision.kind)}`,
    ),
    suggestions: [
      "Verify the latest proof against its task.",
      "Draft an escalation for the assignee to correct this proof.",
      "Build an audit pack for this period.",
    ],
    usedDocumentSearch: Boolean(verification),
  };
}

function resolveAuditWindow(query: string) {
  const normalized = normalizeQuery(query);
  const now = new Date();
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();

  if (normalized.includes("q1")) {
    return {
      label: `Q1 ${year}`,
      start: new Date(year, 0, 1),
      end: new Date(year, 2, 31, 23, 59, 59, 999),
    };
  }

  if (normalized.includes("q2")) {
    return {
      label: `Q2 ${year}`,
      start: new Date(year, 3, 1),
      end: new Date(year, 5, 30, 23, 59, 59, 999),
    };
  }

  if (normalized.includes("q3")) {
    return {
      label: `Q3 ${year}`,
      start: new Date(year, 6, 1),
      end: new Date(year, 8, 30, 23, 59, 59, 999),
    };
  }

  if (normalized.includes("q4")) {
    return {
      label: `Q4 ${year}`,
      start: new Date(year, 9, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  return {
    label: `YTD ${year}`,
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

async function runBuildAuditPackTool(input: {
  query: string;
  snapshot: AssistantContextSnapshot;
  currentUser: AssistantUserContext | null;
}): Promise<AssistantToolResult> {
  const items = await listScopedWorkItems(input.currentUser);
  const window = resolveAuditWindow(input.query);
  const tokens = tokenizeQuery(input.query);
  const filtered = items.filter((item) => {
    const inWindow = item.deadline >= window.start && item.deadline <= window.end;
    if (!inWindow) {
      return false;
    }

    if (tokens.length === 0) {
      return true;
    }

    const haystack = getRelevantText(item);
    return tokens.some((token) => haystack.includes(token));
  });

  const versionIds = filtered
    .map((item) => item.currentEvidence?.documentVersionId)
    .filter((value): value is number => typeof value === "number");
  const verifications = versionIds.length
    ? await prisma.documentVerification.findMany({
        where: {
          documentVersionId: {
            in: versionIds,
          },
          verificationSource: "SYSTEM",
        },
        orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
      })
    : [];
  const verificationMap = new Map<number, (typeof verifications)[number]>();
  for (const verification of verifications) {
    if (!verificationMap.has(verification.documentVersionId)) {
      verificationMap.set(verification.documentVersionId, verification);
    }
  }

  const covered = filtered.filter((item) => item.currentEvidence?.documentVersionId);
  const missingProof = filtered.filter((item) => !item.currentEvidence?.documentVersionId);
  const matched = covered.filter((item) => {
    const versionId = item.currentEvidence?.documentVersionId;
    return versionId ? verificationMap.get(versionId)?.status === "MATCHED" : false;
  });
  const weakProof = covered.filter((item) => {
    const versionId = item.currentEvidence?.documentVersionId;
    const status = versionId ? verificationMap.get(versionId)?.status : null;
    return status !== "MATCHED";
  });

  const includedLines = covered.slice(0, 6).map((item, index) => {
    const versionId = item.currentEvidence?.documentVersionId;
    const status = versionId ? verificationMap.get(versionId)?.status || "UNVERIFIED" : "MISSING";
    return `${index + 1}. ${item.title} - ${item.currentEvidence?.fileName || "proof on file"} (${status})`;
  });
  const gapLines = [
    ...missingProof.slice(0, 3).map((item) => `- Missing proof: ${item.title}`),
    ...weakProof.slice(0, 3).map((item) => {
      const versionId = item.currentEvidence?.documentVersionId;
      const summary = versionId ? verificationMap.get(versionId)?.summary : null;
      return `- Check proof: ${item.title}${summary ? ` - ${summary}` : ""}`;
    }),
  ];

  return {
    toolName: "build_audit_pack",
    intent: "Summarize regulator-ready proof coverage for an audit window.",
    reply: [
      "Audit pack readiness",
      `- Scope: ${window.label}.`,
      `- ${filtered.length} work items fall inside this window.`,
      `- ${matched.length} have matched proof on file, ${weakProof.length} need review, and ${missingProof.length} still lack proof.`,
      "",
      "Included evidence",
      ...(includedLines.length > 0 ? includedLines : ["- No registry-backed proof is on file in this window yet."]),
      "",
      "Gaps to close",
      ...(gapLines.length > 0 ? gapLines : ["- No major proof gaps are standing out in this window."]),
      "",
      "Best next action",
      "- Close missing and weak proof items before treating this as regulator-ready.",
    ].join("\n"),
    grounding: buildToolGrounding(input.snapshot, `Tool build_audit_pack | ${window.label}`),
    suggestions: [
      "Verify the latest proof against its task.",
      "Prepare the approval decision for this task.",
      "What risks are still open this week?",
    ],
    usedDocumentSearch: versionIds.length > 0,
  };
}

async function runSummarizeRiskTool(input: {
  query: string;
  snapshot: AssistantContextSnapshot;
  currentUser: AssistantUserContext | null;
}): Promise<AssistantToolResult> {
  const decisions = await listScopedDecisions(input.currentUser);
  const criticalDecisions = decisions.filter(
    (decision) => decision.priority === "CRITICAL" || decision.priority === "HIGH",
  );
  const breachedDecisions = decisions.filter(
    (decision) => decision.dueAt && new Date(decision.dueAt) < new Date(),
  );

  const riskLines = [
    `- ${input.snapshot.compliance.dueTodayOrOverdueCount} tasks are already due today or overdue.`,
    `- ${input.snapshot.compliance.blockedCount} tasks are blocked.`,
    `- ${criticalDecisions.length} open decisions are high priority and ${breachedDecisions.length} have already breached SLA.`,
  ];

  if (input.snapshot.operations.dueSubscriptions.length > 0) {
    riskLines.push(
      `- ${input.snapshot.operations.dueSubscriptions.length} subscriptions are due soon and could trigger outages if funding slips.`,
    );
  }

  if (input.snapshot.communications.failedWhatsAppCount > 0) {
    riskLines.push(
      `- ${input.snapshot.communications.failedWhatsAppCount} failed WhatsApp deliveries weaken follow-through on escalations.`,
    );
  }

  const topDecision = breachedDecisions[0] || criticalDecisions[0] || null;

  return {
    toolName: "summarize_risk",
    intent: "Summarize operational, compliance, and communication risk.",
    reply: [
      "Risk picture",
      ...riskLines,
      "",
      "Highest-pressure item",
      topDecision
        ? `- ${topDecision.title} is the sharpest decision risk in the queue.`
        : input.snapshot.compliance.urgentItems[0]
          ? `- ${input.snapshot.compliance.urgentItems[0].title} is the strongest visible operational risk.`
          : "- No single record is dominating the risk queue right now.",
      "",
      "Best next action",
      topDecision
        ? `- Clear ${topDecision.title.toLowerCase()} first so the queue stops aging silently.`
        : "- Clear the earliest due or blocked item first and keep the queue moving today.",
      "- Verify proof before approval so weak evidence does not become a future audit problem.",
      "- Fix failed notification delivery so escalations actually land.",
    ].join("\n"),
    grounding: buildToolGrounding(input.snapshot, "Tool summarize_risk"),
    suggestions: [
      "What needs attention today?",
      "Prepare the approval decision for this task.",
      "Build an audit pack for this period.",
    ],
    usedDocumentSearch: false,
  };
}

function detectAssistantToolName(query: string): AssistantToolName | null {
  const normalized = normalizeQuery(query);

  if (
    normalized.includes("verify") ||
    normalized.includes("receipt number") ||
    normalized.includes("filing date") ||
    normalized.includes("latest proof") ||
    normalized.includes("amount on")
  ) {
    return "verify_proof";
  }

  if (
    normalized.includes("draft") ||
    normalized.includes("escalat") ||
    (normalized.includes("message") && normalized.includes("blocker"))
  ) {
    return "draft_escalation";
  }

  if (
    normalized.includes("waiting on me") ||
    normalized.includes("approval") ||
    normalized.includes("approve") ||
    normalized.includes("decision")
  ) {
    return "prepare_approval_decision";
  }

  if (
    normalized.includes("audit pack") ||
    normalized.includes("audit binder") ||
    normalized.includes("regulator-ready") ||
    (normalized.includes("audit") && normalized.includes("proof"))
  ) {
    return "build_audit_pack";
  }

  if (
    normalized.includes("risk") ||
    normalized.includes("fine") ||
    normalized.includes("outage") ||
    normalized.includes("exposure")
  ) {
    return "summarize_risk";
  }

  return null;
}

export async function runAssistantTool(input: {
  query: string;
  snapshot: AssistantContextSnapshot;
  currentUser: AssistantUserContext | null;
}): Promise<AssistantToolResult | null> {
  const toolName = detectAssistantToolName(input.query);

  if (!toolName) {
    return null;
  }

  if (toolName === "verify_proof") {
    return runVerifyProofTool(input);
  }

  if (toolName === "draft_escalation") {
    return runDraftEscalationTool(input);
  }

  if (toolName === "prepare_approval_decision") {
    return runPrepareApprovalDecisionTool(input);
  }

  if (toolName === "build_audit_pack") {
    return runBuildAuditPackTool(input);
  }

  return runSummarizeRiskTool(input);
}

export type ComplianceWorkflowStatus =
  | "Pending"
  | "Submitted"
  | "Approved"
  | "Rejected"
  | "Completed";

export interface ComplianceChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ComplianceWorkflowActor {
  id?: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export type ComplianceManagerResponseKind = "SEEN" | "TAKING_OWNERSHIP";

export type ComplianceBlockerCode =
  | "MISSING_DOCUMENT"
  | "WAITING_APPROVAL"
  | "WAITING_PAYMENT"
  | "WAITING_TEAM_INPUT"
  | "KRA_PORTAL_ISSUE"
  | "INTERNET_OR_POWER"
  | "OTHER";

export interface ComplianceBlockerState {
  code: ComplianceBlockerCode;
  label: string;
  reason: string;
  waitingOn?: string;
  needsManagerHelp: boolean;
  blockedAt: string;
  blockedBy?: ComplianceWorkflowActor;
}

export interface ComplianceResolvedBlockerState extends ComplianceBlockerState {
  clearedAt: string;
  clearedBy?: ComplianceWorkflowActor;
  resolutionNote?: string;
}

export interface ComplianceManagerResponseState {
  kind: ComplianceManagerResponseKind;
  label: string;
  note: string;
  relatedTo: "BLOCKER" | "SUBMISSION";
  respondedAt: string;
  respondedBy?: ComplianceWorkflowActor;
}

export interface ComplianceWorkflowData {
  checklist: ComplianceChecklistItem[];
  requiredDocumentLabel: string;
  legacyNotes?: string | null;
  blocker?: ComplianceBlockerState;
  lastResolvedBlocker?: ComplianceResolvedBlockerState;
  managerResponse?: ComplianceManagerResponseState;
  submissionNote?: string;
  submittedAt?: string;
  submittedBy?: ComplianceWorkflowActor;
  approvedAt?: string;
  approvedBy?: ComplianceWorkflowActor;
  rejectedAt?: string;
  rejectedBy?: ComplianceWorkflowActor;
  rejectionReason?: string;
}

const APPROVER_ROLES = new Set([
  "ADMIN",
  "ACCOUNTANT",
  "HR",
  "OPERATIONS_MANAGER",
]);

export const blockerReasonCatalog: Array<{
  code: ComplianceBlockerCode;
  label: string;
  helper: string;
}> = [
  {
    code: "MISSING_DOCUMENT",
    label: "Missing document",
    helper: "A receipt, payroll register, permit, or supporting file is still missing.",
  },
  {
    code: "WAITING_APPROVAL",
    label: "Waiting for approval",
    helper: "A manager, director, or external approver has not signed off yet.",
  },
  {
    code: "WAITING_PAYMENT",
    label: "Waiting for payment",
    helper: "The filing depends on funds, fee approval, or a completed payment.",
  },
  {
    code: "WAITING_TEAM_INPUT",
    label: "Waiting for teammate input",
    helper: "Another person still needs to provide figures, documents, or confirmation.",
  },
  {
    code: "KRA_PORTAL_ISSUE",
    label: "KRA or portal issue",
    helper: "The government portal, eCitizen, or another filing system is down or inaccessible.",
  },
  {
    code: "INTERNET_OR_POWER",
    label: "Internet or power issue",
    helper: "Connectivity or electricity problems are stopping the work.",
  },
  {
    code: "OTHER",
    label: "Other blocker",
    helper: "Anything else that needs visibility and help.",
  },
];

export const managerResponseCatalog: Array<{
  kind: ComplianceManagerResponseKind;
  label: string;
  helper: string;
}> = [
  {
    kind: "SEEN",
    label: "Seen",
    helper: "The manager has seen the request and the assignee can stop wondering whether it was noticed.",
  },
  {
    kind: "TAKING_OWNERSHIP",
    label: "I'll handle this",
    helper: "The manager is taking over the next step directly so the assignee knows support is active.",
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createChecklist(labels: string[]): ComplianceChecklistItem[] {
  return labels.map((label) => ({
    id: slugify(label),
    label,
    done: false,
  }));
}

export function inferRequiredDocumentLabel(title: string, category: string) {
  const fingerprint = `${title} ${category}`.toLowerCase();

  if (
    fingerprint.includes("vat") ||
    fingerprint.includes("income tax") ||
    fingerprint.includes("paye")
  ) {
    return "KRA filing receipt";
  }

  if (
    fingerprint.includes("nssf") ||
    fingerprint.includes("sha") ||
    fingerprint.includes("nhif")
  ) {
    return "Payment slip or submission receipt";
  }

  if (fingerprint.includes("cr12")) {
    return "Issued CR12 document";
  }

  if (
    fingerprint.includes("permit") ||
    fingerprint.includes("workplace")
  ) {
    return "Renewed permit or workplace certificate";
  }

  if (fingerprint.includes("nca")) {
    return "Renewal certificate";
  }

  return "Supporting evidence document";
}

export function createChecklistTemplate(title: string, category: string) {
  const fingerprint = `${title} ${category}`.toLowerCase();

  if (fingerprint.includes("vat")) {
    return createChecklist([
      "Confirm sales and purchase figures for the filing period",
      "Prepare and review the VAT return in iTax",
      "Upload the KRA filing receipt",
    ]);
  }

  if (
    fingerprint.includes("paye") ||
    fingerprint.includes("nssf") ||
    fingerprint.includes("sha") ||
    fingerprint.includes("nhif")
  ) {
    return createChecklist([
      "Reconcile payroll deductions against the payroll register",
      "Prepare the statutory return or payment schedule",
      "Upload the payment slip or submission receipt",
    ]);
  }

  if (fingerprint.includes("income tax")) {
    return createChecklist([
      "Confirm annual figures and supporting schedules",
      "Prepare the income tax filing for review",
      "Upload the KRA acknowledgement receipt",
    ]);
  }

  if (fingerprint.includes("cr12")) {
    return createChecklist([
      "Confirm directors and shareholders are up to date",
      "Submit the CR12 request on eCitizen",
      "Upload the issued CR12 document",
    ]);
  }

  if (
    fingerprint.includes("permit") ||
    fingerprint.includes("workplace")
  ) {
    return createChecklist([
      "Confirm the licence details and renewal amount",
      "Submit the renewal application",
      "Upload the renewed permit or certificate",
    ]);
  }

  if (fingerprint.includes("nca")) {
    return createChecklist([
      "Confirm the current category requirements and fees",
      "Submit the renewal package",
      "Upload the renewed NCA certificate",
    ]);
  }

  return createChecklist([
    "Confirm the requirement scope and owner",
    "Prepare the filing, payment, or renewal",
    `Upload the ${inferRequiredDocumentLabel(title, category).toLowerCase()}`,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChecklist(value: unknown, fallback: ComplianceChecklistItem[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const checklist = value
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.label !== "string") {
        return null;
      }

      const id = typeof entry.id === "string" && entry.id.length > 0
        ? entry.id
        : slugify(entry.label);

      return {
        id,
        label: entry.label,
        done: Boolean(entry.done),
      } satisfies ComplianceChecklistItem;
    })
    .filter((entry): entry is ComplianceChecklistItem => entry !== null);

  return checklist.length > 0 ? checklist : fallback;
}

function parseActor(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    id: typeof value.id === "number" ? value.id : undefined,
    name: typeof value.name === "string" ? value.name : null,
    email: typeof value.email === "string" ? value.email : null,
    role: typeof value.role === "string" ? value.role : null,
  } satisfies ComplianceWorkflowActor;
}

function isBlockerCode(value: unknown): value is ComplianceBlockerCode {
  return blockerReasonCatalog.some((item) => item.code === value);
}

function getBlockerLabel(code: ComplianceBlockerCode) {
  return blockerReasonCatalog.find((item) => item.code === code)?.label || "Blocker";
}

function isManagerResponseKind(value: unknown): value is ComplianceManagerResponseKind {
  return managerResponseCatalog.some((item) => item.kind === value);
}

function getManagerResponseLabel(kind: ComplianceManagerResponseKind) {
  return managerResponseCatalog.find((item) => item.kind === kind)?.label || "Manager response";
}

function parseBlocker(value: unknown) {
  if (!isRecord(value) || !isBlockerCode(value.code) || typeof value.reason !== "string") {
    return undefined;
  }

  return {
    code: value.code,
    label:
      typeof value.label === "string" && value.label.length > 0
        ? value.label
        : getBlockerLabel(value.code),
    reason: value.reason,
    waitingOn: typeof value.waitingOn === "string" ? value.waitingOn : undefined,
    needsManagerHelp: Boolean(value.needsManagerHelp),
    blockedAt: typeof value.blockedAt === "string" ? value.blockedAt : new Date().toISOString(),
    blockedBy: parseActor(value.blockedBy),
  } satisfies ComplianceBlockerState;
}

function parseResolvedBlocker(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const blocker = parseBlocker(value);
  if (!blocker || typeof value.clearedAt !== "string") {
    return undefined;
  }

  return {
    ...blocker,
    clearedAt: value.clearedAt,
    clearedBy: parseActor(value.clearedBy),
    resolutionNote:
      typeof value.resolutionNote === "string" ? value.resolutionNote : undefined,
  } satisfies ComplianceResolvedBlockerState;
}

function parseManagerResponse(value: unknown) {
  if (
    !isRecord(value) ||
    !isManagerResponseKind(value.kind) ||
    typeof value.note !== "string" ||
    typeof value.respondedAt !== "string"
  ) {
    return undefined;
  }

  const relatedTo =
    value.relatedTo === "SUBMISSION" ? "SUBMISSION" : "BLOCKER";

  return {
    kind: value.kind,
    label:
      typeof value.label === "string" && value.label.length > 0
        ? value.label
        : getManagerResponseLabel(value.kind),
    note: value.note,
    relatedTo,
    respondedAt: value.respondedAt,
    respondedBy: parseActor(value.respondedBy),
  } satisfies ComplianceManagerResponseState;
}

function parseComplianceWorkflowRecord(
  parsed: Record<string, unknown>,
  fallbackChecklist: ComplianceChecklistItem[],
  requiredDocumentLabel: string,
) {
  return {
    checklist: parseChecklist(parsed.checklist, fallbackChecklist),
    requiredDocumentLabel:
      typeof parsed.requiredDocumentLabel === "string" &&
      parsed.requiredDocumentLabel.length > 0
        ? parsed.requiredDocumentLabel
        : requiredDocumentLabel,
    legacyNotes:
      typeof parsed.legacyNotes === "string" ? parsed.legacyNotes : undefined,
    blocker: parseBlocker(parsed.blocker),
    lastResolvedBlocker: parseResolvedBlocker(parsed.lastResolvedBlocker),
    managerResponse: parseManagerResponse(parsed.managerResponse),
    submissionNote:
      typeof parsed.submissionNote === "string" ? parsed.submissionNote : undefined,
    submittedAt:
      typeof parsed.submittedAt === "string" ? parsed.submittedAt : undefined,
    submittedBy: parseActor(parsed.submittedBy),
    approvedAt:
      typeof parsed.approvedAt === "string" ? parsed.approvedAt : undefined,
    approvedBy: parseActor(parsed.approvedBy),
    rejectedAt:
      typeof parsed.rejectedAt === "string" ? parsed.rejectedAt : undefined,
    rejectedBy: parseActor(parsed.rejectedBy),
    rejectionReason:
      typeof parsed.rejectionReason === "string" ? parsed.rejectionReason : undefined,
  } satisfies ComplianceWorkflowData;
}

export function parseComplianceWorkflow(
  source: unknown,
  title: string,
  category: string,
): ComplianceWorkflowData {
  const fallbackChecklist = createChecklistTemplate(title, category);
  const requiredDocumentLabel = inferRequiredDocumentLabel(title, category);

  if (source === null || source === undefined || source === "") {
    return {
      checklist: fallbackChecklist,
      requiredDocumentLabel,
    };
  }

  if (isRecord(source)) {
    return parseComplianceWorkflowRecord(
      source,
      fallbackChecklist,
      requiredDocumentLabel,
    );
  }

  if (typeof source !== "string") {
    return {
      checklist: fallbackChecklist,
      requiredDocumentLabel,
    };
  }

  try {
    const parsed: unknown = JSON.parse(source);

    if (!isRecord(parsed)) {
      return {
        checklist: fallbackChecklist,
        requiredDocumentLabel,
        legacyNotes: source,
      };
    }

    return parseComplianceWorkflowRecord(
      parsed,
      fallbackChecklist,
      requiredDocumentLabel,
    );
  } catch {
    return {
      checklist: fallbackChecklist,
      requiredDocumentLabel,
      legacyNotes: source,
    };
  }
}

export function serializeComplianceWorkflow(workflow: ComplianceWorkflowData) {
  return JSON.stringify(workflow);
}

export function serializeComplianceWorkflowValue(workflow: ComplianceWorkflowData) {
  return JSON.parse(serializeComplianceWorkflow(workflow)) as ComplianceWorkflowData;
}

export function isApprovalPending(status: string) {
  return status === "Submitted";
}

export function isClosedStatus(status: string) {
  return status === "Approved" || status === "Completed";
}

export function isActionRequired(status: string) {
  return status === "Pending" || status === "Rejected";
}

export function hasActiveBlocker(workflow: ComplianceWorkflowData) {
  return Boolean(workflow.blocker);
}

export function normalizeWorkflowStatus(status: string): ComplianceWorkflowStatus {
  if (status === "Completed") {
    return "Approved";
  }

  if (
    status === "Pending" ||
    status === "Submitted" ||
    status === "Approved" ||
    status === "Rejected"
  ) {
    return status;
  }

  return "Pending";
}

export function canApproveRole(role: string | null | undefined) {
  return role ? APPROVER_ROLES.has(role) : false;
}

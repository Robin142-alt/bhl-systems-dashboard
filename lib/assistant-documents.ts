import { readFile } from "fs/promises";
import path from "path";
import { canApproveRole, inferRequiredDocumentLabel } from "@/lib/compliance-workflow";
import {
  ensureDocumentVersionExtraction,
  upsertWorkItemDocumentVerification,
} from "@/lib/document-registry";
import { parseDocumentDownloadUrl } from "@/lib/document-registry-urls";
import { prisma } from "@/lib/prisma";
import {
  hydrateWorkItem,
  listAllHydratedWorkItems,
  listHydratedWorkItems,
  workItemDetailInclude,
} from "@/lib/work-items";

interface AssistantDocumentUserContext {
  id?: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: number;
  organizationSlug?: string | null;
}

type AssistantDocumentSource = "COMPLIANCE_PROOF" | "TRAINING_CERTIFICATE";
type AssistantDocumentReadStatus =
  | "EXTRACTED"
  | "VISION_EXTRACTED"
  | "UNREADABLE"
  | "UNSUPPORTED"
  | "VISION_UNAVAILABLE"
  | "MISSING_FILE"
  | "UNAVAILABLE";

interface AssistantDocumentCandidate {
  id: string;
  source: AssistantDocumentSource;
  workItemId?: number;
  title: string;
  owner: string;
  category: string;
  expectedDocument: string;
  status: string;
  uploadedAt: string;
  dueAt?: string;
  fileUrl: string | null;
  fileName?: string | null;
  documentId?: number | null;
  documentVersionId?: number | null;
  extractedFields?: Record<string, unknown> | null;
  fingerprint: string;
  textPreview?: string | null;
  readStatus?: AssistantDocumentReadStatus;
  verification?: AssistantDocumentVerification;
  score: number;
}

type AssistantVerificationStatus = "MATCHED" | "CHECK_NEEDED" | "MISMATCH";
type AssistantMismatchSeverity = "WARNING" | "CRITICAL";

interface AssistantVerifiedField {
  label: string;
  value: string | null;
  status: "FOUND" | "MISSING";
}

interface AssistantDocumentMismatch {
  label: string;
  detail: string;
  severity: AssistantMismatchSeverity;
}

interface AssistantDocumentVerification {
  status: AssistantVerificationStatus;
  documentKind: string;
  fields: AssistantVerifiedField[];
  mismatches: AssistantDocumentMismatch[];
  notes: string[];
}

export interface AssistantDocumentSearchResult {
  totalIndexed: number;
  totalWithFiles: number;
  matched: AssistantDocumentCandidate[];
  groundingLabel: string;
  contextText: string;
  fallbackReply: string;
  suggestions: string[];
}

export interface AssistantWorkItemProofVerificationResult {
  candidate: AssistantDocumentCandidate;
  reply: string;
  groundingLabel: string;
}

const textExtensions = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".xml",
  ".html",
  ".htm",
  ".log",
]);

const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);

const monthLookup = new Map([
  ["jan", 0],
  ["january", 0],
  ["feb", 1],
  ["february", 1],
  ["mar", 2],
  ["march", 2],
  ["apr", 3],
  ["april", 3],
  ["may", 4],
  ["jun", 5],
  ["june", 5],
  ["jul", 6],
  ["july", 6],
  ["aug", 7],
  ["august", 7],
  ["sep", 8],
  ["sept", 8],
  ["september", 8],
  ["oct", 9],
  ["october", 9],
  ["nov", 10],
  ["november", 10],
  ["dec", 11],
  ["december", 11],
]);

const queryStopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "have",
  "has",
  "this",
  "that",
  "from",
  "into",
  "what",
  "which",
  "where",
  "when",
  "does",
  "do",
  "did",
  "our",
  "your",
  "their",
  "them",
  "about",
  "already",
  "latest",
  "recent",
  "newest",
  "need",
  "show",
  "find",
  "give",
  "tell",
  "summarize",
  "summary",
]);

function normalizeValue(value: string) {
  return value.toLowerCase().trim();
}

function tokenizeQuery(query: string) {
  return normalizeValue(query)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1 && !queryStopwords.has(token));
}

function formatShortDate(date: string | Date | null | undefined) {
  if (!date) {
    return "unknown date";
  }

  return new Date(date).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cleanExtractedText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

function formatCurrencyAmount(amount: number) {
  const hasDecimals = !Number.isInteger(amount);
  return `KES ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function createValidDate(year: number, monthIndex: number, day: number) {
  const date = new Date(year, monthIndex, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDocumentDateValue(value: string) {
  const cleaned = value.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

  let match = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    return createValidDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return createValidDate(year, Number(match[2]) - 1, Number(match[1]));
  }

  match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (match) {
    const monthIndex = monthLookup.get(match[2].toLowerCase());
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    if (typeof monthIndex === "number") {
      return createValidDate(year, monthIndex, Number(match[1]));
    }
  }

  match = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{2,4})$/);
  if (match) {
    const monthIndex = monthLookup.get(match[1].toLowerCase());
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    if (typeof monthIndex === "number") {
      return createValidDate(year, monthIndex, Number(match[2]));
    }
  }

  return null;
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function coerceRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coerceExtractedDocumentDate(value: unknown) {
  const record = coerceRecord(value);
  if (!record) {
    return null;
  }

  const raw = typeof record.raw === "string" ? record.raw : null;
  const isoDate = typeof record.isoDate === "string" ? record.isoDate : null;
  const parsedFromRaw = raw ? parseDocumentDateValue(raw) : null;
  const parsed =
    isoDate && !Number.isNaN(new Date(isoDate).getTime())
      ? new Date(isoDate)
      : parsedFromRaw;
  const display =
    typeof record.display === "string"
      ? record.display
      : parsed
        ? formatFullDate(parsed)
        : raw;

  if (!raw && !display && !parsed) {
    return null;
  }

  return {
    raw: raw || display || "",
    display: display || (parsed ? formatFullDate(parsed) : raw || ""),
    parsed,
  };
}

function coerceExtractedTaxPeriod(value: unknown) {
  const record = coerceRecord(value);
  if (!record || typeof record.raw !== "string") {
    return null;
  }

  return {
    raw: record.raw,
    year: typeof record.year === "number" ? record.year : null,
    monthIndex: typeof record.monthIndex === "number" ? record.monthIndex : null,
  };
}

function getDaysBetween(left: Date, right: Date) {
  const leftDay = new Date(left);
  leftDay.setHours(0, 0, 0, 0);
  const rightDay = new Date(right);
  rightDay.setHours(0, 0, 0, 0);
  return Math.round((leftDay.getTime() - rightDay.getTime()) / 86_400_000);
}

function extractFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function extractReceiptNumber(text: string) {
  return extractFirstMatch(text, [
    /(?:receipt|acknowledg(?:e)?ment|transaction|reference|payment|serial)\s*(?:number|no\.?|#|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})/i,
    /(?:document|certificate)\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})/i,
  ]);
}

function extractAmount(text: string) {
  const labeledMatch = text.match(
    /(?:amount(?:\s+paid|\s+payable|\s+due)?|tax\s+amount|payment\s+amount|total(?:\s+paid)?)\s*[:\-]?\s*(?:KES|KSHS?|KSH)?\s*([\d,]+(?:\.\d{2})?)/i,
  );

  if (labeledMatch?.[1]) {
    const parsed = Number(labeledMatch[1].replace(/,/g, ""));
    if (!Number.isNaN(parsed)) {
      return formatCurrencyAmount(parsed);
    }
  }

  const prefixedMatches = Array.from(
    text.matchAll(/(?:KES|KSHS?|KSH)\s*([\d,]+(?:\.\d{2})?)/gi),
  )
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => !Number.isNaN(value));

  if (prefixedMatches.length === 0) {
    return null;
  }

  const best = Math.max(...prefixedMatches);
  return formatCurrencyAmount(best);
}

function extractDocumentDate(text: string) {
  const dateSource =
    "(\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{2,4})";
  const labeledPatterns = [
    new RegExp(`(?:filing|return|submission)\\s+date\\s*[:\\-]?\\s*${dateSource}`, "i"),
    new RegExp(`(?:payment|paid)\\s+date\\s*[:\\-]?\\s*${dateSource}`, "i"),
    new RegExp(`(?:receipt|issue|issued)\\s+date\\s*[:\\-]?\\s*${dateSource}`, "i"),
    new RegExp(`(?:date)\\s*[:\\-]?\\s*${dateSource}`, "i"),
  ];

  const raw = extractFirstMatch(text, labeledPatterns);
  if (raw) {
    const parsed = parseDocumentDateValue(raw);
    if (parsed) {
      return {
        raw,
        parsed,
        display: formatFullDate(parsed),
      };
    }
  }

  const genericMatches = Array.from(
    text.matchAll(
      /(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})/gi,
    ),
  );

  for (const match of genericMatches) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }

    const parsed = parseDocumentDateValue(value);
    if (parsed) {
      return {
        raw: value,
        parsed,
        display: formatFullDate(parsed),
      };
    }
  }

  return null;
}

function extractTaxPeriod(text: string) {
  const raw = extractFirstMatch(text, [
    /(?:tax|return|filing|payment)\s+period\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{4}|[01]?\d[/-]\d{4})/i,
    /(?:period)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{4}|[01]?\d[/-]\d{4})/i,
  ]);

  if (!raw) {
    return null;
  }

  const cleaned = raw.replace(/\s+/g, " ").trim();
  const monthYearMatch = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthYearMatch) {
    const monthIndex = monthLookup.get(monthYearMatch[1].toLowerCase());
    if (typeof monthIndex === "number") {
      return {
        raw: cleaned,
        year: Number(monthYearMatch[2]),
        monthIndex,
      };
    }
  }

  const slashMatch = cleaned.match(/^([01]?\d)[/-](\d{4})$/);
  if (slashMatch) {
    return {
      raw: cleaned,
      year: Number(slashMatch[2]),
      monthIndex: Number(slashMatch[1]) - 1,
    };
  }

  return {
    raw: cleaned,
    year: null,
    monthIndex: null,
  };
}

function detectTaxType(value: string) {
  const normalized = normalizeValue(value);

  if (/(^|[^a-z])vat([^a-z]|$)/i.test(normalized) || normalized.includes("value added tax")) {
    return "VAT";
  }

  if (/(^|[^a-z])paye([^a-z]|$)/i.test(normalized) || normalized.includes("pay as you earn")) {
    return "PAYE";
  }

  if (normalized.includes("nssf")) {
    return "NSSF";
  }

  if (
    normalized.includes("social health authority") ||
    /(^|[^a-z])sha([^a-z]|$)/i.test(normalized)
  ) {
    return "SHA";
  }

  if (normalized.includes("nhif")) {
    return "NHIF";
  }

  if (
    normalized.includes("corporation tax") ||
    normalized.includes("income tax") ||
    normalized.includes("corporate tax")
  ) {
    return "INCOME_TAX";
  }

  if (normalized.includes("cr12")) {
    return "CR12";
  }

  if (normalized.includes("permit") || normalized.includes("licence") || normalized.includes("license")) {
    return "PERMIT";
  }

  return null;
}

function inferExpectedDocumentProfile(candidate: AssistantDocumentCandidate) {
  const fingerprint = normalizeValue(
    `${candidate.title} ${candidate.category} ${candidate.expectedDocument}`,
  );

  if (fingerprint.includes("vat")) {
    return {
      kind: "VAT",
      label: "VAT receipt",
      requiresKraSignals: true,
      requiresAmount: false,
      expectsReceiptNumber: true,
      monthly: true,
    };
  }

  if (fingerprint.includes("paye")) {
    return {
      kind: "PAYE",
      label: "PAYE receipt",
      requiresKraSignals: true,
      requiresAmount: true,
      expectsReceiptNumber: true,
      monthly: true,
    };
  }

  if (fingerprint.includes("nssf")) {
    return {
      kind: "NSSF",
      label: "NSSF proof",
      requiresKraSignals: false,
      requiresAmount: true,
      expectsReceiptNumber: false,
      monthly: true,
    };
  }

  if (fingerprint.includes("sha")) {
    return {
      kind: "SHA",
      label: "SHA proof",
      requiresKraSignals: false,
      requiresAmount: true,
      expectsReceiptNumber: false,
      monthly: true,
    };
  }

  if (fingerprint.includes("nhif")) {
    return {
      kind: "NHIF",
      label: "NHIF proof",
      requiresKraSignals: false,
      requiresAmount: true,
      expectsReceiptNumber: false,
      monthly: true,
    };
  }

  if (fingerprint.includes("income tax") || fingerprint.includes("corporation tax")) {
    return {
      kind: "INCOME_TAX",
      label: "income tax receipt",
      requiresKraSignals: true,
      requiresAmount: false,
      expectsReceiptNumber: true,
      monthly: false,
    };
  }

  if (fingerprint.includes("cr12")) {
    return {
      kind: "CR12",
      label: "CR12 document",
      requiresKraSignals: false,
      requiresAmount: false,
      expectsReceiptNumber: false,
      monthly: false,
    };
  }

  if (fingerprint.includes("permit") || fingerprint.includes("workplace")) {
    return {
      kind: "PERMIT",
      label: "permit or licence document",
      requiresKraSignals: false,
      requiresAmount: false,
      expectsReceiptNumber: false,
      monthly: false,
    };
  }

  return {
    kind: candidate.source === "TRAINING_CERTIFICATE" ? "CERTIFICATE" : "GENERAL",
    label: candidate.source === "TRAINING_CERTIFICATE" ? "certificate" : "supporting document",
    requiresKraSignals: false,
    requiresAmount: false,
    expectsReceiptNumber: false,
    monthly: false,
  };
}

function areKindsCompatible(expected: string, extracted: string) {
  if (expected === extracted) {
    return true;
  }

  if (
    (expected === "SHA" && extracted === "NHIF") ||
    (expected === "NHIF" && extracted === "SHA")
  ) {
    return true;
  }

  return false;
}

function buildVerifiedField(label: string, value: string | null): AssistantVerifiedField {
  return {
    label,
    value,
    status: value ? "FOUND" : "MISSING",
  };
}

function addMismatch(
  mismatches: AssistantDocumentMismatch[],
  severity: AssistantMismatchSeverity,
  label: string,
  detail: string,
) {
  mismatches.push({ severity, label, detail });
}

function buildDocumentVerification(candidate: AssistantDocumentCandidate): AssistantDocumentVerification | undefined {
  const profile = inferExpectedDocumentProfile(candidate);
  const text = candidate.textPreview || "";
  const extractedFieldRecord = candidate.extractedFields || null;
  const fields: AssistantVerifiedField[] = [];
  const mismatches: AssistantDocumentMismatch[] = [];
  const notes: string[] = [];
  const tracksReceiptNumber =
    profile.expectsReceiptNumber || candidate.source === "TRAINING_CERTIFICATE";
  const tracksAmount = profile.requiresAmount;
  const tracksTaskDate = candidate.source === "COMPLIANCE_PROOF";
  const dateLabel = candidate.source === "TRAINING_CERTIFICATE" ? "Issue date" : "Filing date";

  if (!candidate.fileUrl) {
    addMismatch(
      mismatches,
      "CRITICAL",
      "Proof missing",
      "The task record exists, but no proof file is attached yet.",
    );

    return {
      status: "MISMATCH",
      documentKind: profile.label,
      fields: [
        ...(tracksReceiptNumber ? [buildVerifiedField("Receipt number", null)] : []),
        ...(tracksAmount ? [buildVerifiedField("Amount", null)] : []),
        ...(tracksTaskDate ? [buildVerifiedField(dateLabel, null)] : []),
      ],
      mismatches,
      notes,
    };
  }

  if (!text) {
    if (candidate.readStatus === "VISION_UNAVAILABLE") {
      notes.push("OCR is not available, so scan-only proof could not be verified.");
    } else if (candidate.readStatus === "UNREADABLE") {
      notes.push("The scan quality was too poor to extract the verification fields confidently.");
    } else if (candidate.readStatus === "UNSUPPORTED") {
      notes.push("The file is on record, but its contents could not be verified automatically.");
    }

    return {
      status: notes.length > 0 ? "CHECK_NEEDED" : "MISMATCH",
      documentKind: profile.label,
      fields: [
        ...(tracksReceiptNumber ? [buildVerifiedField("Receipt number", null)] : []),
        ...(tracksAmount ? [buildVerifiedField("Amount", null)] : []),
        ...(tracksTaskDate ? [buildVerifiedField(dateLabel, null)] : []),
      ],
      mismatches,
      notes,
    };
  }

  const receiptNumberFromExtraction =
    extractedFieldRecord && typeof extractedFieldRecord.receiptNumber === "string"
      ? extractedFieldRecord.receiptNumber
      : null;
  const amountFromExtraction =
    extractedFieldRecord && typeof extractedFieldRecord.amount === "string"
      ? extractedFieldRecord.amount
      : null;
  const filingDateFromExtraction = coerceExtractedDocumentDate(
    extractedFieldRecord?.documentDate,
  );
  const taxPeriodFromExtraction = coerceExtractedTaxPeriod(extractedFieldRecord?.taxPeriod);
  const extractedKindFromExtraction =
    extractedFieldRecord && typeof extractedFieldRecord.detectedKind === "string"
      ? extractedFieldRecord.detectedKind
      : null;
  const hasKraSignalsFromExtraction =
    extractedFieldRecord && typeof extractedFieldRecord.hasKraSignals === "boolean"
      ? extractedFieldRecord.hasKraSignals
      : null;

  const receiptNumber =
    candidate.source === "TRAINING_CERTIFICATE"
      ? receiptNumberFromExtraction || extractReceiptNumber(text) || candidate.fileName || null
      : receiptNumberFromExtraction || extractReceiptNumber(text);
  const amount = amountFromExtraction || extractAmount(text);
  const filingDate = filingDateFromExtraction || extractDocumentDate(text);
  const taxPeriod = taxPeriodFromExtraction || extractTaxPeriod(text);
  const extractedKind = extractedKindFromExtraction || detectTaxType(text);
  const hasKraSignals =
    hasKraSignalsFromExtraction ?? /(?:kenya revenue authority|kra|itax)/i.test(text);

  if (tracksReceiptNumber) {
    fields.push(buildVerifiedField("Receipt number", receiptNumber));
  }

  if (tracksAmount) {
    fields.push(buildVerifiedField("Amount", amount));
  }

  if (tracksTaskDate) {
    fields.push(buildVerifiedField(dateLabel, filingDate?.display || null));
  } else if (candidate.source === "TRAINING_CERTIFICATE") {
    fields.push(buildVerifiedField(dateLabel, filingDate?.display || formatShortDate(candidate.uploadedAt)));
  }

  if (candidate.source === "COMPLIANCE_PROOF") {
    fields.push(buildVerifiedField("Detected document type", extractedKind));
    if (taxPeriod?.raw) {
      fields.push(buildVerifiedField("Tax period", taxPeriod.raw));
    }
  }

  if (profile.expectsReceiptNumber && !receiptNumber) {
    addMismatch(
      mismatches,
      "WARNING",
      "Receipt number missing",
      "I could not confidently extract a receipt or acknowledgement number from the proof.",
    );
  }

  if (profile.requiresAmount && !amount) {
    addMismatch(
      mismatches,
      "WARNING",
      "Amount missing",
      "I could not confidently extract a payment amount from the proof.",
    );
  }

  if (tracksTaskDate && !filingDate) {
    addMismatch(
      mismatches,
      "WARNING",
      "Filing date missing",
      "I could not confidently extract the filing or payment date from the proof.",
    );
  }

  if (profile.requiresKraSignals && !hasKraSignals) {
    addMismatch(
      mismatches,
      "WARNING",
      "KRA signal missing",
      "This proof does not clearly show KRA or iTax wording, so it may not be the expected filing receipt.",
    );
  }

  if (extractedKind && !areKindsCompatible(profile.kind, extractedKind) && profile.kind !== "GENERAL") {
    addMismatch(
      mismatches,
      "CRITICAL",
      "Document type mismatch",
      `The task looks like ${profile.label}, but the proof text looks more like ${extractedKind}.`,
    );
  }

  if (tracksTaskDate && filingDate?.parsed && candidate.dueAt) {
    const dueDate = new Date(candidate.dueAt);
    const lateByDays = getDaysBetween(filingDate.parsed, dueDate);

    if (lateByDays > 0) {
      addMismatch(
        mismatches,
        lateByDays >= 7 ? "CRITICAL" : "WARNING",
        "Date is after deadline",
        `The proof shows ${filingDate.display}, which is ${lateByDays} day${lateByDays === 1 ? "" : "s"} after the task deadline of ${formatShortDate(candidate.dueAt)}.`,
      );
    } else {
      notes.push(`The filing date ${filingDate.display} is on or before the task deadline.`);
    }
  }

  if (
    taxPeriod &&
    taxPeriod.monthIndex !== null &&
    taxPeriod.year !== null &&
    candidate.dueAt &&
    profile.monthly
  ) {
    const dueDate = new Date(candidate.dueAt);
    const expectedPeriod = new Date(dueDate.getFullYear(), dueDate.getMonth() - 1, 1);
    const extractedPeriod = taxPeriod;

    if (
      expectedPeriod.getFullYear() !== extractedPeriod.year ||
      expectedPeriod.getMonth() !== extractedPeriod.monthIndex
    ) {
      addMismatch(
        mismatches,
        "WARNING",
        "Tax period mismatch",
        `The proof shows tax period ${extractedPeriod.raw}, but a ${profile.kind} task due on ${formatShortDate(candidate.dueAt)} would usually relate to ${expectedPeriod.toLocaleDateString("en-KE", { month: "short", year: "numeric" })}.`,
      );
    } else {
      notes.push(`The tax period ${extractedPeriod.raw} lines up with the task deadline.`);
    }
  }

  const status: AssistantVerificationStatus =
    mismatches.some((item) => item.severity === "CRITICAL")
      ? "MISMATCH"
      : mismatches.length > 0
        ? "CHECK_NEEDED"
        : "MATCHED";

  return {
    status,
    documentKind: profile.label,
    fields,
    mismatches,
    notes,
  };
}

function getMimeTypeForExtension(extension: string) {
  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/jpeg";
}

function resolveDocumentPath(fileUrl: string) {
  if (fileUrl.startsWith("/uploads/")) {
    return path.join(/* turbopackIgnore: true */ process.cwd(), "public", fileUrl.replace(/^\/+/, ""));
  }

  if (fileUrl.startsWith("/tmp/uploads/")) {
    return fileUrl;
  }

  return null;
}

async function extractDocumentPreview(fileUrl: string | null) {
  if (!fileUrl) {
    return {
      textPreview: null,
      readStatus: "UNAVAILABLE" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  }

  const localPath = resolveDocumentPath(fileUrl);
  if (!localPath) {
    return {
      textPreview: null,
      readStatus: "UNAVAILABLE" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  }

  const extension = path.extname(localPath).toLowerCase();

  try {
    if (textExtensions.has(extension)) {
      const raw = await readFile(localPath, "utf8");
      const cleaned = cleanExtractedText(raw);

      return {
        textPreview: cleaned.length > 0 ? cleaned : null,
        readStatus: (cleaned.length > 0 ? "EXTRACTED" : "UNSUPPORTED") as AssistantDocumentReadStatus,
      } satisfies {
        textPreview: string | null;
        readStatus: AssistantDocumentReadStatus;
      };
    }

    if (extension === ".pdf") {
      const buffer = await readFile(localPath);
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });

      try {
        const parsed = await parser.getText();
        const cleaned = cleanExtractedText(parsed.text || "");

        if (cleaned.length >= 48) {
          return {
            textPreview: cleaned,
            readStatus: "EXTRACTED" as AssistantDocumentReadStatus,
          } satisfies {
            textPreview: string | null;
            readStatus: AssistantDocumentReadStatus;
          };
        }

        const screenshot = await parser.getScreenshot({
          first: 1,
          desiredWidth: 1600,
          imageBuffer: false,
          imageDataUrl: true,
        });
        const firstPage = screenshot.pages[0];

        if (!firstPage?.dataUrl) {
          return {
            textPreview: cleaned.length > 0 ? cleaned : null,
            readStatus: (cleaned.length > 0 ? "EXTRACTED" : "UNSUPPORTED") as AssistantDocumentReadStatus,
          } satisfies {
            textPreview: string | null;
            readStatus: AssistantDocumentReadStatus;
          };
        }

        const visionPreview = await extractVisionPreviewFromDataUrl(firstPage.dataUrl);

        if (visionPreview.readStatus === "VISION_EXTRACTED") {
          return visionPreview;
        }

        return {
          textPreview: cleaned.length > 0 ? cleaned : visionPreview.textPreview,
          readStatus: cleaned.length > 0 ? "EXTRACTED" : visionPreview.readStatus,
        } satisfies {
          textPreview: string | null;
          readStatus: AssistantDocumentReadStatus;
        };
      } finally {
        await parser.destroy();
      }
    }

    if (imageExtensions.has(extension)) {
      const buffer = await readFile(localPath);
      const mimeType = getMimeTypeForExtension(extension);

      return extractVisionPreviewFromDataUrl(
        `data:${mimeType};base64,${buffer.toString("base64")}`,
      );
    }

    return {
      textPreview: null,
      readStatus: "UNSUPPORTED" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  } catch {
    return {
      textPreview: null,
      readStatus: "MISSING_FILE" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  }
}

async function loadCandidatePreview(candidate: AssistantDocumentCandidate) {
  const registryReference =
    (typeof candidate.documentVersionId === "number" && typeof candidate.documentId === "number"
      ? {
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
        }
      : candidate.fileUrl
        ? parseDocumentDownloadUrl(candidate.fileUrl)
        : null);

  if (registryReference?.documentVersionId) {
    const extraction = await ensureDocumentVersionExtraction(
      prisma,
      registryReference.documentVersionId,
    );

    if (extraction) {
      return {
        textPreview: extraction.textPreview,
        readStatus: extraction.readStatus,
        extractedFields: extraction.extractedFields,
        documentId: registryReference.documentId,
        documentVersionId: registryReference.documentVersionId,
      };
    }
  }

  const preview = await extractDocumentPreview(candidate.fileUrl);

  return {
    textPreview: preview.textPreview,
    readStatus: preview.readStatus,
    extractedFields: null,
    documentId: registryReference?.documentId ?? candidate.documentId ?? null,
    documentVersionId: registryReference?.documentVersionId ?? candidate.documentVersionId ?? null,
  };
}

async function persistCandidateVerification(candidate: AssistantDocumentCandidate) {
  if (
    candidate.source !== "COMPLIANCE_PROOF" ||
    typeof candidate.workItemId !== "number" ||
    typeof candidate.documentId !== "number" ||
    typeof candidate.documentVersionId !== "number" ||
    !candidate.verification
  ) {
    return;
  }

  const summary =
    candidate.verification.status === "MATCHED"
      ? "Automatic document cross-check found no obvious mismatch."
      : candidate.verification.mismatches[0]?.detail ||
        "Automatic document cross-check flagged the proof for review.";

  await upsertWorkItemDocumentVerification({
    documentId: candidate.documentId,
    documentVersionId: candidate.documentVersionId,
    workItemId: candidate.workItemId,
    status: candidate.verification.status,
    summary,
    fields: candidate.verification.fields,
    mismatches: candidate.verification.mismatches,
    notes: candidate.verification.notes,
  });
}

function buildWorkItemCandidate(
  item: Awaited<ReturnType<typeof listAllHydratedWorkItems>>[number],
): AssistantDocumentCandidate {
  const fileName =
    item.currentEvidence?.fileName || (item.documentUrl ? path.basename(item.documentUrl) : null);
  const expectedDocument =
    item.workflow.requiredDocumentLabel ||
    inferRequiredDocumentLabel(item.title, item.category);

  return {
    id: `work-item-${item.id}`,
    source: "COMPLIANCE_PROOF",
    workItemId: item.id,
    title: item.title,
    owner: item.user.name || item.user.email,
    category: item.category,
    expectedDocument,
    status: item.status,
    uploadedAt: item.updatedAt.toISOString(),
    dueAt: item.deadline.toISOString(),
    fileUrl: item.documentUrl,
    fileName,
    documentId: item.currentEvidence?.documentId ?? null,
    documentVersionId: item.currentEvidence?.documentVersionId ?? null,
    extractedFields: item.currentEvidence?.extraction?.extractedFields ?? null,
    fingerprint: normalizeValue(
      [
        item.title,
        item.category,
        item.user.name || item.user.email,
        expectedDocument,
        fileName || "",
        item.status,
      ].join(" "),
    ),
    score: 0,
  };
}

async function enrichDocumentCandidate(candidate: AssistantDocumentCandidate) {
  if (!candidate.fileUrl) {
    const withoutFile = {
      ...candidate,
      verification: buildDocumentVerification(candidate),
    };

    await persistCandidateVerification(withoutFile);
    return withoutFile;
  }

  const preview = await loadCandidatePreview(candidate);
  const withPreview = {
    ...candidate,
    textPreview: preview.textPreview,
    readStatus: preview.readStatus,
    extractedFields: preview.extractedFields,
    documentId: preview.documentId,
    documentVersionId: preview.documentVersionId,
  };
  const enrichedCandidate = {
    ...withPreview,
    verification: buildDocumentVerification(withPreview),
  };

  await persistCandidateVerification(enrichedCandidate);
  return enrichedCandidate;
}

async function extractVisionPreviewFromDataUrl(dataUrl: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      textPreview: null,
      readStatus: "VISION_UNAVAILABLE" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0,
        max_completion_tokens: 450,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Transcribe the visible text from this business document, receipt, slip, or certificate. Return plain text only. If important fields like taxpayer name, receipt number, amount, or date are visible, include them in the transcription naturally. If the image is too unclear to read, answer only UNREADABLE.",
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        textPreview: null,
        readStatus: "VISION_UNAVAILABLE" as AssistantDocumentReadStatus,
      } satisfies {
        textPreview: string | null;
        readStatus: AssistantDocumentReadStatus;
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const cleaned = cleanExtractedText(content.replace(/^UNREADABLE$/i, "").trim());

    if (!cleaned) {
      return {
        textPreview: null,
        readStatus: "UNREADABLE" as AssistantDocumentReadStatus,
      } satisfies {
        textPreview: string | null;
        readStatus: AssistantDocumentReadStatus;
      };
    }

    return {
      textPreview: cleaned,
      readStatus: "VISION_EXTRACTED" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  } catch {
    return {
      textPreview: null,
      readStatus: "VISION_UNAVAILABLE" as AssistantDocumentReadStatus,
    } satisfies {
      textPreview: string | null;
      readStatus: AssistantDocumentReadStatus;
    };
  }
}

function isReceiptLikeQuery(query: string) {
  const normalized = normalizeValue(query);
  return (
    normalized.includes("document") ||
    normalized.includes("receipt") ||
    normalized.includes("verify") ||
    normalized.includes("verification") ||
    normalized.includes("mismatch") ||
    normalized.includes("match") ||
    normalized.includes("amount") ||
    normalized.includes("filing date") ||
    normalized.includes("payment date") ||
    normalized.includes("receipt number") ||
    normalized.includes("reference number") ||
    normalized.includes("certificate") ||
    normalized.includes("contract") ||
    normalized.includes("proof") ||
    normalized.includes("file") ||
    normalized.includes("upload") ||
    normalized.includes("attachment") ||
    normalized.includes("scan") ||
    normalized.includes("photo") ||
    normalized.includes("image") ||
    normalized.includes("permit") ||
    normalized.includes("licence") ||
    normalized.includes("license") ||
    normalized.includes("cr12")
  );
}

function scoreCandidate(candidate: AssistantDocumentCandidate, query: string, tokens: string[]) {
  const normalized = normalizeValue(query);
  let score = 0;

  if (tokens.length === 0) {
    score += candidate.fileUrl ? 1 : 0;
  }

  for (const token of tokens) {
    if (candidate.fingerprint.includes(token)) {
      score += token.length >= 5 ? 6 : 4;
    }
  }

  if (candidate.fileUrl) {
    score += 2;
  }

  if (normalized.includes("latest") || normalized.includes("recent") || normalized.includes("newest")) {
    score += new Date(candidate.uploadedAt).getTime() / 1_000_000_000_000;
  }

  if (normalized.includes("certificate") && candidate.source === "TRAINING_CERTIFICATE") {
    score += 6;
  }

  if (
    (normalized.includes("receipt") || normalized.includes("proof")) &&
    candidate.source === "COMPLIANCE_PROOF"
  ) {
    score += 5;
  }

  if (!candidate.fileUrl && (normalized.includes("missing") || normalized.includes("still"))) {
    score += 4;
  }

  if (
    candidate.source === "COMPLIANCE_PROOF" &&
    (
      normalized.includes("verify") ||
      normalized.includes("mismatch") ||
      normalized.includes("receipt") ||
      normalized.includes("amount") ||
      normalized.includes("filing date")
    )
  ) {
    score += 4;
  }

  return score;
}

function formatCandidateLine(candidate: AssistantDocumentCandidate) {
  const fileState = candidate.fileUrl ? "proof uploaded" : "proof missing";
  const duePart = candidate.dueAt ? `, due ${formatShortDate(candidate.dueAt)}` : "";
  const verificationPart = candidate.verification
    ? `, verification ${candidate.verification.status.toLowerCase().replaceAll("_", " ")}`
    : "";
  return `${candidate.title} (${candidate.owner}, ${candidate.category}${duePart}, ${fileState}${verificationPart})`;
}

function buildFallbackReply(query: string, matches: AssistantDocumentCandidate[], totals: {
  totalIndexed: number;
  totalWithFiles: number;
}) {
  if (matches.length === 0) {
    return [
      "Document search",
      `- I could not find a strong match for "${query}" in the current document scope.`,
      `- ${totals.totalWithFiles} uploaded files are indexed out of ${totals.totalIndexed} document-linked records.`,
      "",
      "Best next move",
      "- Try the exact task name, filing type, certificate number, or month.",
      "- If you expected proof to exist, check whether the task was submitted without an upload or the file was saved outside the app.",
    ].join("\n");
  }

  const bestMatch = matches[0];
  const lines = [
    "Document answer",
    bestMatch.fileUrl
      ? `- Yes. The strongest match is ${formatCandidateLine(bestMatch)}.`
      : `- I found the matching work item, but the proof is still missing: ${formatCandidateLine(bestMatch)}.`,
  ];

  if (bestMatch.fileName) {
    lines.push(`- File on record: ${bestMatch.fileName}.`);
  }

  if (bestMatch.verification) {
    lines.push(`- Verification status: ${bestMatch.verification.status.replaceAll("_", " ")}.`);
    for (const field of bestMatch.verification.fields.slice(0, 5)) {
      lines.push(`- ${field.label}: ${field.value || "Not confidently found"}.`);
    }
  }

  if (bestMatch.textPreview) {
    lines.push(`- Extracted preview: ${bestMatch.textPreview}`);
    if (bestMatch.readStatus === "VISION_EXTRACTED") {
      lines.push("- I read this preview using OCR from the uploaded scan.");
    }
  } else if (bestMatch.fileUrl) {
    if (bestMatch.readStatus === "UNSUPPORTED") {
      lines.push("- The file is on record, but I could not read its contents automatically.");
    } else if (bestMatch.readStatus === "VISION_UNAVAILABLE") {
      lines.push("- The file looks like a scan or image. Add an OpenAI key to enable OCR on photographed receipts and image-only PDFs.");
    } else if (bestMatch.readStatus === "UNREADABLE") {
      lines.push("- The file is on record, but the scan quality was too poor for reliable OCR.");
    } else if (bestMatch.readStatus === "MISSING_FILE") {
      lines.push("- The document link exists in the system, but the file was not readable from local storage.");
    }
  }

  if (bestMatch.verification?.mismatches.length) {
    lines.push("");
    lines.push("Automatic task cross-check");
    for (const mismatch of bestMatch.verification.mismatches.slice(0, 4)) {
      lines.push(
        `- ${mismatch.severity === "CRITICAL" ? "Mismatch" : "Watchout"}: ${mismatch.label} - ${mismatch.detail}`,
      );
    }
  } else if (bestMatch.verification?.status === "MATCHED") {
    lines.push("- No obvious mismatch was detected between the proof and the task.");
  }

  if (bestMatch.verification?.notes.length) {
    lines.push("");
    lines.push("Verification notes");
    for (const note of bestMatch.verification.notes.slice(0, 3)) {
      lines.push(`- ${note}`);
    }
  }

  if (matches.length > 1) {
    lines.push("");
    lines.push("Other possible matches");
    for (const [index, candidate] of matches.slice(1, 4).entries()) {
      lines.push(`${index + 1}. ${formatCandidateLine(candidate)}`);
    }
  }

  return lines.join("\n");
}

function buildContextText(matches: AssistantDocumentCandidate[], totals: {
  totalIndexed: number;
  totalWithFiles: number;
}) {
  const lines = [
    `Indexed document-linked records: ${totals.totalIndexed}`,
    `Records with uploaded files: ${totals.totalWithFiles}`,
    "Relevant document matches:",
  ];

  if (matches.length === 0) {
    lines.push("- No matching documents found.");
    return lines.join("\n");
  }

  for (const candidate of matches.slice(0, 5)) {
    lines.push(`- ${formatCandidateLine(candidate)}`);
    if (candidate.fileName) {
      lines.push(`  File: ${candidate.fileName}`);
    }
    if (candidate.verification) {
      lines.push(`  Verification status: ${candidate.verification.status}`);
      for (const field of candidate.verification.fields.slice(0, 5)) {
        lines.push(`  ${field.label}: ${field.value || "Not confidently found"}`);
      }
      for (const mismatch of candidate.verification.mismatches.slice(0, 3)) {
        lines.push(`  ${mismatch.severity}: ${mismatch.label} - ${mismatch.detail}`);
      }
    }
    if (candidate.textPreview) {
      const previewLabel =
        candidate.readStatus === "VISION_EXTRACTED" ? "  OCR preview:" : "  Preview:";
      lines.push(`${previewLabel} ${candidate.textPreview}`);
    }
  }

  return lines.join("\n");
}

export async function searchAssistantDocuments(input: {
  query: string;
  currentUser: AssistantDocumentUserContext | null;
}) {
  const isManager = canApproveRole(input.currentUser?.role);
  const certificateWhere =
    input.currentUser?.id && !isManager
      ? {
          attendance: {
            is: {
              userId: input.currentUser.id,
            },
          },
        }
      : undefined;

  const [workItems, certificates] = await Promise.all([
    input.currentUser?.organizationId
      ? listHydratedWorkItems({
          organizationId: input.currentUser.organizationId,
          organizationSlug: input.currentUser.organizationSlug || undefined,
          userId: input.currentUser.id,
          canManage: isManager,
        })
      : listAllHydratedWorkItems(),
    prisma.certificate.findMany({
      where: certificateWhere,
      select: {
        id: true,
        certificateNo: true,
        issueDate: true,
        fileUrl: true,
        attendance: {
          select: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
            training: {
              select: {
                title: true,
              },
            },
          },
        },
      },
      orderBy: [{ issueDate: "desc" }],
      take: 60,
    }),
  ]);

  const candidates: AssistantDocumentCandidate[] = [
    ...workItems.map((item) => buildWorkItemCandidate(item)),
    ...certificates.map((item) => {
      const trainingTitle = item.attendance.training.title;
      const parsedDocument = parseDocumentDownloadUrl(item.fileUrl || "");
      const fileName =
        parsedDocument?.documentVersionId && item.fileUrl
          ? null
          : item.fileUrl
            ? path.basename(item.fileUrl)
            : null;

      return {
        id: `certificate-${item.id}`,
        source: "TRAINING_CERTIFICATE" as const,
        title: `${trainingTitle} certificate ${item.certificateNo}`,
        owner: item.attendance.user.name || item.attendance.user.email,
        category: "Training Certificate",
        expectedDocument: "Certificate file",
        status: "Issued",
        uploadedAt: item.issueDate.toISOString(),
        fileUrl: item.fileUrl,
        fileName,
        documentId: parsedDocument?.documentId ?? null,
        documentVersionId: parsedDocument?.documentVersionId ?? null,
        fingerprint: normalizeValue(
          [
            trainingTitle,
            item.certificateNo,
            item.attendance.user.name || item.attendance.user.email,
            fileName || "",
            "certificate",
          ].join(" "),
        ),
        score: 0,
      };
    }),
  ];

  const tokens = tokenizeQuery(input.query);
  const hasDocumentIntent = isReceiptLikeQuery(input.query);

  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, input.query, tokens),
    }))
    .filter((candidate) => hasDocumentIntent ? candidate.score > 0 : candidate.fileUrl);

  const matches = scored
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
    })
    .slice(0, 5);

  const enriched = await Promise.all(matches.map((candidate) => enrichDocumentCandidate(candidate)));

  const mismatchCount = enriched.reduce(
    (sum, candidate) => sum + (candidate.verification?.mismatches.length || 0),
    0,
  );

  return {
    totalIndexed: candidates.length,
    totalWithFiles: candidates.filter((candidate) => Boolean(candidate.fileUrl)).length,
    matched: enriched,
    groundingLabel: `${enriched.length} document matches | ${candidates.filter((candidate) => Boolean(candidate.fileUrl)).length} uploaded files indexed | ${mismatchCount} verification flags`,
    contextText: buildContextText(enriched, {
      totalIndexed: candidates.length,
      totalWithFiles: candidates.filter((candidate) => Boolean(candidate.fileUrl)).length,
    }),
    fallbackReply: buildFallbackReply(input.query, enriched, {
      totalIndexed: candidates.length,
      totalWithFiles: candidates.filter((candidate) => Boolean(candidate.fileUrl)).length,
    }),
    suggestions: [
      "Do we already have the latest KRA receipt?",
      "Verify the latest proof against its task.",
      "What is the receipt number, amount, and filing date on the latest proof?",
      "Which approved tasks still have no proof on file?",
      "What certificates are already on file?",
    ],
  } satisfies AssistantDocumentSearchResult;
}

export function isAssistantDocumentQuery(query: string) {
  return isReceiptLikeQuery(query);
}

export async function verifyWorkItemDocumentById(input: {
  workItemId: number;
}): Promise<AssistantWorkItemProofVerificationResult | null> {
  const record = await prisma.workItem.findUnique({
    where: { id: input.workItemId },
    include: workItemDetailInclude,
  });

  if (!record || record.archivedAt) {
    return null;
  }

  const item = hydrateWorkItem(record);
  const candidate = buildWorkItemCandidate(item);
  const enriched = await enrichDocumentCandidate(candidate);

  return {
    candidate: enriched,
    reply: buildFallbackReply(item.title, [enriched], {
      totalIndexed: 1,
      totalWithFiles: enriched.fileUrl ? 1 : 0,
    }),
    groundingLabel: `proof verification | ${enriched.verification?.status.toLowerCase().replaceAll("_", " ") || "not checked"}`,
  };
}


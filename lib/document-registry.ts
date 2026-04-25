import { createHash } from "crypto";
import path from "path";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { get as getBlob, put as putBlob } from "@vercel/blob";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function loadFsPromises() {
  return import("fs/promises");
}

export type DocumentExtractionReadStatus =
  | "EXTRACTED"
  | "VISION_EXTRACTED"
  | "UNREADABLE"
  | "UNSUPPORTED"
  | "VISION_UNAVAILABLE"
  | "MISSING_FILE"
  | "UNAVAILABLE";

export interface DocumentExtractionSnapshot {
  id: number;
  readStatus: DocumentExtractionReadStatus;
  engine: string | null;
  textPreview: string | null;
  extractedText: string | null;
  extractedFields: Record<string, unknown> | null;
  extractedAt: string;
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

export const documentVersionWithExtractionInclude =
  Prisma.validator<Prisma.DocumentVersionInclude>()({
    extraction: true,
    document: {
      select: {
        id: true,
        title: true,
        sourceType: true,
        organizationId: true,
        clientEntityId: true,
        ownerUserId: true,
      },
    },
  });

export type DocumentVersionWithExtraction = Prisma.DocumentVersionGetPayload<{
  include: typeof documentVersionWithExtractionInclude;
}>;

function normalizeValue(value: string) {
  return value.toLowerCase().trim();
}

function cleanExtractedText(value: string, maxLength = 900) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeStorageSegment(value: string | null | undefined) {
  const safe = (value || "general").replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  return safe.length > 0 ? safe : "general";
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim();
  return normalized.length > 0 ? normalized : `document-${Date.now()}`;
}

function fileNameFromUrl(sourceUrl: string) {
  const withoutQuery = sourceUrl.split("?")[0] || sourceUrl;
  const parsed = path.posix.basename(withoutQuery);
  return sanitizeFileName(parsed || `legacy-document-${Date.now()}`);
}

function getExtensionFromName(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

function inferMimeType(extension: string, fallback?: string | null) {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function getImageMimeType(extension: string) {
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

function getPrivateStorageRoot() {
  const configuredRoot = process.env.PRIVATE_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return path.isAbsolute(configuredRoot)
      ? configuredRoot
      : path.join(/* turbopackIgnore: true */ process.cwd(), configuredRoot);
  }

  if (process.env.VERCEL) {
    return path.join("/tmp", "document-registry");
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), ".storage", "documents");
}

function getDocumentStorageProvider() {
  const configured = process.env.DOCUMENT_STORAGE_MODE?.trim().toUpperCase();

  if (configured === "LOCAL") {
    return "LOCAL_PRIVATE";
  }

  if (configured === "VERCEL_BLOB") {
    return "VERCEL_BLOB_PRIVATE";
  }

  if (process.env.BLOB_READ_WRITE_TOKEN?.trim() && process.env.VERCEL) {
    return "VERCEL_BLOB_PRIVATE";
  }

  return "LOCAL_PRIVATE";
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
      const hasDecimals = !Number.isInteger(parsed);
      return `KES ${parsed.toLocaleString("en-KE", {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2,
      })}`;
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
  const hasDecimals = !Number.isInteger(best);
  return `KES ${best.toLocaleString("en-KE", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
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
        display: formatFullDate(parsed),
        isoDate: parsed.toISOString(),
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
        display: formatFullDate(parsed),
        isoDate: parsed.toISOString(),
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

function buildExtractedFields(text: string) {
  return {
    receiptNumber: extractReceiptNumber(text),
    amount: extractAmount(text),
    documentDate: extractDocumentDate(text),
    taxPeriod: extractTaxPeriod(text),
    detectedKind: detectTaxType(text),
    hasKraSignals: /(?:kenya revenue authority|kra|itax)/i.test(text),
  };
}

async function extractVisionPreviewFromDataUrl(dataUrl: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      textPreview: null,
      extractedText: null,
      readStatus: "VISION_UNAVAILABLE" as DocumentExtractionReadStatus,
      engine: "OPENAI_VISION",
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
        extractedText: null,
        readStatus: "VISION_UNAVAILABLE" as DocumentExtractionReadStatus,
        engine: "OPENAI_VISION",
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
    const cleanedFullText = cleanExtractedText(content.replace(/^UNREADABLE$/i, "").trim(), 8000);
    const cleanedPreview = cleanExtractedText(content.replace(/^UNREADABLE$/i, "").trim());

    if (!cleanedPreview) {
      return {
        textPreview: null,
        extractedText: null,
        readStatus: "UNREADABLE" as DocumentExtractionReadStatus,
        engine: "OPENAI_VISION",
      };
    }

    return {
      textPreview: cleanedPreview,
      extractedText: cleanedFullText || cleanedPreview,
      readStatus: "VISION_EXTRACTED" as DocumentExtractionReadStatus,
      engine: "OPENAI_VISION",
    };
  } catch {
    return {
      textPreview: null,
      extractedText: null,
      readStatus: "VISION_UNAVAILABLE" as DocumentExtractionReadStatus,
      engine: "OPENAI_VISION",
    };
  }
}

async function extractPreviewFromBuffer(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
}) {
  const extension = getExtensionFromName(input.fileName);

  if (textExtensions.has(extension)) {
    const raw = input.buffer.toString("utf8");
    const textPreview = cleanExtractedText(raw);
    return {
      textPreview: textPreview.length > 0 ? textPreview : null,
      extractedText: cleanExtractedText(raw, 8000) || null,
      readStatus: (textPreview.length > 0 ? "EXTRACTED" : "UNSUPPORTED") as DocumentExtractionReadStatus,
      engine: "LOCAL_TEXT",
    };
  }

  if (extension === ".pdf" || input.mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: input.buffer });

    try {
      const parsed = await parser.getText();
      const cleanedFull = cleanExtractedText(parsed.text || "", 8000);
      const cleanedPreview = cleanExtractedText(parsed.text || "");

      if (cleanedPreview.length >= 48) {
        return {
          textPreview: cleanedPreview,
          extractedText: cleanedFull || cleanedPreview,
          readStatus: "EXTRACTED" as DocumentExtractionReadStatus,
          engine: "PDF_TEXT",
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
          textPreview: cleanedPreview.length > 0 ? cleanedPreview : null,
          extractedText: cleanedFull.length > 0 ? cleanedFull : null,
          readStatus: (cleanedPreview.length > 0 ? "EXTRACTED" : "UNSUPPORTED") as DocumentExtractionReadStatus,
          engine: "PDF_TEXT",
        };
      }

      const visionPreview = await extractVisionPreviewFromDataUrl(firstPage.dataUrl);

      if (visionPreview.readStatus === "VISION_EXTRACTED") {
        return visionPreview;
      }

      return {
        textPreview: cleanedPreview.length > 0 ? cleanedPreview : visionPreview.textPreview,
        extractedText: cleanedFull.length > 0 ? cleanedFull : visionPreview.extractedText,
        readStatus: cleanedPreview.length > 0 ? "EXTRACTED" : visionPreview.readStatus,
        engine: cleanedPreview.length > 0 ? "PDF_TEXT" : visionPreview.engine,
      };
    } finally {
      await parser.destroy();
    }
  }

  if (imageExtensions.has(extension) || input.mimeType?.startsWith("image/")) {
    const mimeType = input.mimeType || getImageMimeType(extension);
    return extractVisionPreviewFromDataUrl(
      `data:${mimeType};base64,${input.buffer.toString("base64")}`,
    );
  }

  return {
    textPreview: null,
    extractedText: null,
    readStatus: "UNSUPPORTED" as DocumentExtractionReadStatus,
    engine: "NONE",
  };
}

function buildStorageFingerprint(input: {
  sourceType: string;
  title?: string | null;
  fileName: string;
  ownerUserId?: number | null;
}) {
  return createHash("sha256")
    .update(
      [
        input.sourceType,
        input.title || "",
        input.fileName,
        input.ownerUserId ? String(input.ownerUserId) : "",
      ].join("|"),
    )
    .digest("hex");
}

async function writePrivateDocument(input: {
  buffer: Buffer;
  fileName: string;
  folder?: string | null;
}) {
  const safeName = sanitizeFileName(input.fileName);
  const now = new Date();
  const folder = sanitizeStorageSegment(input.folder);
  const relativeDir = path.join(
    folder,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
  );
  const uniqueName = `${Date.now()}-${safeName}`;
  const relativePath = path.join(relativeDir, uniqueName);
  const normalizedStorageKey = relativePath.replace(/\\/g, "/");
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  const fileExtension = getExtensionFromName(safeName);
  const storageProvider = getDocumentStorageProvider();

  if (storageProvider === "VERCEL_BLOB_PRIVATE") {
    const uploaded = await putBlob(normalizedStorageKey, input.buffer, {
      access: "private",
      addRandomSuffix: false,
      contentType: inferMimeType(fileExtension, null),
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return {
      storageProvider,
      storageKey: uploaded.pathname,
      sourceUrl: uploaded.url,
      checksum,
      byteSize: input.buffer.byteLength,
      fileExtension,
      fileName: safeName,
    };
  }

  const storageRoot = getPrivateStorageRoot();
  const absolutePath = path.join(storageRoot, relativePath);

  const { mkdir, writeFile } = await loadFsPromises();
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  return {
    storageProvider,
    storageKey: normalizedStorageKey,
    sourceUrl: null,
    checksum,
    byteSize: input.buffer.byteLength,
    fileExtension,
    fileName: safeName,
  };
}

function classifyLegacyStorage(sourceUrl: string) {
  if (sourceUrl.startsWith("/uploads/")) {
    return {
      storageProvider: "LEGACY_PUBLIC_UPLOAD",
      storageKey: sourceUrl,
    };
  }

  if (sourceUrl.startsWith("/tmp/uploads/")) {
    return {
      storageProvider: "LEGACY_TEMP_UPLOAD",
      storageKey: sourceUrl,
    };
  }

  return {
    storageProvider: "LEGACY_REMOTE_URL",
    storageKey: sourceUrl,
  };
}

function resolveLegacyDocumentPath(sourceUrl: string) {
  if (sourceUrl.startsWith("/uploads/")) {
    return path.join(/* turbopackIgnore: true */ process.cwd(), "public", sourceUrl.replace(/^\/+/, ""));
  }

  if (sourceUrl.startsWith("/tmp/uploads/")) {
    return sourceUrl;
  }

  return null;
}

export function buildDocumentDownloadUrl(documentId: number, documentVersionId?: number | null) {
  const versionQuery =
    typeof documentVersionId === "number" ? `?version=${documentVersionId}` : "";
  return `/api/documents/${documentId}/download${versionQuery}`;
}

export function parseDocumentDownloadUrl(fileUrl: string) {
  const match = fileUrl.match(/^\/api\/documents\/(\d+)\/download(?:\?(.+))?$/);
  if (!match) {
    return null;
  }

  const documentId = Number(match[1]);
  if (!Number.isFinite(documentId)) {
    return null;
  }

  const params = new URLSearchParams(match[2] || "");
  const rawVersion = params.get("version");
  const documentVersionId =
    rawVersion && Number.isFinite(Number(rawVersion)) ? Number(rawVersion) : null;

  return {
    documentId,
    documentVersionId,
  };
}

export async function registerDocumentUpload(
  db: DbClient,
  input: {
    buffer: Buffer;
    fileName: string;
    mimeType?: string | null;
    folder?: string | null;
    title?: string | null;
    sourceType?: string | null;
    organizationId?: number | null;
    clientEntityId?: number | null;
    ownerUserId?: number | null;
    uploadedById?: number | null;
    existingDocumentId?: number | null;
  },
) {
  const sourceType = (input.sourceType || "GENERAL").trim() || "GENERAL";
  const storage = await writePrivateDocument({
    buffer: input.buffer,
    fileName: input.fileName,
    folder: input.folder,
  });

  let documentId = input.existingDocumentId ?? null;

  if (documentId) {
    await db.documentVersion.updateMany({
      where: {
        documentId,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
      },
    });
  } else {
    const createdDocument = await db.document.create({
      data: {
        title: input.title?.trim() || storage.fileName,
        sourceType,
        status: "ACTIVE",
        fingerprint: buildStorageFingerprint({
          sourceType,
          title: input.title,
          fileName: storage.fileName,
          ownerUserId: input.ownerUserId,
        }),
        organizationId: input.organizationId ?? null,
        clientEntityId: input.clientEntityId ?? null,
        ownerUserId: input.ownerUserId ?? null,
      },
      select: {
        id: true,
      },
    });

    documentId = createdDocument.id;
  }

  const latestVersion = await db.documentVersion.findFirst({
    where: { documentId },
    orderBy: [{ versionNumber: "desc" }],
    select: { versionNumber: true },
  });

  const version = await db.documentVersion.create({
    data: {
      documentId,
      versionNumber: (latestVersion?.versionNumber || 0) + 1,
      isCurrent: true,
      fileName: storage.fileName,
      mimeType: inferMimeType(storage.fileExtension, input.mimeType),
      fileExtension: storage.fileExtension,
      storageProvider: storage.storageProvider,
      storageKey: storage.storageKey,
      sourceUrl: storage.sourceUrl,
      byteSize: storage.byteSize,
      checksum: storage.checksum,
      uploadedById: input.uploadedById ?? null,
    },
    include: documentVersionWithExtractionInclude,
  });

  const extraction = await ensureDocumentVersionExtraction(db, version.id);

  return {
    documentId,
    documentVersionId: version.id,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    fileUrl: buildDocumentDownloadUrl(documentId, version.id),
    extraction,
  };
}

function parseFileNameFromContentDisposition(value: string | null) {
  if (!value) {
    return null;
  }

  const utfMatch = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return sanitizeFileName(decodeURIComponent(utfMatch[1].trim().replace(/^"+|"+$/g, "")));
    } catch {
      return sanitizeFileName(utfMatch[1].trim().replace(/^"+|"+$/g, ""));
    }
  }

  const simpleMatch = value.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (simpleMatch?.[2]) {
    return sanitizeFileName(simpleMatch[2].trim());
  }

  return null;
}

export async function registerRemoteDocumentUpload(
  db: DbClient,
  input: {
    sourceUrl: string;
    fileName?: string | null;
    folder?: string | null;
    title?: string | null;
    sourceType?: string | null;
    organizationId?: number | null;
    clientEntityId?: number | null;
    ownerUserId?: number | null;
    uploadedById?: number | null;
    existingDocumentId?: number | null;
  },
) {
  const response = await fetch(input.sourceUrl);

  if (!response.ok) {
    throw new Error(`Remote document fetch failed with ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentDisposition = response.headers.get("content-disposition");
  const resolvedFileName =
    input.fileName?.trim() ||
    parseFileNameFromContentDisposition(contentDisposition) ||
    fileNameFromUrl(input.sourceUrl);

  return registerDocumentUpload(db, {
    buffer,
    fileName: resolvedFileName,
    mimeType: response.headers.get("content-type"),
    folder: input.folder,
    title: input.title,
    sourceType: input.sourceType,
    organizationId: input.organizationId,
    clientEntityId: input.clientEntityId,
    ownerUserId: input.ownerUserId,
    uploadedById: input.uploadedById,
    existingDocumentId: input.existingDocumentId,
  });
}

export async function registerLegacyDocumentVersion(
  db: DbClient,
  input: {
    sourceUrl: string;
    fileName?: string | null;
    title?: string | null;
    sourceType?: string | null;
    organizationId?: number | null;
    clientEntityId?: number | null;
    ownerUserId?: number | null;
    uploadedById?: number | null;
  },
) {
  const fileName = sanitizeFileName(input.fileName?.trim() || fileNameFromUrl(input.sourceUrl));
  const sourceType = (input.sourceType || "GENERAL").trim() || "GENERAL";
  const storage = classifyLegacyStorage(input.sourceUrl);

  const document = await db.document.create({
    data: {
      title: input.title?.trim() || fileName,
      sourceType,
      status: "ACTIVE",
      fingerprint: buildStorageFingerprint({
        sourceType,
        title: input.title,
        fileName,
        ownerUserId: input.ownerUserId,
      }),
      organizationId: input.organizationId ?? null,
      clientEntityId: input.clientEntityId ?? null,
      ownerUserId: input.ownerUserId ?? null,
    },
    select: { id: true },
  });

  const version = await db.documentVersion.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      isCurrent: true,
      fileName,
      mimeType: inferMimeType(getExtensionFromName(fileName), null),
      fileExtension: getExtensionFromName(fileName),
      storageProvider: storage.storageProvider,
      storageKey: storage.storageKey,
      sourceUrl: input.sourceUrl,
      uploadedById: input.uploadedById ?? null,
    },
    include: documentVersionWithExtractionInclude,
  });

  await ensureDocumentVersionExtraction(db, version.id);

  return {
    documentId: document.id,
    documentVersionId: version.id,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    fileUrl: buildDocumentDownloadUrl(document.id, version.id),
  };
}

async function readStoredDocumentBuffer(version: {
  storageProvider: string;
  storageKey: string;
  sourceUrl?: string | null;
}) {
  if (version.storageProvider === "LOCAL_PRIVATE") {
    const absolutePath = path.join(getPrivateStorageRoot(), version.storageKey);
    const { readFile } = await loadFsPromises();
    return readFile(absolutePath);
  }

  if (version.storageProvider === "VERCEL_BLOB_PRIVATE") {
    const stored = await getBlob(version.storageKey, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    if (!stored || stored.statusCode !== 200 || !stored.stream) {
      return null;
    }

    return Buffer.from(await new Response(stored.stream).arrayBuffer());
  }

  if (
    version.storageProvider === "LEGACY_PUBLIC_UPLOAD" ||
    version.storageProvider === "LEGACY_TEMP_UPLOAD"
  ) {
    const legacyPath = resolveLegacyDocumentPath(version.storageKey);
    if (!legacyPath) {
      return null;
    }

    const { readFile } = await loadFsPromises();
    return readFile(legacyPath);
  }

  if (version.storageProvider === "LEGACY_REMOTE_URL") {
    const remoteUrl = version.sourceUrl?.trim() || version.storageKey;

    if (!remoteUrl) {
      return null;
    }

    const response = await fetch(remoteUrl);
    if (!response.ok) {
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  }

  return null;
}

export async function migrateLegacyDocumentVersionStorage(
  db: DbClient,
  documentVersionId: number,
) {
  const version = await db.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          organizationId: true,
          clientEntityId: true,
          ownerUserId: true,
        },
      },
    },
  });

  if (!version) {
    return null;
  }

  if (
    version.storageProvider !== "LEGACY_PUBLIC_UPLOAD" &&
    version.storageProvider !== "LEGACY_TEMP_UPLOAD" &&
    version.storageProvider !== "LEGACY_REMOTE_URL"
  ) {
    return version;
  }

  const buffer = await readStoredDocumentBuffer(version);

  if (!buffer) {
    return null;
  }

  const storage = await writePrivateDocument({
    buffer,
    fileName: version.fileName,
    folder: "registry-migration",
  });

  return db.documentVersion.update({
    where: { id: version.id },
    data: {
      storageProvider: storage.storageProvider,
      storageKey: storage.storageKey,
      sourceUrl: storage.sourceUrl,
      byteSize: storage.byteSize,
      checksum: storage.checksum,
      fileExtension: storage.fileExtension,
      mimeType: version.mimeType || inferMimeType(storage.fileExtension, null),
    },
  });
}

export async function ensureDocumentVersionExtraction(
  db: DbClient,
  documentVersionId: number,
) {
  const version = await db.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: documentVersionWithExtractionInclude,
  });

  if (!version) {
    return null;
  }

  if (version.extraction) {
    return {
      id: version.extraction.id,
      readStatus: version.extraction.readStatus as DocumentExtractionReadStatus,
      engine: version.extraction.engine,
      textPreview: version.extraction.textPreview,
      extractedText: version.extraction.extractedText,
      extractedFields:
        (version.extraction.extractedFields as Record<string, unknown> | null) ?? null,
      extractedAt: version.extraction.extractedAt.toISOString(),
    } satisfies DocumentExtractionSnapshot;
  }

  let buffer: Buffer | null = null;
  let readStatus: DocumentExtractionReadStatus = "UNAVAILABLE";
  let textPreview: string | null = null;
  let extractedText: string | null = null;
  let engine: string | null = null;

  try {
    buffer = await readStoredDocumentBuffer(version);
    if (!buffer) {
      readStatus = "UNAVAILABLE";
    }
  } catch {
    readStatus = "MISSING_FILE";
  }

  if (buffer) {
    try {
      const extracted = await extractPreviewFromBuffer({
        buffer,
        fileName: version.fileName,
        mimeType: version.mimeType,
      });
      readStatus = extracted.readStatus;
      textPreview = extracted.textPreview;
      extractedText = extracted.extractedText;
      engine = extracted.engine;
    } catch {
      readStatus = "UNREADABLE";
      textPreview = null;
      extractedText = null;
      engine = "NONE";
    }
  }

  const extractedFields =
    extractedText && extractedText.trim().length > 0
      ? buildExtractedFields(extractedText)
      : null;

  const extraction = await db.documentExtraction.create({
    data: {
      documentId: version.documentId,
      documentVersionId: version.id,
      readStatus,
      engine,
      textPreview,
      extractedText,
      extractedFields:
        extractedFields === null
          ? Prisma.JsonNull
          : (extractedFields as Prisma.InputJsonValue),
    },
  });

  return {
    id: extraction.id,
    readStatus: extraction.readStatus as DocumentExtractionReadStatus,
    engine: extraction.engine,
    textPreview: extraction.textPreview,
    extractedText: extraction.extractedText,
    extractedFields: extractedFields ?? null,
    extractedAt: extraction.extractedAt.toISOString(),
  } satisfies DocumentExtractionSnapshot;
}

export async function upsertWorkItemDocumentVerification(
  input: {
    documentId: number;
    documentVersionId: number;
    workItemId: number;
    status: string;
    summary?: string | null;
    fields?: unknown;
    mismatches?: unknown;
    notes?: unknown;
    verificationSource?: string;
  },
) {
  const verificationSource = input.verificationSource || "ASSISTANT_AUTO";

  await prisma.documentVerification.upsert({
    where: {
      documentVersionWorkItemVerification: {
        documentVersionId: input.documentVersionId,
        workItemId: input.workItemId,
        verificationSource,
      },
    },
    update: {
      status: input.status,
      summary: input.summary?.trim() || null,
      fields: input.fields as Prisma.InputJsonValue | undefined,
      mismatches: input.mismatches as Prisma.InputJsonValue | undefined,
      notes: input.notes as Prisma.InputJsonValue | undefined,
      verifiedAt: new Date(),
    },
    create: {
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      workItemId: input.workItemId,
      status: input.status,
      verificationSource,
      summary: input.summary?.trim() || null,
      fields: input.fields as Prisma.InputJsonValue | undefined,
      mismatches: input.mismatches as Prisma.InputJsonValue | undefined,
      notes: input.notes as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function resolveDocumentVersionBinary(input: {
  documentId: number;
  documentVersionId?: number | null;
}) {
  const version = await prisma.documentVersion.findFirst({
    where: {
      documentId: input.documentId,
      ...(typeof input.documentVersionId === "number"
        ? { id: input.documentVersionId }
        : { isCurrent: true }),
    },
    orderBy: [{ isCurrent: "desc" }, { versionNumber: "desc" }, { id: "desc" }],
    include: {
      document: {
        select: {
          id: true,
          organizationId: true,
          ownerUserId: true,
          title: true,
        },
      },
    },
  });

  if (!version) {
    return null;
  }

  let buffer: Buffer | null = null;

  buffer = await readStoredDocumentBuffer(version);

  if (!buffer) {
    return null;
  }

  return {
    buffer,
    version,
    mimeType: version.mimeType || inferMimeType(version.fileExtension || "", null),
    fileName: version.fileName,
  };
}

export async function ensureLegacyEvidenceDocumentsBackfilled(input?: {
  organizationId?: number;
}) {
  const missingEvidence = await prisma.workItemEvidence.findMany({
    where: {
      documentId: null,
      workItem: {
        archivedAt: null,
        ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
      },
    },
    include: {
      workItem: {
        select: {
          id: true,
          title: true,
          organizationId: true,
          clientEntityId: true,
          userId: true,
          legacyComplianceItemId: true,
        },
      },
    },
    orderBy: [{ id: "asc" }],
  });

  if (missingEvidence.length === 0) {
    return 0;
  }

  for (const evidence of missingEvidence) {
    const legacyDocument = await registerLegacyDocumentVersion(prisma, {
      sourceUrl: evidence.fileUrl,
      fileName: evidence.fileName,
      title: evidence.label || `${evidence.workItem.title} proof`,
      sourceType: "WORK_ITEM_EVIDENCE",
      organizationId: evidence.workItem.organizationId,
      clientEntityId: evidence.workItem.clientEntityId,
      ownerUserId: evidence.workItem.userId,
      uploadedById: evidence.uploadedById,
    });

    await prisma.workItemEvidence.update({
      where: { id: evidence.id },
      data: {
        fileUrl: legacyDocument.fileUrl,
        fileName: legacyDocument.fileName,
        documentId: legacyDocument.documentId,
        documentVersionId: legacyDocument.documentVersionId,
      },
    });

  }

  return missingEvidence.length;
}



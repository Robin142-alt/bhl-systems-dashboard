import { NextResponse } from "next/server";
import { OpsEventTopic, Prisma } from "@prisma/client";
import { enqueueOpsEvent, processOpsEventById } from "@/lib/ops-events";
import { normalizeKenyanPhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type InboundBody = Record<string, FormDataEntryValue | FormDataEntryValue[] | unknown>;

function readHeaderSecret(request: Request) {
  return (
    request.headers.get("x-whatsapp-intake-secret") ||
    request.headers.get("x-intake-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

async function readInboundBody(request: Request): Promise<InboundBody> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return ((await request.json().catch(() => ({}))) || {}) as InboundBody;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const body: InboundBody = {};

    for (const [key, value] of formData.entries()) {
      const existing = body[key];
      if (typeof existing === "undefined") {
        body[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        body[key] = [existing as FormDataEntryValue, value];
      }
    }

    return body;
  }

  const raw = await request.text().catch(() => "");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as InboundBody;
  } catch {
    return { raw };
  }
}

function coerceString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coerceStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => coerceString(entry)).filter(Boolean);
  }

  const single = coerceString(value);
  return single ? [single] : [];
}

function buildRawSnapshot(body: InboundBody): Prisma.InputJsonObject {
  const snapshot: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      snapshot[key] = value.map((entry) => coerceString(entry));
      continue;
    }

    const single = coerceString(value);
    snapshot[key] = single.length > 0 ? single : null;
  }

  return snapshot as Prisma.InputJsonObject;
}

function normalizeInboundPayload(body: InboundBody) {
  const sender =
    coerceString(body.from) ||
    coerceString(body.sender) ||
    coerceString(body.phoneNumber) ||
    coerceString(body.msisdn) ||
    coerceString(body.source);
  const message =
    coerceString(body.text) ||
    coerceString(body.message) ||
    coerceString(body.body) ||
    coerceString(body.content);
  const mediaUrls = [
    ...coerceStringArray(body.mediaUrl),
    ...coerceStringArray(body.mediaUrls),
    ...coerceStringArray(body.attachmentUrl),
    ...coerceStringArray(body.attachments),
  ];
  const workItemMatch =
    message.match(/(?:task|work item|item)\s+#?(\d+)/i) || message.match(/#(\d+)/);

  return {
    sender,
    normalizedSender: normalizeKenyanPhoneNumber(sender),
    message,
    mediaUrls,
    attachmentCount: mediaUrls.length,
    workItemId: workItemMatch ? Number(workItemMatch[1]) : null,
  };
}

async function handleInbound(request: Request) {
  const configuredSecret = process.env.WHATSAPP_INTAKE_SECRET?.trim();
  const providedSecret = readHeaderSecret(request);

  if (!configuredSecret) {
    return NextResponse.json(
      { error: "WhatsApp intake is not configured." },
      { status: 503 },
    );
  }

  if (configuredSecret !== providedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readInboundBody(request);
  const payload = normalizeInboundPayload(body);

  if (!payload.normalizedSender) {
    return NextResponse.json(
      { error: "Missing sender phone number." },
      { status: 400 },
    );
  }

  const matchedUser = await prisma.user.findFirst({
    where: {
      phoneNumber: payload.normalizedSender,
      isActive: true,
    },
    select: {
      id: true,
      organizationId: true,
    },
  });

  const linkedWorkItem =
    payload.workItemId && matchedUser?.organizationId
      ? await prisma.workItem.findFirst({
          where: {
            id: payload.workItemId,
            organizationId: matchedUser.organizationId,
            archivedAt: null,
          },
          select: {
            id: true,
            clientEntityId: true,
          },
        })
      : null;

  const eventId = await enqueueOpsEvent(prisma, {
    topic: OpsEventTopic.WHATSAPP_INTAKE_RECEIVED,
    organizationId: matchedUser?.organizationId ?? null,
    clientEntityId: linkedWorkItem?.clientEntityId ?? null,
    workItemId: linkedWorkItem?.id ?? null,
    payload: {
      sender: payload.normalizedSender,
      message: payload.message || null,
      mediaUrls: payload.mediaUrls,
      attachmentCount: payload.attachmentCount,
      matchedUserId: matchedUser?.id ?? null,
      rawSnapshot: buildRawSnapshot(body),
    } satisfies Prisma.InputJsonObject,
  });

  const report = await processOpsEventById(eventId);

  return NextResponse.json({
    accepted: true,
    matchedUserId: matchedUser?.id ?? null,
    linkedWorkItemId: linkedWorkItem?.id ?? null,
    eventId,
    summary: report?.summary || "Inbound WhatsApp was accepted.",
  });
}

export async function POST(request: Request) {
  return handleInbound(request);
}

export async function GET(request: Request) {
  return handleInbound(request);
}

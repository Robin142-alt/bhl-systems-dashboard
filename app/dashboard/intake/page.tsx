import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox, MessageSquareText, Paperclip, ShieldCheck } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canApproveRole } from "@/lib/compliance-workflow";
import { buildDocumentDownloadUrl } from "@/lib/document-registry-urls";
import { ensureScopedUserByEmail } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDateTime(value?: Date | string | null) {
  if (!value) {
    return "No timestamp";
  }

  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
        {icon}
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function readPayloadValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return null;
  }

  return (payload as Record<string, unknown>)[key];
}

function readString(payload: unknown, key: string) {
  const value = readPayloadValue(payload, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(payload: unknown, key: string) {
  const value = readPayloadValue(payload, key);
  return typeof value === "number" ? value : null;
}

function readIngestedDocuments(payload: unknown) {
  const value = readPayloadValue(payload, "ingestedDocuments");
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const documentId = typeof raw.documentId === "number" ? raw.documentId : null;
      const documentVersionId =
        typeof raw.documentVersionId === "number" ? raw.documentVersionId : null;
      const fileName = typeof raw.fileName === "string" ? raw.fileName : "Attachment";

      if (!documentId || !documentVersionId) {
        return null;
      }

      return {
        documentId,
        documentVersionId,
        fileName,
        fileUrl: buildDocumentDownloadUrl(documentId, documentVersionId),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export default async function IntakeInboxPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user?.email
    ? await ensureScopedUserByEmail(session.user.email)
    : null;

  if (!currentUser) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">WhatsApp Intake</h1>
        <p className="mt-3 text-sm text-slate-500">Sign in to view inbound WhatsApp intake.</p>
      </div>
    );
  }

  if (!canApproveRole(currentUser.role)) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">WhatsApp Intake</h1>
        <p className="mt-3 text-sm text-slate-500">
          This inbox is reserved for managers because it is designed for intake triage and evidence routing.
        </p>
      </div>
    );
  }

  const events = await prisma.opsEvent.findMany({
    where: {
      organizationId: currentUser.organizationId,
      topic: "WHATSAPP_INTAKE_RECEIVED",
    },
    include: {
      workItem: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 40,
  });

  const linkedCount = events.filter((event) => Boolean(event.workItemId)).length;
  const attachmentCount = events.reduce(
    (sum, event) => sum + (readNumber(event.payload, "attachmentCount") || 0),
    0,
  );
  const ingestedCount = events.reduce(
    (sum, event) => sum + readIngestedDocuments(event.payload).length,
    0,
  );

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="text-blue-600" size={24} />
              <h1 className="text-3xl font-black text-slate-900">WhatsApp Intake Inbox</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This is the triage view for inbound WhatsApp messages, linked work items, and ingested attachments now stored in the document registry.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/decisions"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-300"
            >
              Open Decision Ops
            </Link>
            <Link
              href="/tasks"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-700"
            >
              Open Task Board
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <SummaryCard
          label="Inbound Messages"
          value={events.length.toString()}
          icon={<MessageSquareText size={22} />}
          tone="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          label="Linked To Work"
          value={linkedCount.toString()}
          icon={<ShieldCheck size={22} />}
          tone="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="Attachments Ingested"
          value={`${ingestedCount}/${attachmentCount}`}
          icon={<Paperclip size={22} />}
          tone="bg-amber-100 text-amber-700"
        />
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-2xl font-black text-slate-900">Recent Intake</h2>
          <p className="mt-2 text-sm text-slate-500">
            Use task references like <code>#123</code> in WhatsApp messages to auto-link intake to a work item.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {events.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">No inbound WhatsApp intake has been received yet.</div>
          ) : (
            events.map((event) => {
              const sender = readString(event.payload, "sender") || "Unknown sender";
              const message = readString(event.payload, "message");
              const attachments = readIngestedDocuments(event.payload);
              const attachmentTotal = readNumber(event.payload, "attachmentCount") || 0;

              return (
                <div key={event.id} className="space-y-4 px-6 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                          {event.status}
                        </span>
                        {event.workItem ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                            Linked
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                            Triage
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-lg font-black text-slate-900">{sender}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {message || "No message body was captured for this intake event."}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                      <div>{formatDateTime(event.createdAt)}</div>
                      <div className="mt-1">Attachments reported: {attachmentTotal}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Linked Work</p>
                      {event.workItem ? (
                        <div className="mt-2">
                          <Link href="/tasks" className="font-semibold text-slate-900 hover:text-blue-700">
                            {event.workItem.title}
                          </Link>
                          <p className="mt-1 text-slate-500">Work item #{event.workItem.id}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-slate-500">This intake has not been linked to a work item yet.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Registry Attachments</p>
                      {attachments.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {attachments.map((attachment) => (
                            <div key={`${event.id}-${attachment.documentVersionId}`}>
                              <a
                                href={attachment.fileUrl}
                                className="font-semibold text-slate-900 hover:text-blue-700"
                              >
                                {attachment.fileName}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-slate-500">No attachment has been ingested into the registry yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

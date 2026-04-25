import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Bot, ClipboardCheck, ShieldCheck, Zap } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canApproveRole } from "@/lib/compliance-workflow";
import { getDecisionOpsSnapshot, listDecisionOps } from "@/lib/decision-ops";
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

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function priorityTone(priority: string) {
  if (priority === "CRITICAL") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  if (priority === "HIGH") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: ReactNode;
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

export default async function DecisionOpsPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user?.email
    ? await ensureScopedUserByEmail(session.user.email)
    : null;

  if (!currentUser) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Decision Ops</h1>
        <p className="mt-3 text-sm text-slate-500">Sign in to view the live decision and ops control center.</p>
      </div>
    );
  }

  if (!canApproveRole(currentUser.role)) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Decision Ops</h1>
        <p className="mt-3 text-sm text-slate-500">
          This view is reserved for managers because it contains decision queues, ops events, and copilot quality traces.
        </p>
      </div>
    );
  }

  const [snapshot, decisions, recentEvents, recentTraces] = await Promise.all([
    getDecisionOpsSnapshot({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
    }),
    listDecisionOps({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
    }),
    prisma.opsEvent.findMany({
      where: {
        organizationId: currentUser.organizationId,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
    }),
    prisma.assistantTrace.findMany({
      where: {
        organizationId: currentUser.organizationId,
      },
      include: {
        evaluations: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
    }),
  ]);

  const averageTraceScore =
    recentTraces.length > 0
      ? recentTraces.reduce((sum, trace) => sum + (trace.evaluations[0]?.overallScore || 0), 0) /
        recentTraces.length
      : 0;
  const whatsappIntakeConfigured = Boolean(process.env.WHATSAPP_INTAKE_SECRET?.trim());

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-blue-600" size={24} />
              <h1 className="text-3xl font-black text-slate-900">Decision Ops Control Center</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This is the management surface for decision queues, registry-backed ops events, and copilot trace quality. It is built to show where work is waiting, where automation is failing, and whether the assistant is helping with enough grounding and actionability.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/tasks"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-700"
            >
              Open Manager Inbox
            </Link>
            <Link
              href="/dashboard/reports"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-300"
            >
              WhatsApp Console
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Open Decisions"
          value={snapshot.openCount.toString()}
          tone="bg-blue-100 text-blue-700"
          icon={<ClipboardCheck size={22} />}
        />
        <SummaryCard
          label="High Priority"
          value={snapshot.highPriorityCount.toString()}
          tone="bg-amber-100 text-amber-700"
          icon={<AlertTriangle size={22} />}
        />
        <SummaryCard
          label="Due Soon"
          value={snapshot.dueSoonCount.toString()}
          tone="bg-rose-100 text-rose-700"
          icon={<Zap size={22} />}
        />
        <SummaryCard
          label="Copilot Avg Score"
          value={`${Math.round(averageTraceScore * 100)}%`}
          tone="bg-emerald-100 text-emerald-700"
          icon={<Bot size={22} />}
        />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.55fr_1fr]">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-2xl font-black text-slate-900">Live Decision Queue</h2>
            <p className="mt-2 text-sm text-slate-500">
              Open approvals, document decisions, escalations, and payment releases generated from the live work graph.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {decisions.length === 0 ? (
              <div className="px-6 py-8 text-sm text-slate-500">No open decisions are waiting right now.</div>
            ) : (
              decisions.map((decision) => (
                <div key={decision.id} className="space-y-4 px-6 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${priorityTone(decision.priority)}`}
                        >
                          {decision.priority}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                          {formatLabel(decision.kind)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-slate-900">{decision.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {decision.summary || "No decision summary was recorded."}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                      <div>Due: {formatDateTime(decision.dueAt)}</div>
                      <div className="mt-1">
                        Assignee: {decision.assignedTo?.name || decision.assignedTo?.email || "Unassigned"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Work Item</p>
                      {decision.workItem ? (
                        <div className="mt-2">
                          <Link href="/tasks" className="font-semibold text-slate-900 hover:text-blue-700">
                            {decision.workItem.title}
                          </Link>
                          <p className="mt-1 text-slate-500">
                            Owner: {decision.workItem.user.name || decision.workItem.user.email}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-slate-500">No linked work item.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Latest Audit</p>
                      {decision.auditEvents[0] ? (
                        <div className="mt-2">
                          <p className="font-semibold text-slate-900">{decision.auditEvents[0].detail}</p>
                          <p className="mt-1 text-slate-500">
                            {formatDateTime(decision.auditEvents[0].createdAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-slate-500">No decision audit event recorded yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">WhatsApp Intake</h2>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">Inbound webhook status</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                  {whatsappIntakeConfigured ? "Configured" : "Needs Secret"}
                </span>
              </div>
              <p>
                Route: <code>/api/notifications/whatsapp/inbound</code>
              </p>
              <p>
                To auto-link a message to work, include a task reference like <code>#123</code> in the WhatsApp text.
              </p>
              <p className="text-slate-500">
                Inbound messages are stored as auditable ops events and, when a task is matched, they are written into that task&apos;s audit history.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">Recent Ops Events</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {recentEvents.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500">No ops events have been recorded yet.</div>
              ) : (
                recentEvents.map((event) => (
                  <div key={event.id} className="px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-900">{formatLabel(event.topic)}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                        {formatLabel(event.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {event.lastError || "Processed without a recorded error."}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">{formatDateTime(event.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">Copilot Traces</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {recentTraces.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500">No assistant traces have been graded yet.</div>
              ) : (
                recentTraces.map((trace) => (
                  <div key={trace.id} className="px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-900">{trace.toolName || "General copilot"}</p>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                        {Math.round((trace.evaluations[0]?.overallScore || 0) * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 line-clamp-3">{trace.replyPreview}</p>
                    <p className="mt-2 text-xs text-slate-400">{formatDateTime(trace.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

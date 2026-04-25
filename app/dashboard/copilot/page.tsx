import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Bot, Gauge, ShieldCheck } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canApproveRole } from "@/lib/compliance-workflow";
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

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
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

function scoreTone(score: number) {
  if (score >= 0.8) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (score >= 0.65) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

function toolLabel(value?: string | null) {
  if (!value) {
    return "general_copilot";
  }

  return value;
}

export default async function CopilotQualityPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user?.email
    ? await ensureScopedUserByEmail(session.user.email)
    : null;

  if (!currentUser) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Copilot Quality</h1>
        <p className="mt-3 text-sm text-slate-500">Sign in to review assistant quality and trace performance.</p>
      </div>
    );
  }

  if (!canApproveRole(currentUser.role)) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Copilot Quality</h1>
        <p className="mt-3 text-sm text-slate-500">
          This view is reserved for managers because it shows trace quality, grounding confidence, and weak assistant runs.
        </p>
      </div>
    );
  }

  const traces = await prisma.assistantTrace.findMany({
    where: {
      organizationId: currentUser.organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      evaluations: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
  });

  const evaluated = traces.filter((trace) => trace.evaluations[0]);
  const averageOverall =
    evaluated.length > 0
      ? evaluated.reduce((sum, trace) => sum + trace.evaluations[0]!.overallScore, 0) / evaluated.length
      : 0;
  const averageGrounding =
    evaluated.length > 0
      ? evaluated.reduce((sum, trace) => sum + trace.evaluations[0]!.groundingScore, 0) / evaluated.length
      : 0;
  const averageActionability =
    evaluated.length > 0
      ? evaluated.reduce((sum, trace) => sum + trace.evaluations[0]!.actionabilityScore, 0) / evaluated.length
      : 0;
  const lowScoreCount = evaluated.filter((trace) => trace.evaluations[0]!.overallScore < 0.65).length;

  const toolStats = Array.from(
    traces.reduce((map, trace) => {
      const key = toolLabel(trace.toolName);
      const current = map.get(key) || {
        name: key,
        count: 0,
        totalScore: 0,
        evaluatedCount: 0,
      };

      current.count += 1;
      if (trace.evaluations[0]) {
        current.totalScore += trace.evaluations[0].overallScore;
        current.evaluatedCount += 1;
      }
      map.set(key, current);
      return map;
    }, new Map<string, { name: string; count: number; totalScore: number; evaluatedCount: number }>())
      .values(),
  )
    .map((entry) => ({
      ...entry,
      averageScore: entry.evaluatedCount > 0 ? entry.totalScore / entry.evaluatedCount : 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return right.averageScore - left.averageScore;
    });

  const modeStats = Array.from(
    traces.reduce((map, trace) => {
      map.set(trace.mode, (map.get(trace.mode) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => right[1] - left[1]);

  const weakestTraces = evaluated
    .slice()
    .sort((left, right) => left.evaluations[0]!.overallScore - right.evaluations[0]!.overallScore)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="text-blue-600" size={24} />
              <h1 className="text-3xl font-black text-slate-900">Copilot Quality</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This is the performance console for the assistant. It shows which tools are used,
              how grounded the replies are, where weak traces are appearing, and whether the
              assistant is giving action-ready responses instead of generic chat.
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
              href="/dashboard/documents"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-700"
            >
              Open Document Registry
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Average Quality"
          value={formatPercent(averageOverall)}
          icon={<Gauge size={22} />}
          tone="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          label="Grounding"
          value={formatPercent(averageGrounding)}
          icon={<ShieldCheck size={22} />}
          tone="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="Actionability"
          value={formatPercent(averageActionability)}
          icon={<Bot size={22} />}
          tone="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          label="Weak Traces"
          value={lowScoreCount.toString()}
          icon={<AlertTriangle size={22} />}
          tone="bg-rose-100 text-rose-700"
        />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.15fr_1fr]">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-2xl font-black text-slate-900">Tool Performance</h2>
            <p className="mt-2 text-sm text-slate-500">
              Usage volume and average quality by copilot tool or fallback mode.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {toolStats.length === 0 ? (
              <div className="px-6 py-8 text-sm text-slate-500">No assistant traces have been recorded yet.</div>
            ) : (
              toolStats.map((tool) => (
                <div key={tool.name} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{tool.name.replaceAll("_", " ")}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {tool.count} trace{tool.count === 1 ? "" : "s"} recorded for this mode.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${scoreTone(
                        tool.averageScore,
                      )}`}
                    >
                      Avg {formatPercent(tool.averageScore)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                      Used {tool.count}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">Mode Split</h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              {modeStats.length === 0 ? (
                <p className="text-sm text-slate-500">No mode usage has been recorded yet.</p>
              ) : (
                modeStats.map(([mode, count]) => (
                  <div key={mode} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-900">{mode.replaceAll("-", " ")}</span>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                      {count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">Quality Rubric</h2>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-slate-600">
              <p>
                Grounding rewards replies that cite live context, stay in org scope, and use
                document search when needed.
              </p>
              <p>
                Actionability rewards direct next steps, decision-ready guidance, and practical
                drafts instead of abstract advice.
              </p>
              <p>
                Completeness rewards replies that actually finish the job with enough usable detail.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-2xl font-black text-slate-900">Weakest Recent Traces</h2>
          <p className="mt-2 text-sm text-slate-500">
            These are the replies most worth reviewing when you want to improve copilot quality.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {weakestTraces.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">No graded traces are available yet.</div>
          ) : (
            weakestTraces.map((trace) => {
              const evaluation = trace.evaluations[0]!;

              return (
                <div key={trace.id} className="space-y-4 px-6 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${scoreTone(
                            evaluation.overallScore,
                          )}`}
                        >
                          {formatPercent(evaluation.overallScore)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                          {toolLabel(trace.toolName).replaceAll("_", " ")}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-slate-900">{trace.query}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500 line-clamp-4">
                        {trace.replyPreview}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                      <div>{trace.user?.name || trace.user?.email || "Unknown user"}</div>
                      <div className="mt-1">{trace.mode.replaceAll("-", " ")}</div>
                      <div className="mt-1">{formatDateTime(trace.createdAt)}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    {[
                      ["Grounding", evaluation.groundingScore],
                      ["Actionability", evaluation.actionabilityScore],
                      ["Completeness", evaluation.completenessScore],
                    ].map(([label, score]) => (
                      <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
                        <p className="mt-2 text-2xl font-black text-slate-900">{formatPercent(Number(score))}</p>
                      </div>
                    ))}
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

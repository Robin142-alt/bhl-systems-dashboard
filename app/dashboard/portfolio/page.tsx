import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, BriefcaseBusiness, Building2, FolderKanban, ShieldAlert } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canApproveRole, hasActiveBlocker, isClosedStatus } from "@/lib/compliance-workflow";
import { listDecisionOps } from "@/lib/decision-ops";
import { ensureScopedUserByEmail } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { listHydratedWorkItems } from "@/lib/work-items";

export const dynamic = "force-dynamic";

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

interface PortfolioRow {
  id: string;
  name: string;
  code: string | null;
  openCount: number;
  blockedCount: number;
  overdueCount: number;
  waitingOnManagerCount: number;
  weakProofCount: number;
  decisionCount: number;
  heatScore: number;
  topExposure: string | null;
}

export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user?.email
    ? await ensureScopedUserByEmail(session.user.email)
    : null;

  if (!currentUser) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Portfolio Command</h1>
        <p className="mt-3 text-sm text-slate-500">Sign in to see the live portfolio view.</p>
      </div>
    );
  }

  if (!canApproveRole(currentUser.role)) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Portfolio Command</h1>
        <p className="mt-3 text-sm text-slate-500">
          This view is reserved for managers because it rolls up client-entity risk, proof quality, and decision pressure.
        </p>
      </div>
    );
  }

  const [clientEntities, items, decisions] = await Promise.all([
    prisma.clientEntity.findMany({
      where: {
        organizationId: currentUser.organizationId,
        isActive: true,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
      },
    }),
    listHydratedWorkItems({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
      canManage: true,
    }),
    listDecisionOps({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
    }),
  ]);

  const openItems = items.filter((item) => !isClosedStatus(item.status));
  const versionIds = openItems
    .map((item) => item.currentEvidence?.documentVersionId)
    .filter((value): value is number => typeof value === "number");
  const verifications = versionIds.length
    ? await prisma.documentVerification.findMany({
        where: {
          documentVersionId: { in: versionIds },
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

  const rows = new Map<string, PortfolioRow>();
  rows.set("internal", {
    id: "internal",
    name: "Internal Operations",
    code: null,
    openCount: 0,
    blockedCount: 0,
    overdueCount: 0,
    waitingOnManagerCount: 0,
    weakProofCount: 0,
    decisionCount: 0,
    heatScore: 0,
    topExposure: null,
  });

  for (const entity of clientEntities) {
    rows.set(String(entity.id), {
      id: String(entity.id),
      name: entity.name,
      code: entity.code,
      openCount: 0,
      blockedCount: 0,
      overdueCount: 0,
      waitingOnManagerCount: 0,
      weakProofCount: 0,
      decisionCount: 0,
      heatScore: 0,
      topExposure: null,
    });
  }

  for (const item of openItems) {
    const key = item.clientEntityId ? String(item.clientEntityId) : "internal";
    const row = rows.get(key);
    if (!row) {
      continue;
    }

    row.openCount += 1;

    if (hasActiveBlocker(item.workflow)) {
      row.blockedCount += 1;
      row.heatScore += 3;
    }

    if (item.deadline < new Date()) {
      row.overdueCount += 1;
      row.heatScore += 4;
    }

    if (item.status === "Submitted" || item.workflow.blocker?.needsManagerHelp) {
      row.waitingOnManagerCount += 1;
      row.heatScore += 2;
    }

    const verificationStatus = item.currentEvidence?.documentVersionId
      ? verificationMap.get(item.currentEvidence.documentVersionId)?.status || "UNVERIFIED"
      : "MISSING";
    if (
      item.status === "Submitted" ||
      (item.currentEvidence && verificationStatus !== "MATCHED") ||
      (!item.currentEvidence && item.workflow.requiredDocumentLabel)
    ) {
      if (!item.currentEvidence || verificationStatus !== "MATCHED") {
        row.weakProofCount += 1;
        row.heatScore += 2;
      }
    }

    if (!row.topExposure) {
      row.topExposure = `${item.title} due ${formatDate(item.deadline)}`;
    }
  }

  for (const decision of decisions) {
    const key = decision.clientEntityId ? String(decision.clientEntityId) : "internal";
    const row = rows.get(key);
    if (!row) {
      continue;
    }

    row.decisionCount += 1;
    row.heatScore += decision.priority === "CRITICAL" ? 4 : decision.priority === "HIGH" ? 3 : 1;
    if (!row.topExposure && decision.workItem) {
      row.topExposure = `${decision.workItem.title} waiting on ${decision.title.toLowerCase()}`;
    }
  }

  const rankedRows = Array.from(rows.values())
    .filter((row) => row.openCount > 0 || row.decisionCount > 0)
    .sort((left, right) => right.heatScore - left.heatScore);

  const entitiesAtRisk = rankedRows.filter((row) => row.heatScore >= 6).length;
  const blockedTotal = rankedRows.reduce((sum, row) => sum + row.blockedCount, 0);
  const overdueTotal = rankedRows.reduce((sum, row) => sum + row.overdueCount, 0);
  const weakProofTotal = rankedRows.reduce((sum, row) => sum + row.weakProofCount, 0);

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BriefcaseBusiness className="text-blue-600" size={24} />
              <h1 className="text-3xl font-black text-slate-900">Portfolio Command</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This view shows where client entities and internal operations are under pressure. It combines open work, blockers, overdue items, weak proof, and pending decisions so a manager can see exposure across the portfolio instead of one task at a time.
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

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Entities At Risk"
          value={entitiesAtRisk.toString()}
          icon={<Building2 size={22} />}
          tone="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          label="Blocked Work"
          value={blockedTotal.toString()}
          icon={<ShieldAlert size={22} />}
          tone="bg-rose-100 text-rose-700"
        />
        <SummaryCard
          label="Overdue"
          value={overdueTotal.toString()}
          icon={<AlertTriangle size={22} />}
          tone="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          label="Weak Proof"
          value={weakProofTotal.toString()}
          icon={<FolderKanban size={22} />}
          tone="bg-emerald-100 text-emerald-700"
        />
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-2xl font-black text-slate-900">Entity Heatmap</h2>
          <p className="mt-2 text-sm text-slate-500">
            Higher heat scores mean more overdue work, blocker pressure, weak proof, or pending decisions.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {rankedRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">No portfolio rows are active yet.</div>
          ) : (
            rankedRows.map((row) => (
              <div key={row.id} className="space-y-5 px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                        Heat {row.heatScore}
                      </span>
                      {row.code ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                          {row.code}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 text-xl font-black text-slate-900">{row.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {row.topExposure || "No single exposure is dominating this entity right now."}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                    <div>Open work: {row.openCount}</div>
                    <div className="mt-1">Open decisions: {row.decisionCount}</div>
                  </div>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-5">
                  {[
                    ["Blocked", row.blockedCount],
                    ["Overdue", row.overdueCount],
                    ["Waiting On Manager", row.waitingOnManagerCount],
                    ["Weak Proof", row.weakProofCount],
                    ["Open Decisions", row.decisionCount],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
                      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

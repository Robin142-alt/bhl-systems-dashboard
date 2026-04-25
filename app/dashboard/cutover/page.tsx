import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightLeft, Database, FolderKanban, MessageSquareWarning, RefreshCcw } from "lucide-react";
import { getServerSession } from "next-auth";
import { migrateLegacyRegistryStorage, runLegacyCutoverSync } from "@/app/actions";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canApproveRole } from "@/lib/compliance-workflow";
import {
  buildComplianceItemScope,
  buildTaskScope,
  ensureScopedUserByEmail,
} from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

export default async function CutoverPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user?.email
    ? await ensureScopedUserByEmail(session.user.email)
    : null;

  if (!currentUser) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Legacy Cutover</h1>
        <p className="mt-3 text-sm text-slate-500">Sign in to review the remaining legacy migration work.</p>
      </div>
    );
  }

  if (!canApproveRole(currentUser.role)) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Legacy Cutover</h1>
        <p className="mt-3 text-sm text-slate-500">
          This view is reserved for managers because it controls the final migration away from legacy task models.
        </p>
      </div>
    );
  }

  const [
    legacyCompliancePending,
    legacyTaskPending,
    evidencePendingRegistry,
    legacyNotificationOnly,
    backfilledWorkItems,
    legacyStorageVersions,
  ] = await Promise.all([
    prisma.complianceItem.count({
      where: buildComplianceItemScope(currentUser.organizationId, currentUser.organizationSlug, {
        archivedAt: null,
        workItem: null,
      }),
    }),
    prisma.task.count({
      where: buildTaskScope(currentUser.organizationId, currentUser.organizationSlug, {
        archivedAt: null,
        workItem: null,
      }),
    }),
    prisma.workItemEvidence.count({
      where: {
        documentId: null,
        workItem: {
          is: {
            organizationId: currentUser.organizationId,
            archivedAt: null,
          },
        },
      },
    }),
    prisma.notificationLog.count({
      where: {
        workItemId: null,
        complianceItemId: {
          not: null,
        },
        complianceItem: {
          is: buildComplianceItemScope(currentUser.organizationId, currentUser.organizationSlug, {}),
        },
      },
    }),
    prisma.workItem.count({
      where: {
        organizationId: currentUser.organizationId,
        OR: [{ legacyComplianceItemId: { not: null } }, { legacyTaskId: { not: null } }],
      },
    }),
    prisma.documentVersion.count({
      where: {
        document: {
          is: {
            organizationId: currentUser.organizationId,
          },
        },
        storageProvider: {
          in: ["LEGACY_PUBLIC_UPLOAD", "LEGACY_TEMP_UPLOAD", "LEGACY_REMOTE_URL"],
        },
      },
    }),
  ]);

  const outstandingCount =
    legacyCompliancePending +
    legacyTaskPending +
    evidencePendingRegistry +
    legacyNotificationOnly +
    legacyStorageVersions;

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="text-blue-600" size={24} />
              <h1 className="text-3xl font-black text-slate-900">Legacy Cutover</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This is the transition console for retiring the old `Task` and `ComplianceItem`
              operating path. It shows what still needs backfill, what still points at legacy
              storage or relations, and lets you run the safe migration sync again.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <form action={runLegacyCutoverSync}>
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-700"
              >
                Run Cutover Sync
              </button>
            </form>
            <form action={migrateLegacyRegistryStorage}>
              <button
                type="submit"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-300"
              >
                Migrate Legacy Storage
              </button>
            </form>
            <Link
              href="/dashboard/documents"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-300"
            >
              Open Registry
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Outstanding Legacy Work"
          value={outstandingCount.toString()}
          icon={<Database size={22} />}
          tone="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          label="Backfilled WorkItems"
          value={backfilledWorkItems.toString()}
          icon={<ArrowRightLeft size={22} />}
          tone="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="Legacy Notification Links"
          value={legacyNotificationOnly.toString()}
          icon={<MessageSquareWarning size={22} />}
          tone="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          label="Legacy Storage Versions"
          value={legacyStorageVersions.toString()}
          icon={<FolderKanban size={22} />}
          tone="bg-rose-100 text-rose-700"
        />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-2xl font-black text-slate-900">Cutover Checklist</h2>
            <p className="mt-2 text-sm text-slate-500">
              These are the concrete remnants that still tie the app to the old data model.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {[
              ["Legacy compliance records not yet backfilled", legacyCompliancePending],
              ["Legacy task records not yet backfilled", legacyTaskPending],
              ["Work item evidence rows missing registry documents", evidencePendingRegistry],
              ["Notification logs still linked only to ComplianceItem", legacyNotificationOnly],
              ["Registry versions still on legacy storage providers", legacyStorageVersions],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-6 py-5">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                    {Number(value) === 0 ? "Cleared" : "Needs migration attention"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                    Number(value) === 0
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">What Sync Does</h2>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-slate-600">
              <p>It backfills remaining `ComplianceItem` rows into `WorkItem` records.</p>
              <p>It backfills remaining legacy `Task` rows into `WorkItem` records.</p>
              <p>It attaches missing registry documents to `WorkItemEvidence` rows.</p>
              <p>It relinks notification logs to `WorkItem` where a migrated mapping now exists.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-black text-slate-900">Recommended Finish</h2>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-slate-600">
              <p>Run cutover sync until all migration counters are near zero.</p>
              <p>Use the legacy storage migration button to pull old files into the managed registry backend.</p>
              <p>Move remaining legacy-stored files through the registry as users touch them.</p>
              <p>Once the counters are clean, remove compatibility reads from the app layer.</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <RefreshCcw className="text-blue-600" size={18} />
              <p className="text-sm font-black text-slate-900">Status</p>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              The system already writes live workflow into `WorkItem`, registry documents, ops
              events, and decision records. This page is about cleaning the remaining bridge data,
              not changing the primary operating path.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

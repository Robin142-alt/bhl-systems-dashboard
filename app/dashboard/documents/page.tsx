import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ClipboardCheck, FolderKanban, ShieldCheck } from "lucide-react";
import { getServerSession } from "next-auth";
import { requestDocumentExtraction, requestWorkItemVerification } from "@/app/actions";
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

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return "Unknown size";
  }

  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(1)} MB`;
  }

  if (value >= 1_024) {
    return `${Math.round(value / 1_024)} KB`;
  }

  return `${value} B`;
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

function getMismatchCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  return 0;
}

function getVerificationTone(status?: string | null) {
  if (status === "MATCHED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "CHECK_NEEDED") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "MISMATCH") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-600";
}

function getExtractionTone(status?: string | null) {
  if (status === "EXTRACTED" || status === "VISION_EXTRACTED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "UNSUPPORTED") {
    return "bg-slate-100 text-slate-600";
  }

  return "bg-amber-100 text-amber-700";
}

export default async function DocumentRegistryPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user?.email
    ? await ensureScopedUserByEmail(session.user.email)
    : null;

  if (!currentUser) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Document Registry</h1>
        <p className="mt-3 text-sm text-slate-500">Sign in to view registry-backed evidence and proof quality.</p>
      </div>
    );
  }

  if (!canApproveRole(currentUser.role)) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Document Registry</h1>
        <p className="mt-3 text-sm text-slate-500">
          This view is reserved for managers because it controls trust, proof quality, and audit readiness.
        </p>
      </div>
    );
  }

  const documents = await prisma.document.findMany({
    where: {
      organizationId: currentUser.organizationId,
      archivedAt: null,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 40,
    include: {
      clientEntity: {
        select: {
          id: true,
          name: true,
        },
      },
      ownerUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      versions: {
        orderBy: [{ versionNumber: "desc" }],
        take: 4,
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          extraction: true,
        },
      },
      evidenceLinks: {
        orderBy: [{ uploadedAt: "desc" }],
        take: 6,
        include: {
          workItem: {
            select: {
              id: true,
              title: true,
              status: true,
              deadline: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      verifications: {
        orderBy: [{ verifiedAt: "desc" }],
        take: 8,
      },
      decisions: {
        where: {
          status: "OPEN",
        },
        select: {
          id: true,
          kind: true,
          priority: true,
          dueAt: true,
        },
      },
    },
  });

  const enrichedDocuments = documents.map((document) => {
    const currentVersion = document.versions.find((entry) => entry.isCurrent) || document.versions[0] || null;
    const latestVerification =
      document.verifications.find(
        (entry) =>
          entry.documentVersionId === currentVersion?.id && entry.verificationSource === "SYSTEM",
      ) ||
      document.verifications.find((entry) => entry.documentVersionId === currentVersion?.id) ||
      null;
    const linkedEvidence =
      document.evidenceLinks.find((entry) => entry.documentVersionId === currentVersion?.id) ||
      document.evidenceLinks[0] ||
      null;
    const mismatchCount = getMismatchCount(latestVerification?.mismatches);
    const extractionStatus = currentVersion?.extraction?.readStatus || "UNAVAILABLE";
    const verificationStatus = latestVerification?.status || null;
    const hasTrustRisk =
      extractionStatus !== "EXTRACTED" &&
      extractionStatus !== "VISION_EXTRACTED" &&
      extractionStatus !== "UNSUPPORTED";
    const hasVerificationRisk =
      verificationStatus === "MISMATCH" || verificationStatus === "CHECK_NEEDED";

    return {
      ...document,
      currentVersion,
      latestVerification,
      linkedEvidence,
      mismatchCount,
      hasTrustRisk,
      hasVerificationRisk,
      isAuditReady: verificationStatus === "MATCHED",
    };
  });

  const auditReadyCount = enrichedDocuments.filter((document) => document.isAuditReady).length;
  const unreadableCount = enrichedDocuments.filter((document) => document.hasTrustRisk).length;
  const openDecisionCount = enrichedDocuments.reduce(
    (sum, document) => sum + document.decisions.length,
    0,
  );

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FolderKanban className="text-blue-600" size={24} />
              <h1 className="text-3xl font-black text-slate-900">Document Registry</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              This is the trust console for uploaded proof. It shows which documents are readable,
              which ones mismatch the task, which files are tied to live work, and where a manager
              should re-run OCR or verification before approving anything.
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
          label="Registry Documents"
          value={enrichedDocuments.length.toString()}
          icon={<FolderKanban size={22} />}
          tone="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          label="Audit Ready"
          value={auditReadyCount.toString()}
          icon={<ShieldCheck size={22} />}
          tone="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          label="Unreadable Or Weak OCR"
          value={unreadableCount.toString()}
          icon={<AlertTriangle size={22} />}
          tone="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          label="Open Proof Decisions"
          value={openDecisionCount.toString()}
          icon={<ClipboardCheck size={22} />}
          tone="bg-rose-100 text-rose-700"
        />
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-2xl font-black text-slate-900">Registry Inventory</h2>
          <p className="mt-2 text-sm text-slate-500">
            The top rows are the files most likely to create audit or approval friction.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {enrichedDocuments.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">No registry documents have been captured yet.</div>
          ) : (
            enrichedDocuments
              .sort((left, right) => {
                const leftScore =
                  Number(left.hasTrustRisk) * 4 +
                  Number(left.hasVerificationRisk) * 3 +
                  left.decisions.length * 2 +
                  Number(!left.currentVersion);
                const rightScore =
                  Number(right.hasTrustRisk) * 4 +
                  Number(right.hasVerificationRisk) * 3 +
                  right.decisions.length * 2 +
                  Number(!right.currentVersion);

                if (rightScore !== leftScore) {
                  return rightScore - leftScore;
                }

                return right.updatedAt.getTime() - left.updatedAt.getTime();
              })
              .map((document) => {
                const currentVersion = document.currentVersion;
                const linkedWorkItem = document.linkedEvidence?.workItem || null;

                return (
                  <div key={document.id} className="space-y-5 px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                            {document.sourceType.replaceAll("_", " ")}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getExtractionTone(
                              currentVersion?.extraction?.readStatus,
                            )}`}
                          >
                            {currentVersion?.extraction?.readStatus || "NO EXTRACTION"}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getVerificationTone(
                              document.latestVerification?.status,
                            )}`}
                          >
                            {document.latestVerification?.status || "UNVERIFIED"}
                          </span>
                        </div>
                        <h3 className="mt-3 text-xl font-black text-slate-900">
                          {document.title || currentVersion?.fileName || `Document ${document.id}`}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {document.clientEntity?.name || "Internal operations"} • Owner{" "}
                          {document.ownerUser?.name || document.ownerUser?.email || "Unassigned"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                        <div>Current version: v{currentVersion?.versionNumber || "?"}</div>
                        <div className="mt-1">{formatBytes(currentVersion?.byteSize)}</div>
                        <div className="mt-1">Updated {formatDateTime(document.updatedAt)}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm md:grid-cols-4">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Linked Work</p>
                        {linkedWorkItem ? (
                          <div className="mt-2">
                            <p className="font-semibold text-slate-900">{linkedWorkItem.title}</p>
                            <p className="mt-1 text-slate-500">
                              {linkedWorkItem.user.name || linkedWorkItem.user.email} • due{" "}
                              {formatDateTime(linkedWorkItem.deadline)}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-slate-500">No work item link was found for the current version.</p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Verification</p>
                        <p className="mt-2 font-semibold text-slate-900">
                          {document.latestVerification?.summary || "No verification summary recorded yet."}
                        </p>
                        <p className="mt-1 text-slate-500">
                          Mismatches flagged: {document.mismatchCount}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Extraction</p>
                        <p className="mt-2 font-semibold text-slate-900">
                          {currentVersion?.extraction?.engine || "No extraction engine"}
                        </p>
                        <p className="mt-1 text-slate-500 line-clamp-3">
                          {currentVersion?.extraction?.textPreview || "No readable text preview is available for this version."}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Actions</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {currentVersion ? (
                            <form action={requestDocumentExtraction.bind(null, currentVersion.id)}>
                              <button
                                type="submit"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300"
                              >
                                Re-run OCR
                              </button>
                            </form>
                          ) : null}
                          {linkedWorkItem ? (
                            <form action={requestWorkItemVerification.bind(null, linkedWorkItem.id)}>
                              <button
                                type="submit"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300"
                              >
                                Re-verify
                              </button>
                            </form>
                          ) : null}
                          {currentVersion ? (
                            <a
                              href={buildDocumentDownloadUrl(document.id, currentVersion.id)}
                              className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-700"
                            >
                              Download
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {document.decisions.length > 0 ? (
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                          Open Decision Pressure
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          {document.decisions.length} live decision
                          {document.decisions.length === 1 ? "" : "s"} still reference this
                          document.
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })
          )}
        </div>
      </section>
    </div>
  );
}

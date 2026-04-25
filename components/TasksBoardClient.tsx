"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileUp,
  MessageSquare,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  acknowledgeManagerResponse,
  approveComplianceItem,
  clearComplianceBlocker,
  createComplianceItem,
  generateCompliancePack,
  reportComplianceBlocker,
  rejectComplianceItem,
  submitComplianceItemForApproval,
} from "@/app/actions";
import {
  blockerReasonCatalog,
  hasActiveBlocker,
  isActionRequired,
  isApprovalPending,
  isClosedStatus,
  type ComplianceBlockerCode,
  type ComplianceChecklistItem,
  type ComplianceManagerResponseKind,
  type ComplianceWorkflowData,
} from "@/lib/compliance-workflow";
import {
  compliancePackCatalog,
  estimateCompliancePackTaskCount,
  type CompliancePackId,
} from "@/lib/kenya-compliance-packs";

export interface TaskBoardUser {
  id: number;
  name: string | null;
  email: string;
  role: string;
}

export interface TaskBoardItem {
  id: number;
  title: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
  frequency: string;
  responsible: string;
  status: string;
  documentUrl: string | null;
  category: string;
  userId: number;
  user: TaskBoardUser;
  organization?: {
    id: number;
    name: string;
    slug: string;
  } | null;
  clientEntity?: {
    id: number;
    name: string;
  } | null;
  currentEvidence?: {
    id: number;
    kind: string;
    label: string | null;
    fileUrl: string;
    fileName: string | null;
    uploadedAt: string;
    documentId: number | null;
    documentVersionId: number | null;
    versionNumber: number | null;
    extraction?: {
      id: number;
      readStatus: string;
      textPreview: string | null;
      extractedFields: Record<string, unknown> | null;
      extractedAt: string;
    } | null;
  } | null;
  workflow: ComplianceWorkflowData;
}

interface Props {
  items: TaskBoardItem[];
  staff: TaskBoardUser[];
  currentUser: TaskBoardUser;
  canManage: boolean;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateString?: string) {
  if (!dateString) return null;

  return new Date(dateString).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusClasses(status: string) {
  if (status === "Approved") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  if (status === "Submitted") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }

  if (status === "Rejected") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  return "bg-amber-100 text-amber-700 border-amber-200";
}

function getDueLabel(deadline: string) {
  const due = new Date(deadline);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`, tone: "text-rose-600" };
  }

  if (diffDays === 0) {
    return { label: "Due today", tone: "text-amber-600" };
  }

  return { label: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`, tone: "text-slate-500" };
}

type ManagerSlaState = "ON_TRACK" | "AT_RISK" | "BREACHED";
type ManagerInboxFilter = "ALL" | ManagerSlaState;
type ManagerInboxActionKind = "APPROVE_SUBMISSION" | "CLEAR_BLOCKER";

interface ManagerInboxEntry {
  item: TaskBoardItem;
  queueLabel: string;
  detail: string;
  waitingOn?: string;
  startedAt: string;
  startedLabel: string;
  ageHours: number;
  slaHours: number;
  slaState: ManagerSlaState;
  primaryActionKind: ManagerInboxActionKind;
  primaryActionLabel: string;
  resolutionNote?: string;
}

function getElapsedHours(startedAt: string) {
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 3600000;
  return elapsed > 0 ? elapsed : 0;
}

function formatElapsedTime(hours: number) {
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = Math.floor(hours / 24);
  const remainderHours = Math.round(hours % 24);

  if (remainderHours === 0) {
    return `${days}d`;
  }

  return `${days}d ${remainderHours}h`;
}

function getManagerSlaState(ageHours: number, slaHours: number): ManagerSlaState {
  if (ageHours >= slaHours) {
    return "BREACHED";
  }

  if (ageHours >= slaHours * 0.75) {
    return "AT_RISK";
  }

  return "ON_TRACK";
}

function getSlaBadgeClasses(state: ManagerSlaState) {
  if (state === "BREACHED") {
    return "border-rose-200 bg-rose-100 text-rose-700";
  }

  if (state === "AT_RISK") {
    return "border-amber-200 bg-amber-100 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-100 text-emerald-700";
}

function getManagerInboxEntry(item: TaskBoardItem): ManagerInboxEntry | null {
  const startedFallback = item.updatedAt || item.createdAt;

  if (item.status === "Submitted") {
    const startedAt = item.workflow.submittedAt || startedFallback;
    const ageHours = getElapsedHours(startedAt);

    return {
      item,
      queueLabel: "Approval decision",
      detail:
        item.workflow.submissionNote ||
        `${item.user.name || item.user.email} submitted this task and is waiting for sign-off.`,
      startedAt,
      startedLabel: "Submitted",
      ageHours,
      slaHours: 24,
      slaState: getManagerSlaState(ageHours, 24),
      primaryActionKind: "APPROVE_SUBMISSION",
      primaryActionLabel: "Approve Now",
    };
  }

  const blocker = item.workflow.blocker;
  if (!blocker) {
    return null;
  }

  const needsDecision =
    blocker.needsManagerHelp ||
    blocker.code === "WAITING_APPROVAL" ||
    blocker.code === "WAITING_PAYMENT" ||
    blocker.code === "MISSING_DOCUMENT";

  if (!needsDecision) {
    return null;
  }

  const startedAt = blocker.blockedAt || startedFallback;
  const ageHours = getElapsedHours(startedAt);

  if (blocker.code === "WAITING_PAYMENT") {
    return {
      item,
      queueLabel: "Payment release",
      detail: blocker.reason,
      waitingOn: blocker.waitingOn,
      startedAt,
      startedLabel: "Blocked",
      ageHours,
      slaHours: 6,
      slaState: getManagerSlaState(ageHours, 6),
      primaryActionKind: "CLEAR_BLOCKER",
      primaryActionLabel: "Release Payment",
      resolutionNote: "Payment approved by manager. Proceed with the payment and upload the receipt.",
    };
  }

  if (blocker.code === "WAITING_APPROVAL") {
    return {
      item,
      queueLabel: "Manager sign-off",
      detail: blocker.reason,
      waitingOn: blocker.waitingOn,
      startedAt,
      startedLabel: "Blocked",
      ageHours,
      slaHours: 8,
      slaState: getManagerSlaState(ageHours, 8),
      primaryActionKind: "CLEAR_BLOCKER",
      primaryActionLabel: "Grant Approval",
      resolutionNote: "Manager approval granted. Continue with the next step and attach proof.",
    };
  }

  if (blocker.code === "MISSING_DOCUMENT") {
    return {
      item,
      queueLabel: "Document decision",
      detail: blocker.reason,
      waitingOn: blocker.waitingOn,
      startedAt,
      startedLabel: "Blocked",
      ageHours,
      slaHours: 8,
      slaState: getManagerSlaState(ageHours, 8),
      primaryActionKind: "CLEAR_BLOCKER",
      primaryActionLabel: item.documentUrl ? "Accept Proof" : "Clear Decision",
      resolutionNote: item.documentUrl
        ? "Manager reviewed the uploaded proof. Continue with the next step."
        : "Manager clarified the required document. Upload the agreed proof and continue.",
    };
  }

  return {
    item,
    queueLabel: "Manager help",
    detail: blocker.reason,
    waitingOn: blocker.waitingOn,
    startedAt,
    startedLabel: "Blocked",
    ageHours,
    slaHours: 12,
    slaState: getManagerSlaState(ageHours, 12),
    primaryActionKind: "CLEAR_BLOCKER",
    primaryActionLabel: "Resolve Blocker",
    resolutionNote: "Manager reviewed the blocker, gave direction, and released the work to continue.",
  };
}

function compareManagerInboxEntries(left: ManagerInboxEntry, right: ManagerInboxEntry) {
  const priorityRank: Record<ManagerSlaState, number> = {
    BREACHED: 0,
    AT_RISK: 1,
    ON_TRACK: 2,
  };

  const stateGap = priorityRank[left.slaState] - priorityRank[right.slaState];
  if (stateGap !== 0) {
    return stateGap;
  }

  return right.ageHours - left.ageHours;
}

function getSlaCopy(entry: ManagerInboxEntry) {
  if (entry.slaState === "BREACHED") {
    return `Breached by ${formatElapsedTime(entry.ageHours - entry.slaHours)}`;
  }

  return `${formatElapsedTime(Math.max(entry.slaHours - entry.ageHours, 0))} left`;
}

function getManagerResponseClasses(kind: ComplianceManagerResponseKind) {
  return kind === "TAKING_OWNERSHIP"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
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

function TaskCard({
  item,
  currentUserId,
  canManage,
  onRefresh,
}: {
  item: TaskBoardItem;
  currentUserId: number;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [checklist, setChecklist] = useState<ComplianceChecklistItem[]>(item.workflow.checklist);
  const [submissionNote, setSubmissionNote] = useState(item.workflow.submissionNote ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState(item.workflow.rejectionReason ?? "");
  const [blockerCode, setBlockerCode] = useState<ComplianceBlockerCode>(
    item.workflow.blocker?.code ?? "MISSING_DOCUMENT",
  );
  const [blockerReason, setBlockerReason] = useState(item.workflow.blocker?.reason ?? "");
  const [waitingOn, setWaitingOn] = useState(item.workflow.blocker?.waitingOn ?? "");
  const [needsManagerHelp, setNeedsManagerHelp] = useState(
    item.workflow.blocker?.needsManagerHelp ?? true,
  );
  const [resolutionNote, setResolutionNote] = useState("");
  const [showSubmissionPanel, setShowSubmissionPanel] = useState(false);
  const [showRejectionPanel, setShowRejectionPanel] = useState(false);
  const [showBlockerPanel, setShowBlockerPanel] = useState(false);
  const [isPending, startTransition] = useTransition();

  const due = getDueLabel(item.deadline);
  const canSubmit = item.userId === currentUserId || canManage;
  const checklistDone = checklist.every((step) => step.done);
  const isBlocked = hasActiveBlocker(item.workflow);
  const managerResponse = item.workflow.managerResponse;

  const updateChecklist = (stepId: string) => {
    setChecklist((current) =>
      current.map((step) =>
        step.id === stepId ? { ...step, done: !step.done } : step,
      ),
    );
  };

  const handleSubmit = async () => {
    let documentUrl = item.documentUrl || "";
    let documentId = item.currentEvidence?.documentId ?? undefined;
    let documentVersionId = item.currentEvidence?.documentVersionId ?? undefined;
    let fileName = item.currentEvidence?.fileName ?? undefined;

    if (!selectedFile && !documentUrl) {
      toast.error(`Attach the ${item.workflow.requiredDocumentLabel.toLowerCase()} first.`);
      return;
    }

    if (!checklistDone) {
      toast.error("Complete all checklist items before submitting.");
      return;
    }

    try {
      if (selectedFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", selectedFile);
        uploadForm.append("folder", "compliance-evidence");
        uploadForm.append("sourceType", "WORK_ITEM_EVIDENCE");
        uploadForm.append("title", item.workflow.requiredDocumentLabel);
        if (item.currentEvidence?.documentId) {
          uploadForm.append("documentId", String(item.currentEvidence.documentId));
        }

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadForm,
        });

        const uploadBody = (await uploadRes.json()) as {
          fileUrl?: string;
          fileName?: string;
          documentId?: number;
          documentVersionId?: number;
          error?: string;
        };
        if (!uploadRes.ok || !uploadBody.fileUrl) {
          throw new Error(uploadBody.error || "Upload failed");
        }

        documentUrl = uploadBody.fileUrl;
        documentId = uploadBody.documentId;
        documentVersionId = uploadBody.documentVersionId;
        fileName = uploadBody.fileName;
      }

      const result = await submitComplianceItemForApproval({
        id: item.id,
        checklist,
        documentUrl,
        documentId,
        documentVersionId,
        fileName,
        submissionNote,
      });

      if (!result.success) {
        toast.error(result.message || "Submission failed.");
        return;
      }

      toast.success("Task submitted for approval.");
      startTransition(() => onRefresh());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed.";
      toast.error(message);
    }
  };

  const handleApprove = async () => {
    const result = await approveComplianceItem(item.id);

    if (!result.success) {
      toast.error(result.message || "Approval failed.");
      return;
    }

    toast.success("Task approved.");
    startTransition(() => onRefresh());
  };

  const handleReject = async () => {
    const result = await rejectComplianceItem(item.id, rejectionReason);

    if (!result.success) {
      toast.error(result.message || "Rejection failed.");
      return;
    }

    toast.success("Task returned to the assignee.");
    startTransition(() => onRefresh());
  };

  const handleReportBlocker = async () => {
    const result = await reportComplianceBlocker({
      id: item.id,
      code: blockerCode,
      reason: blockerReason,
      waitingOn,
      needsManagerHelp,
    });

    if (!result.success) {
      toast.error(result.message || "Could not save blocker.");
      return;
    }

    toast.success(result.message || "Blocker logged. Managers can now see the bottleneck.");
    startTransition(() => onRefresh());
  };

  const handleClearBlocker = async () => {
    const result = await clearComplianceBlocker(item.id, resolutionNote);

    if (!result.success) {
      toast.error(result.message || "Could not clear blocker.");
      return;
    }

    toast.success("Blocker cleared.");
    startTransition(() => onRefresh());
  };

  return (
    <article id={`task-${item.id}`} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-black text-slate-900">{item.title}</h3>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getStatusClasses(item.status)}`}>
              {item.status}
            </span>
            {isBlocked ? (
              <span className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">
                Blocked
              </span>
            ) : null}
            {managerResponse ? (
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getManagerResponseClasses(managerResponse.kind)}`}>
                {managerResponse.label}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-500">
            <span>{item.category}</span>
            <span>{item.frequency}</span>
            {item.clientEntity?.name ? <span>{item.clientEntity.name}</span> : null}
            <span className={due.tone}>{due.label}</span>
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <UserCircle2 size={16} className="text-slate-400" />
              <span>{item.user.name || item.user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock3 size={16} className="text-slate-400" />
              <span>{formatDate(item.deadline)}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileCheck2 size={16} className="text-slate-400" />
              <span>{item.workflow.requiredDocumentLabel}</span>
            </div>
            {item.organization?.name ? (
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-slate-400" />
                <span>{item.organization.name}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {item.documentUrl ? (
            <Link
              href={item.documentUrl}
              target="_blank"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:border-blue-200 hover:text-blue-600"
            >
              {item.currentEvidence?.versionNumber
                ? `View Proof v${item.currentEvidence.versionNumber}`
                : "View Proof"}
            </Link>
          ) : null}

          {canSubmit && isActionRequired(item.status) ? (
            <button
              type="button"
              onClick={() => setShowSubmissionPanel((open) => !open)}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-600"
            >
              {showSubmissionPanel ? "Hide Submission" : "Prepare Submission"}
            </button>
          ) : null}

          {canSubmit && isActionRequired(item.status) ? (
            <button
              type="button"
              onClick={() => setShowBlockerPanel((open) => !open)}
              className={`rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.18em] transition ${
                isBlocked
                  ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              {isBlocked ? "Update Blocker" : "Report Blocker"}
            </button>
          ) : null}

          {canSubmit && isBlocked ? (
            <button
              type="button"
              onClick={handleClearBlocker}
              disabled={isPending}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear Blocker
            </button>
          ) : null}

          {canManage && isApprovalPending(item.status) ? (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Approve
            </button>
          ) : null}

          {canManage && isApprovalPending(item.status) ? (
            <button
              type="button"
              onClick={() => setShowRejectionPanel((open) => !open)}
              className="rounded-2xl border border-rose-200 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-rose-600 transition hover:bg-rose-50"
            >
              Reject
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[1.5rem] bg-slate-50 p-5">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            Completion Checklist
          </p>
          <div className="space-y-3">
            {checklist.map((step) => (
              <label
                key={step.id}
                className="flex items-start gap-3 rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-medium text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={!canSubmit || !isActionRequired(item.status) || isPending}
                  onChange={() => updateChecklist(step.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{step.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-slate-200 p-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Workflow Notes</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {item.workflow.blocker ? (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-700">
                  <p className="font-black uppercase tracking-[0.14em] text-[10px]">
                    {item.workflow.blocker.label}
                  </p>
                  <p className="mt-2 text-sm">{item.workflow.blocker.reason}</p>
                  {item.workflow.blocker.waitingOn ? (
                    <p className="mt-2 text-xs font-semibold">
                      Waiting on: {item.workflow.blocker.waitingOn}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs font-semibold">
                    Logged {formatDateTime(item.workflow.blocker.blockedAt) || "recently"}
                    {item.workflow.blocker.needsManagerHelp ? " • Help requested" : ""}
                  </p>
                </div>
              ) : null}
              {managerResponse ? (
                <div className={`rounded-2xl border px-4 py-3 ${getManagerResponseClasses(managerResponse.kind)}`}>
                  <p className="font-black uppercase tracking-[0.14em] text-[10px]">
                    Manager Response
                  </p>
                  <p className="mt-2 text-sm">{managerResponse.note}</p>
                  <p className="mt-2 text-xs font-semibold">
                    {managerResponse.respondedBy?.name || managerResponse.respondedBy?.email || "Manager"} • {formatDateTime(managerResponse.respondedAt) || "recently"}
                  </p>
                </div>
              ) : null}
              {item.workflow.submittedAt ? (
                <p>
                  Submitted: <span className="font-semibold">{formatDateTime(item.workflow.submittedAt)}</span>
                </p>
              ) : null}
              {item.workflow.approvedAt ? (
                <p>
                  Approved: <span className="font-semibold">{formatDateTime(item.workflow.approvedAt)}</span>
                </p>
              ) : null}
              {item.workflow.rejectedAt ? (
                <p>
                  Rejected: <span className="font-semibold">{formatDateTime(item.workflow.rejectedAt)}</span>
                </p>
              ) : null}
              {item.workflow.rejectionReason ? (
                <p className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-700">
                  {item.workflow.rejectionReason}
                </p>
              ) : null}
              {item.workflow.submissionNote ? (
                <p className="rounded-2xl bg-blue-50 px-4 py-3 text-blue-700">
                  {item.workflow.submissionNote}
                </p>
              ) : null}
              {item.workflow.lastResolvedBlocker ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-700">
                  Blocker cleared: {item.workflow.lastResolvedBlocker.resolutionNote || item.workflow.lastResolvedBlocker.reason}
                </p>
              ) : null}
              {!item.workflow.blocker &&
              !item.workflow.lastResolvedBlocker &&
              !managerResponse &&
              !item.workflow.submittedAt &&
              !item.workflow.rejectionReason &&
              !item.workflow.submissionNote ? (
                <p className="text-slate-400">No workflow notes yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showBlockerPanel && canSubmit && isActionRequired(item.status) ? (
        <div className="mt-6 rounded-[1.5rem] border border-amber-100 bg-amber-50 p-5">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
            Blocked Work
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={blockerCode}
              onChange={(event) => setBlockerCode(event.target.value as ComplianceBlockerCode)}
              className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-amber-300"
            >
              {blockerReasonCatalog.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))}
            </select>

            <input
              value={waitingOn}
              onChange={(event) => setWaitingOn(event.target.value)}
              placeholder="Who or what are you waiting on?"
              className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-amber-300"
            />
          </div>

          <textarea
            value={blockerReason}
            onChange={(event) => setBlockerReason(event.target.value)}
            rows={3}
            placeholder="What is stopping progress right now?"
            className="mt-4 w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-amber-300"
          />

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={needsManagerHelp}
              onChange={(event) => setNeedsManagerHelp(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Escalate this blocker for manager help
          </label>

          {isBlocked ? (
            <textarea
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              rows={2}
              placeholder="Optional note for when this blocker is cleared."
              className="mt-4 w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-300"
            />
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500">
              Use this when the work is stuck, not just late. It gives managers visibility into the real bottleneck.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReportBlocker}
                disabled={isPending}
                className="rounded-2xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBlocked ? "Update Blocker" : "Save Blocker"}
              </button>
              {isBlocked ? (
                <button
                  type="button"
                  onClick={handleClearBlocker}
                  disabled={isPending}
                  className="rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear And Continue
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showSubmissionPanel && canSubmit && isActionRequired(item.status) ? (
        <div className="mt-6 rounded-[1.5rem] border border-blue-100 bg-blue-50 p-5">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
            Submit For Approval
          </p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-4">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700">
                <FileUp size={18} className="text-blue-600" />
                <span>
                  {selectedFile ? selectedFile.name : `Upload ${item.workflow.requiredDocumentLabel}`}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                />
              </label>
              {item.documentUrl ? (
                <p className="mt-2 text-xs text-slate-500">
                  Existing proof on file will be reused if you do not upload a new one.
                  {item.currentEvidence?.versionNumber
                    ? ` Current registry version: v${item.currentEvidence.versionNumber}.`
                    : ""}
                </p>
              ) : null}
            </div>

            <textarea
              value={submissionNote}
              onChange={(event) => setSubmissionNote(event.target.value)}
              rows={3}
              placeholder="Add a short note for the approving manager."
              className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">
                Submission is blocked until every checklist item is complete, proof is attached, and any active blocker is cleared.
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Submit Task
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRejectionPanel && canManage && isApprovalPending(item.status) ? (
        <div className="mt-6 rounded-[1.5rem] border border-rose-100 bg-rose-50 p-5">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-rose-700">
            Return For Correction
          </p>
          <textarea
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            rows={3}
            placeholder="Explain what is missing or needs correction."
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-rose-300"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="rounded-2xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject Task
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ManagerInboxCard({
  entry,
  onRefresh,
}: {
  entry: ManagerInboxEntry;
  onRefresh: () => void;
}) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAction = async (action: "PRIMARY" | ComplianceManagerResponseKind) => {
    setActiveAction(action);

    const result =
      action === "PRIMARY"
        ? entry.primaryActionKind === "APPROVE_SUBMISSION"
          ? await approveComplianceItem(entry.item.id)
          : await clearComplianceBlocker(entry.item.id, entry.resolutionNote)
        : await acknowledgeManagerResponse({
            id: entry.item.id,
            kind: action,
          });

    if (!result.success) {
      toast.error(result.message || "That decision could not be completed.");
      setActiveAction(null);
      return;
    }

    const successMessage =
      action === "PRIMARY"
        ? entry.primaryActionKind === "APPROVE_SUBMISSION"
          ? "Task approved."
          : `${entry.queueLabel} resolved.`
        : action === "TAKING_OWNERSHIP"
          ? "Assignee can now see that you are handling this."
          : "Assignee can now see that you have seen this.";

    toast.success(result.message || successMessage);
    startTransition(() => onRefresh());
  };

  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
              {entry.queueLabel}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getSlaBadgeClasses(entry.slaState)}`}>
              {entry.slaState === "BREACHED"
                ? "SLA Breached"
                : entry.slaState === "AT_RISK"
                  ? "Due Soon"
                  : "Within SLA"}
            </span>
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-900">{entry.item.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{entry.detail}</p>
            {entry.waitingOn ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Waiting On: {entry.waitingOn}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-slate-500">
            <span>{entry.item.user.name || entry.item.user.email}</span>
            <span>{entry.startedLabel}: {formatDateTime(entry.startedAt) || "Recently"}</span>
            <span>{formatElapsedTime(entry.ageHours)} waiting</span>
            <span>{entry.slaHours}h SLA</span>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            {getSlaCopy(entry)}
          </div>

          {entry.item.workflow.managerResponse ? (
            <div className={`rounded-[1.5rem] border px-4 py-3 text-sm ${getManagerResponseClasses(entry.item.workflow.managerResponse.kind)}`}>
              <p className="font-black uppercase tracking-[0.14em] text-[10px]">
                Latest Acknowledgement
              </p>
              <p className="mt-2">{entry.item.workflow.managerResponse.note}</p>
              <p className="mt-2 text-xs font-semibold">
                {entry.item.workflow.managerResponse.respondedBy?.name ||
                  entry.item.workflow.managerResponse.respondedBy?.email ||
                  "Manager"}{" "}
                • {formatDateTime(entry.item.workflow.managerResponse.respondedAt) || "recently"}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 lg:max-w-xs lg:justify-end">
          {entry.item.documentUrl ? (
            <Link
              href={entry.item.documentUrl}
              target="_blank"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:border-blue-200 hover:text-blue-600"
            >
              View Proof
            </Link>
          ) : null}

          <Link
            href={`#task-${entry.item.id}`}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Open Full Task
          </Link>

          <button
            type="button"
            onClick={() => handleAction("SEEN")}
            disabled={isPending}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && activeAction === "SEEN" ? "Saving..." : "Seen"}
          </button>

          <button
            type="button"
            onClick={() => handleAction("TAKING_OWNERSHIP")}
            disabled={isPending}
            className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && activeAction === "TAKING_OWNERSHIP" ? "Saving..." : "I'll Handle This"}
          </button>

          <button
            type="button"
            onClick={() => handleAction("PRIMARY")}
            disabled={isPending}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && activeAction === "PRIMARY" ? "Working..." : entry.primaryActionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function TasksBoardClient({
  items,
  staff,
  currentUser,
  canManage,
}: Props) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);
  const [isRunningWhatsApp, setIsRunningWhatsApp] = useState(false);
  const [managerInboxFilter, setManagerInboxFilter] = useState<ManagerInboxFilter>("ALL");
  const [selectedPackId, setSelectedPackId] = useState<CompliancePackId>("tax-payroll");
  const [packYear, setPackYear] = useState(String(new Date().getFullYear()));
  const [packOwnerId, setPackOwnerId] = useState(
    String(staff[0]?.id ?? currentUser.id),
  );

  const myTasks = useMemo(
    () => items.filter((item) => item.userId === currentUser.id),
    [items, currentUser.id],
  );
  const managerInbox = useMemo(
    () =>
      canManage
        ? items
            .map((item) => getManagerInboxEntry(item))
            .filter((entry): entry is ManagerInboxEntry => entry !== null)
            .sort(compareManagerInboxEntries)
        : [],
    [canManage, items],
  );
  const managerInboxIds = useMemo(
    () => new Set(managerInbox.map((entry) => entry.item.id)),
    [managerInbox],
  );
  const blockedTasks = useMemo(
    () => items.filter((item) => hasActiveBlocker(item.workflow) && !managerInboxIds.has(item.id)),
    [items, managerInboxIds],
  );
  const managerInboxSummary = useMemo(
    () => ({
      total: managerInbox.length,
      atRisk: managerInbox.filter((entry) => entry.slaState === "AT_RISK").length,
      breached: managerInbox.filter((entry) => entry.slaState === "BREACHED").length,
    }),
    [managerInbox],
  );
  const filteredManagerInbox = useMemo(
    () =>
      managerInboxFilter === "ALL"
        ? managerInbox
        : managerInbox.filter((entry) => entry.slaState === managerInboxFilter),
    [managerInbox, managerInboxFilter],
  );
  const visibleTasks = canManage ? items : myTasks;

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueNow = visibleTasks.filter((item) => {
      if (isClosedStatus(item.status)) {
        return false;
      }

      const deadline = new Date(item.deadline);
      deadline.setHours(0, 0, 0, 0);
      return deadline <= today;
    }).length;

    const needsSubmission = myTasks.filter((item) => isActionRequired(item.status)).length;
    const awaitingManager = canManage
      ? managerInbox.length
      : myTasks.filter((item) => isApprovalPending(item.status)).length;
    const approvedCount = visibleTasks.filter((item) => isClosedStatus(item.status)).length;
    const blockedCount = visibleTasks.filter((item) => hasActiveBlocker(item.workflow)).length;

    return {
      dueNow,
      needsSubmission,
      awaitingManager,
      approvedCount,
      blockedCount,
    };
  }, [canManage, managerInbox.length, myTasks, visibleTasks]);

  const selectedPack = useMemo(
    () => compliancePackCatalog.find((pack) => pack.id === selectedPackId) ?? compliancePackCatalog[0]!,
    [selectedPackId],
  );

  const packTaskEstimate = useMemo(() => {
    const numericYear = Number(packYear);
    if (!Number.isInteger(numericYear)) {
      return 0;
    }

    return estimateCompliancePackTaskCount(selectedPackId, numericYear);
  }, [packYear, selectedPackId]);

  const handleRefresh = () => {
    router.refresh();
  };

  const handleCreateTask = async (formData: FormData) => {
    setIsCreating(true);

    try {
      await createComplianceItem(formData);
      toast.success("Task assigned.");
      router.refresh();
    } catch {
      toast.error("Could not create the task.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleGeneratePack = async () => {
    const numericYear = Number(packYear);
    const numericOwnerId = Number(packOwnerId);

    if (!Number.isInteger(numericYear) || numericYear < 2024 || numericYear > 2100) {
      toast.error("Choose a valid pack year.");
      return;
    }

    if (!Number.isInteger(numericOwnerId) || numericOwnerId <= 0) {
      toast.error("Select who should own the generated tasks.");
      return;
    }

    setIsGeneratingPack(true);

    try {
      const result = await generateCompliancePack({
        packId: selectedPackId,
        year: numericYear,
        userId: numericOwnerId,
      });

      if (!result.success) {
        toast.error(result.message || "Could not apply the compliance pack.");
        return;
      }

      toast.success(
        `${result.packName || "Pack"} loaded: ${result.createdCount ?? 0} created, ${result.skippedCount ?? 0} skipped.`,
      );
      router.refresh();
    } catch {
      toast.error("Could not apply the compliance pack.");
    } finally {
      setIsGeneratingPack(false);
    }
  };

  const handleRunWhatsAppSweep = async () => {
    setIsRunningWhatsApp(true);

    try {
      const response = await fetch("/api/notifications/whatsapp/run", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        checkedItems?: number;
        sentCount?: number;
        skippedCount?: number;
        failedCount?: number;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        toast.error(payload.error || payload.message || "WhatsApp sweep failed.");
        return;
      }

      toast.success(
        `WhatsApp sweep complete: ${payload.sentCount ?? 0} sent, ${payload.failedCount ?? 0} failed, ${payload.skippedCount ?? 0} skipped.`,
      );
    } catch {
      toast.error("WhatsApp sweep failed.");
    } finally {
      setIsRunningWhatsApp(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2.5rem] bg-slate-900 p-8 text-white shadow-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-300">
              Accountable Workflows
            </p>
            <h1 className="text-4xl font-black tracking-tight">My Tasks Today</h1>
            <p className="text-sm text-slate-300">
              Every compliance deadline now behaves like real work: owned by a named person,
              checked off step by step, and closed only after proof is reviewed.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-slate-800 bg-slate-950/60 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Signed In As</p>
            <p className="mt-2 text-lg font-black">{currentUser.name || currentUser.email}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              {currentUser.role.replaceAll("_", " ")}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={<AlertTriangle size={22} className="text-rose-700" />}
          label="Due Today Or Overdue"
          value={stats.dueNow}
          tone="bg-rose-100"
        />
        <SummaryCard
          icon={<FileUp size={22} className="text-amber-700" />}
          label="Need Submission"
          value={stats.needsSubmission}
          tone="bg-amber-100"
        />
        <SummaryCard
          icon={<ShieldCheck size={22} className="text-blue-700" />}
          label={canManage ? "Waiting On Me" : "Waiting On Manager"}
          value={stats.awaitingManager}
          tone="bg-blue-100"
        />
        <SummaryCard
          icon={<MessageSquare size={22} className="text-amber-700" />}
          label="Blocked Work"
          value={stats.blockedCount}
          tone="bg-amber-100"
        />
        <SummaryCard
          icon={<CheckCircle2 size={22} className="text-emerald-700" />}
          label="Closed Tasks"
          value={stats.approvedCount}
          tone="bg-emerald-100"
        />
      </section>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  New Assignment
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">Turn a deadline into owned work</h2>
              </div>
            </div>

            <form action={handleCreateTask} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <input
                name="title"
                required
                placeholder="e.g. VAT Filing - April"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              />
              <input
                name="deadline"
                type="date"
                required
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              />
              <select
                name="userId"
                defaultValue={staff[0]?.id ?? ""}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              >
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
              <select
                name="category"
                defaultValue="Tax"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              >
                <option value="Tax">Tax</option>
                <option value="Statutory">Statutory</option>
                <option value="Legal">Legal</option>
                <option value="Certification">Certification</option>
                <option value="Permit">Permit</option>
                <option value="Operations">Operations</option>
              </select>
              <input
                name="clientName"
                placeholder="Client / entity (optional)"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              />
              <button
                type="submit"
                disabled={isCreating}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? "Assigning..." : "Assign Task"}
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                Kenya Compliance Packs
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">Load a full working year in one step</h2>
              <p className="mt-2 text-sm text-slate-500">
                Apply a ready-made pack to generate the recurring tasks Kenyan organisations usually miss.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <select
                value={selectedPackId}
                onChange={(event) => setSelectedPackId(event.target.value as CompliancePackId)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              >
                {compliancePackCatalog.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>

              <select
                value={packOwnerId}
                onChange={(event) => setPackOwnerId(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              >
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={2024}
                max={2100}
                value={packYear}
                onChange={(event) => setPackYear(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              />
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-blue-100 bg-blue-50 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-black text-slate-900">{selectedPack.name}</p>
                  <p className="text-sm text-slate-600">{selectedPack.description}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                    {packTaskEstimate} tasks scheduled
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGeneratePack}
                  disabled={isGeneratingPack}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingPack ? "Loading..." : "Apply Pack"}
                </button>
              </div>

              <p className="mt-4 text-xs font-semibold text-slate-500">{selectedPack.useCase}</p>
              <div className="mt-4 space-y-2 text-xs text-slate-500">
                {selectedPack.assumptions.map((assumption) => (
                  <p key={assumption}>{assumption}</p>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {canManage ? (
        <section className="rounded-[2rem] border border-green-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-green-600">
                WhatsApp Escalations
              </p>
              <h2 className="text-2xl font-black text-slate-900">Run the reminder sweep now</h2>
              <p className="max-w-3xl text-sm text-slate-500">
                This checks assignee reminders, overdue manager escalations, and approval nudges using the Africa&apos;s Talking channel configured in your environment.
              </p>
              <p className="text-xs font-semibold text-slate-500">
                Make sure staff phone numbers and opt-ins are set in the Staff Directory first.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRunWhatsAppSweep}
              disabled={isRunningWhatsApp}
              className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MessageSquare size={16} />
              {isRunningWhatsApp ? "Running..." : "Run WhatsApp Check"}
            </button>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-blue-600" />
                <h2 className="text-2xl font-black text-slate-900">Waiting On Me</h2>
              </div>
              <p className="text-sm text-slate-500">
                Same-day manager decisions that are stopping staff from completing work.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                { id: "ALL", label: "All" },
                { id: "AT_RISK", label: "Due Soon" },
                { id: "BREACHED", label: "Breached" },
              ] as const).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setManagerInboxFilter(filter.id)}
                  className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                    managerInboxFilter === filter.id
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Needs Decision</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{managerInboxSummary.total}</p>
            </div>
            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Due Soon</p>
              <p className="mt-2 text-3xl font-black text-amber-700">{managerInboxSummary.atRisk}</p>
            </div>
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">Breached SLA</p>
              <p className="mt-2 text-3xl font-black text-rose-700">{managerInboxSummary.breached}</p>
            </div>
          </div>

          {filteredManagerInbox.length > 0 ? (
            <div className="space-y-4">
              {filteredManagerInbox.map((entry) => (
                <ManagerInboxCard
                  key={`manager-${entry.item.id}`}
                  entry={entry}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <p className="text-lg font-black text-slate-700">Nothing is waiting on you right now.</p>
              <p className="mt-2 text-sm text-slate-500">
                Approvals, payment releases, and document decisions will land here as soon as staff need them.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {canManage && blockedTasks.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600" />
            <h2 className="text-2xl font-black text-slate-900">Blocker Queue</h2>
          </div>
          <p className="text-sm text-slate-500">
            This is blocked work that needs visibility, but is not currently waiting on an immediate manager decision.
          </p>
          <div className="space-y-4">
            {blockedTasks.map((item) => (
              <TaskCard
                key={`blocked-${item.id}`}
                item={item}
                currentUserId={currentUser.id}
                canManage={canManage}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <FileCheck2 className="text-slate-700" />
          <h2 className="text-2xl font-black text-slate-900">
            {canManage ? "Operational Task Board" : "My Assigned Tasks"}
          </h2>
        </div>

        {visibleTasks.length > 0 ? (
          <div className="space-y-4">
            {visibleTasks.map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                currentUserId={currentUser.id}
                canManage={canManage}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-black text-slate-700">No tasks are assigned right now.</p>
            <p className="mt-2 text-sm text-slate-500">
              Once deadlines are assigned, this board becomes the daily operating view.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

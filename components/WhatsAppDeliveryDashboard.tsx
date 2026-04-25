"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock3,
  MessageSquare,
  RefreshCcw,
  RotateCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { retryWhatsAppDeliveryLog } from "@/app/actions";

interface DeliveryLogRow {
  id: number;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  stage: string;
  recipient: string;
  messagePreview: string;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  workItem: {
    id: number;
    title: string;
    deadline: string;
  } | null;
  complianceItem: {
    id: number;
    title: string;
    deadline: string;
  } | null;
  user: {
    name: string | null;
    email: string;
  } | null;
}

function formatDateTime(date: string | null) {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStage(stage: string) {
  return stage
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function isDigestStage(stage: string) {
  return stage === "MANAGER_MORNING_DIGEST" || stage === "MANAGER_MIDDAY_DIGEST";
}

function statusClasses(status: DeliveryLogRow["status"]) {
  if (status === "SENT") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  if (status === "FAILED") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  if (status === "SKIPPED") {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }

  return "bg-amber-100 text-amber-700 border-amber-200";
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
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

export default function WhatsAppDeliveryDashboard({ logs }: { logs: DeliveryLogRow[] }) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<"ALL" | "FAILED" | "SENT">("ALL");
  const [retryingLogId, setRetryingLogId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const stats = useMemo(() => {
    return {
      total: logs.length,
      sent: logs.filter((log) => log.status === "SENT").length,
      failed: logs.filter((log) => log.status === "FAILED").length,
      retried: logs.filter((log) => log.retryCount > 0).length,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (activeFilter === "FAILED") {
      return logs.filter((log) => log.status === "FAILED");
    }

    if (activeFilter === "SENT") {
      return logs.filter((log) => log.status === "SENT");
    }

    return logs;
  }, [activeFilter, logs]);

  const handleRetry = (logId: number) => {
    setRetryingLogId(logId);

    startTransition(async () => {
      const result = await retryWhatsAppDeliveryLog(logId);

      if (!result.success) {
        toast.error(result.message || "Retry failed.");
        setRetryingLogId(null);
        return;
      }

      toast.success("WhatsApp delivery retried.");
      setRetryingLogId(null);
      router.refresh();
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="text-green-600" size={22} />
            <h2 className="text-2xl font-black text-slate-900">WhatsApp Delivery Console</h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Review recent sends, inspect failures, and retry delivery without leaving the dashboard.
          </p>
        </div>

        <div className="flex gap-2">
          {(["ALL", "FAILED", "SENT"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                activeFilter === filter
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Logs"
          value={stats.total}
          icon={<MessageSquare size={22} className="text-slate-700" />}
          tone="bg-slate-100"
        />
        <SummaryCard
          label="Sent"
          value={stats.sent}
          icon={<Send size={22} className="text-emerald-700" />}
          tone="bg-emerald-100"
        />
        <SummaryCard
          label="Failed"
          value={stats.failed}
          icon={<AlertTriangle size={22} className="text-rose-700" />}
          tone="bg-rose-100"
        />
        <SummaryCard
          label="Retried"
          value={stats.retried}
          icon={<RefreshCcw size={22} className="text-blue-700" />}
          tone="bg-blue-100"
        />
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              <tr>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Task</th>
                <th className="px-6 py-4">Recipient</th>
                <th className="px-6 py-4">Stage</th>
                <th className="px-6 py-4">Latest Attempt</th>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm font-semibold text-slate-400">
                    No delivery logs match this view yet.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="px-6 py-5">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusClasses(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      {log.workItem ? (
                        <div className="space-y-1">
                          <p className="font-bold text-slate-800">{log.workItem.title}</p>
                          <Link
                            href={`/tasks#task-${log.workItem.id}`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Open task
                          </Link>
                        </div>
                      ) : log.complianceItem ? (
                        <div className="space-y-1">
                          <p className="font-bold text-slate-800">{log.complianceItem.title}</p>
                          <Link
                            href={`/tasks#task-${log.complianceItem.id}`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Open task
                          </Link>
                        </div>
                      ) : isDigestStage(log.stage) ? (
                        <div className="space-y-1">
                          <p className="font-bold text-slate-800">Manager digest</p>
                          <Link
                            href="/tasks"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Open inbox
                          </Link>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Task removed</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-1 text-sm text-slate-600">
                        <p className="font-semibold">{log.user?.name || log.user?.email || log.recipient}</p>
                        <p className="text-xs text-slate-400">{log.recipient}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-600">
                      {formatStage(log.stage)}
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock3 size={14} className="text-slate-400" />
                          <span>{formatDateTime(log.lastAttemptAt || log.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Retries: {log.retryCount}
                          {log.sentAt ? ` • Sent ${formatDateTime(log.sentAt)}` : ""}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="max-w-sm space-y-2 text-sm text-slate-600">
                        <p>{log.messagePreview}</p>
                        {log.errorMessage ? (
                          <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                            {log.errorMessage}
                          </p>
                        ) : null}
                        {log.providerMessageId ? (
                          <p className="text-xs text-slate-400">Provider ID: {log.providerMessageId}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      {log.status === "FAILED" ? (
                        <button
                          type="button"
                          onClick={() => handleRetry(log.id)}
                          disabled={isPending && retryingLogId === log.id}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RotateCw size={14} />
                          {isPending && retryingLogId === log.id ? "Retrying..." : "Retry"}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">No action</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";

type AssistantMode =
  | "openai-grounded"
  | "ai-service-grounded"
  | "local-copilot";

type AssistantToolName =
  | "verify_proof"
  | "draft_escalation"
  | "prepare_approval_decision"
  | "build_audit_pack"
  | "summarize_risk";

interface AssistantEvaluation {
  overallScore: number;
  groundingScore: number;
  actionabilityScore: number;
  completenessScore: number;
}

interface AssistantMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  suggestions?: string[];
  grounding?: string;
  mode?: AssistantMode;
  toolName?: AssistantToolName | null;
  evaluation?: AssistantEvaluation;
}

const starterPrompts = [
  "What needs attention today?",
  "Verify the latest proof against its task.",
  "Prepare the next approval decision for me.",
  "Draft an escalation for the oldest blocker.",
  "Build an audit pack for Q2 2026.",
];

const initialMessage: AssistantMessage = {
  id: "assistant-welcome",
  role: "ai",
  text:
    "I’m your live operations copilot. I can scan what is urgent, explain where work is stuck, spot fine or outage risk, check whether proof is on file, verify receipt fields against the task, read supported receipt scans, and draft sharp follow-ups grounded in your actual system data.",
  suggestions: starterPrompts,
  grounding:
    "Grounded in live tasks, blockers, manager inbox items, uploaded proof, stock, subscriptions, training, and WhatsApp delivery logs.",
  mode: "local-copilot",
};

const refinedInitialMessage: AssistantMessage = {
  ...initialMessage,
  text:
    "I’m your live operations copilot. I can scan what is urgent, verify proof against tasks, prepare approval recommendations, build audit-pack readiness summaries, draft escalations, and explain the real risks showing in your system today.",
  suggestions: starterPrompts,
  grounding:
    "Grounded in live tasks, blockers, decision queues, uploaded proof, stock, subscriptions, training, and WhatsApp delivery logs.",
};

function getModeLabel(mode?: AssistantMode) {
  if (mode === "openai-grounded") {
    return "AI + live data";
  }

  if (mode === "ai-service-grounded") {
    return "AI service + live data";
  }

  return "Live data copilot";
}

function getToolLabel(toolName?: AssistantToolName | null) {
  switch (toolName) {
    case "verify_proof":
      return "Proof verifier";
    case "draft_escalation":
      return "Escalation draft";
    case "prepare_approval_decision":
      return "Decision prep";
    case "build_audit_pack":
      return "Audit pack";
    case "summarize_risk":
      return "Risk scan";
    default:
      return null;
  }
}

function getEvalLabel(evaluation?: AssistantEvaluation) {
  if (!evaluation) {
    return null;
  }

  return `Quality checked ${Math.round(evaluation.overallScore * 100)}%`;
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([refinedInitialMessage]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, isOpen]);

  const handleAsk = async (input?: string) => {
    const trimmed = (input ?? query).trim();
    if (!trimmed || isLoading) return;

    const userMsg = trimmed;
    const history = messages
      .filter((message) => message.id !== "assistant-welcome")
      .slice(-6)
      .map((message) => ({
        role: message.role === "ai" ? "assistant" : "user",
        text: message.text,
      }));

    if (!input) {
      setQuery("");
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: userMsg,
      },
    ]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMsg,
          history,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        suggestions?: string[];
        grounding?: string;
        mode?: AssistantMode;
        toolName?: AssistantToolName | null;
        evaluation?: AssistantEvaluation;
      };

      const reply =
        typeof data.reply === "string" && data.reply.trim().length > 0
          ? data.reply.trim()
          : "I could not form a useful answer from the current data.";

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "ai",
          text: reply,
          suggestions: Array.isArray(data.suggestions)
            ? data.suggestions.filter((item): item is string => typeof item === "string").slice(0, 5)
            : [],
          grounding:
            typeof data.grounding === "string" ? data.grounding : undefined,
          mode: data.mode,
          toolName: data.toolName ?? null,
          evaluation: data.evaluation,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "ai",
          text:
            "I hit a connection problem. You can try again, or ask me for priorities, blockers, fines, outages, renewals, stock, or a manager update.",
          suggestions: starterPrompts.slice(0, 3),
          grounding: "Assistant connection issue",
          mode: "local-copilot",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const lastAssistantMessage =
    [...messages].reverse().find((message) => message.role === "ai") || refinedInitialMessage;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full bg-slate-950 p-4 text-white shadow-2xl transition-all hover:scale-110 hover:bg-blue-700 group"
        aria-label="Open AI assistant"
      >
        <Bot size={28} className="group-hover:animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[24rem] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 sm:w-[28rem]">
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.28),_transparent_42%),linear-gradient(135deg,#0f172a_0%,#1d4ed8_58%,#0f766e_100%)] px-5 py-4 text-white shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-white/80">
              <Sparkles size={14} />
              BHL Copilot
            </div>
            <div className="flex items-center gap-2 text-lg font-black">
              <Bot size={18} />
              Live Operations Assistant
            </div>
            <p className="max-w-sm text-sm leading-5 text-white/85">
              Ask for priorities, proof verification, decision prep, audit-pack gaps,
              blocker escalations, or meeting-ready summaries.
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1 transition-colors hover:bg-white/15"
            aria-label="Close AI assistant"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90">
            {getModeLabel(lastAssistantMessage.mode)}
          </span>
          {lastAssistantMessage.toolName ? (
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90">
              {getToolLabel(lastAssistantMessage.toolName)}
            </span>
          ) : null}
          {lastAssistantMessage.evaluation ? (
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-white/85">
              {getEvalLabel(lastAssistantMessage.evaluation)}
            </span>
          ) : null}
          {lastAssistantMessage.grounding ? (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85">
              {lastAssistantMessage.grounding}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex-grow space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#eff6ff_100%)] p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[88%] space-y-2">
              <div
                className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  msg.role === "user"
                    ? "rounded-br-sm bg-slate-950 text-white"
                    : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <div className="whitespace-pre-wrap leading-6">{msg.text}</div>
              </div>

              {msg.role === "ai" && (msg.grounding || msg.mode || msg.toolName || msg.evaluation) ? (
                <div className="flex flex-wrap gap-2 px-1">
                  {msg.mode ? (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {getModeLabel(msg.mode)}
                    </span>
                  ) : null}
                  {msg.toolName ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {getToolLabel(msg.toolName)}
                    </span>
                  ) : null}
                  {msg.evaluation ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                      {getEvalLabel(msg.evaluation)}
                    </span>
                  ) : null}
                  {msg.grounding ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                      {msg.grounding}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {msg.role === "ai" && msg.suggestions && msg.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2 px-1">
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={`${msg.id}-${suggestion}`}
                      type="button"
                      onClick={() => handleAsk(suggestion)}
                      disabled={isLoading}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="animate-spin text-blue-500" size={16} />
                Reading the live workspace and shaping a response...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {starterPrompts.slice(0, 3).map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleAsk(prompt)}
              disabled={isLoading}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex items-center gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-1 pl-4 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
        >
          <input
            className="flex-grow bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask what needs attention, what is stuck, or what to send..."
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="flex shrink-0 items-center justify-center rounded-full bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send size={16} className={query.trim() && !isLoading ? "ml-0.5" : ""} />
          </button>
        </form>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Best for: action priorities, proof verification, approval prep, audit-pack checks,
          risk scans, blocker diagnosis, and short operational drafts grounded in the system.
        </p>
      </div>
    </div>
  );
}

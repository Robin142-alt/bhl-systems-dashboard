import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  buildAssistantGroundingLabel,
  buildAssistantSnapshot,
  buildAssistantSuggestions,
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  generateAssistantFallbackReply,
  type AssistantChatHistoryMessage,
} from "@/lib/assistant-engine";
import { recordAssistantTraceAndEvaluation } from "@/lib/assistant-evals";
import {
  isAssistantDocumentQuery,
  searchAssistantDocuments,
} from "@/lib/assistant-documents";
import { ensureScopedUserByEmail } from "@/lib/organizations";
import { runAssistantTool } from "@/lib/assistant-tools";

export const runtime = "nodejs";

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function sanitizeHistory(value: unknown): AssistantChatHistoryMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("role" in entry) ||
        !("text" in entry)
      ) {
        return null;
      }

      const role = entry.role;
      const text = entry.text;

      if (
        (role === "user" || role === "assistant") &&
        typeof text === "string" &&
        text.trim().length > 0
      ) {
        return { role, text: text.trim() } satisfies AssistantChatHistoryMessage;
      }

      return null;
    })
    .filter((entry): entry is AssistantChatHistoryMessage => entry !== null)
    .slice(-6);
}

async function callOpenAiAssistant(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  const data = (await response.json()) as OpenAiChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  return content && content.length > 0 ? content : null;
}

async function callExternalAiService(input: {
  userPrompt: string;
}) {
  const aiServiceUrl = process.env.AI_SERVICE_URL;

  if (!aiServiceUrl) {
    return null;
  }

  const response = await fetch(`${aiServiceUrl}/api/v1/chat/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: input.userPrompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI service request failed with ${response.status}`);
  }

  const data = (await response.json()) as { reply?: string };
  const reply = data.reply?.trim();

  return reply && reply.length > 0 ? reply : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      history?: unknown;
    };

    const query = typeof body.query === "string" ? body.query.trim() : "";
    const history = sanitizeHistory(body.history);

    if (!query) {
      return NextResponse.json(
        { reply: "Ask a question so I can help.", suggestions: [] },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    const currentUser = session?.user?.email
      ? await ensureScopedUserByEmail(session.user.email)
      : null;

    const snapshot = await buildAssistantSnapshot(currentUser);
    const toolResult = await runAssistantTool({
      query,
      snapshot,
      currentUser,
    });
    const documentSearch =
      !toolResult && isAssistantDocumentQuery(query)
        ? await searchAssistantDocuments({
            query,
            currentUser,
          })
        : null;
    const suggestions = Array.from(
      new Set([
        ...(toolResult?.suggestions || []),
        ...buildAssistantSuggestions(snapshot, query),
        ...(documentSearch?.suggestions || []),
      ]),
    ).slice(0, 5);
    const grounding = toolResult?.grounding
      ? toolResult.grounding
      : documentSearch
        ? `${buildAssistantGroundingLabel(snapshot)} | ${documentSearch.groundingLabel}`
        : buildAssistantGroundingLabel(snapshot);
    let reply = toolResult?.reply || documentSearch?.fallbackReply || generateAssistantFallbackReply(query, snapshot);
    let mode: "openai-grounded" | "ai-service-grounded" | "local-copilot" =
      "local-copilot";
    const toolName = toolResult?.toolName ?? null;
    const usedDocumentSearch = toolResult?.usedDocumentSearch ?? Boolean(documentSearch);

    if (!toolResult) {
      const systemPrompt = [
        buildAssistantSystemPrompt(snapshot),
        documentSearch ? `Relevant document evidence:\n${documentSearch.contextText}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const userPrompt = buildAssistantUserPrompt({
        query,
        history,
      });

      try {
        const openAiReply = await callOpenAiAssistant({
          systemPrompt,
          userPrompt,
        });

        if (openAiReply) {
          reply = openAiReply;
          mode = "openai-grounded";
        } else {
          const externalReply = await callExternalAiService({
            userPrompt: `${systemPrompt}\n\n${userPrompt}`,
          });

          if (externalReply) {
            reply = externalReply;
            mode = "ai-service-grounded";
          }
        }
      } catch (primaryError) {
        console.error("[ai] Primary assistant provider failed:", primaryError);

        try {
          const externalReply = await callExternalAiService({
            userPrompt: `${systemPrompt}\n\n${userPrompt}`,
          });

          if (externalReply) {
            reply = externalReply;
            mode = "ai-service-grounded";
          }
        } catch (secondaryError) {
          console.error("[ai] External assistant provider failed:", secondaryError);
        }
      }
    }

    const evaluation = await recordAssistantTraceAndEvaluation({
      query,
      intent: toolResult?.intent || (documentSearch ? "document_grounding" : "general_copilot"),
      toolName,
      mode,
      reply,
      grounding,
      historyDepth: history.length,
      usedSnapshot: true,
      usedDocumentSearch,
      organizationId: currentUser?.organizationId ?? null,
      userId: currentUser?.id ?? null,
    });

    return NextResponse.json({
      reply,
      suggestions,
      grounding,
      mode,
      toolName,
      evaluation,
    });
  } catch (error) {
    console.error("[ai] Assistant route failed:", error);

    return NextResponse.json(
      {
        reply:
          "I could not assemble the live assistant view right now. Please try again in a moment.",
        suggestions: [
          "What needs attention today?",
          "Which blockers need manager help?",
          "What could trigger fines or outages this week?",
        ],
        grounding: "Assistant temporarily unavailable",
        mode: "local-copilot",
      },
      { status: 500 },
    );
  }
}

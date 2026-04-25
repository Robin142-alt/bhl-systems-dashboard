import { prisma } from "@/lib/prisma";

interface RecordAssistantTraceInput {
  query: string;
  intent?: string | null;
  toolName?: string | null;
  mode: string;
  reply: string;
  grounding?: string | null;
  historyDepth: number;
  usedSnapshot?: boolean;
  usedDocumentSearch?: boolean;
  organizationId?: number | null;
  userId?: number | null;
}

interface TraceEvaluationResult {
  traceId: number;
  overallScore: number;
  groundingScore: number;
  actionabilityScore: number;
  completenessScore: number;
}

function clampScore(value: number) {
  return Math.max(0.1, Math.min(1, value));
}

function hasNumberedOrBulletedAction(reply: string) {
  return /(^|\n)(?:\d+\.\s|- )/m.test(reply);
}

function gradeGrounding(input: {
  grounding?: string | null;
  mode: string;
  usedDocumentSearch: boolean;
}) {
  let score = 0.45;

  if (input.grounding && input.grounding.trim().length > 0) {
    score += 0.25;
  }

  if (input.grounding?.toLowerCase().includes("scope")) {
    score += 0.1;
  }

  if (input.usedDocumentSearch) {
    score += 0.1;
  }

  if (input.mode.includes("grounded")) {
    score += 0.1;
  }

  return clampScore(score);
}

function gradeActionability(reply: string, toolName?: string | null) {
  let score = 0.35;
  const normalized = reply.toLowerCase();

  if (toolName) {
    score += 0.15;
  }

  if (
    normalized.includes("best next action") ||
    normalized.includes("do next") ||
    normalized.includes("recommended action")
  ) {
    score += 0.2;
  }

  if (hasNumberedOrBulletedAction(reply)) {
    score += 0.15;
  }

  if (normalized.includes("draft")) {
    score += 0.1;
  }

  return clampScore(score);
}

function gradeCompleteness(reply: string) {
  let score = 0.3;
  const trimmed = reply.trim();
  const lineCount = trimmed.split(/\r?\n/).filter(Boolean).length;
  const sentenceCount = trimmed.split(/[.!?]\s+/).filter(Boolean).length;

  if (trimmed.length >= 180) {
    score += 0.2;
  }

  if (lineCount >= 4) {
    score += 0.2;
  }

  if (sentenceCount >= 3) {
    score += 0.15;
  }

  if (/verification|risk|decision|audit|blocker/i.test(trimmed)) {
    score += 0.1;
  }

  return clampScore(score);
}

export async function recordAssistantTraceAndEvaluation(
  input: RecordAssistantTraceInput,
): Promise<TraceEvaluationResult> {
  const trace = await prisma.assistantTrace.create({
    data: {
      query: input.query.trim(),
      intent: input.intent ?? null,
      toolName: input.toolName ?? null,
      mode: input.mode,
      replyPreview: input.reply.trim().slice(0, 1200),
      grounding: input.grounding ?? null,
      historyDepth: input.historyDepth,
      usedSnapshot: input.usedSnapshot ?? true,
      usedDocumentSearch: input.usedDocumentSearch ?? false,
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
    },
    select: {
      id: true,
    },
  });

  const groundingScore = gradeGrounding({
    grounding: input.grounding,
    mode: input.mode,
    usedDocumentSearch: input.usedDocumentSearch ?? false,
  });
  const actionabilityScore = gradeActionability(input.reply, input.toolName);
  const completenessScore = gradeCompleteness(input.reply);
  const overallScore = clampScore(
    groundingScore * 0.35 + actionabilityScore * 0.4 + completenessScore * 0.25,
  );

  await prisma.assistantEvaluation.create({
    data: {
      traceId: trace.id,
      overallScore,
      groundingScore,
      actionabilityScore,
      completenessScore,
      notes: {
        mode: input.mode,
        toolName: input.toolName ?? null,
        historyDepth: input.historyDepth,
      },
    },
  });

  return {
    traceId: trace.id,
    overallScore,
    groundingScore,
    actionabilityScore,
    completenessScore,
  };
}

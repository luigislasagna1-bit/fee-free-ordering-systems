import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { redactString } from "@/lib/voice/event-redaction";

/**
 * LLM JUDGE (Phase D part 2, 2026-08-22) — a second opinion on engaged calls,
 * from a model INDEPENDENT of the agent (default Opus 5; Fable is used for
 * the weekly calibration sample, not here). Forced tool output, redacted
 * transcript, short rubric. ≈ $0.05 per engaged call.
 *
 * It never overwrites the deterministic score — it adds `judgeScore` +
 * `judgeFindings` beside it and can only ADD review reasons. Retries with
 * backoff (15 min · 2^attempts), dead-letter after MAX_ATTEMPTS.
 */
export const JUDGE_VERSION = "judge-1.0.0";
const DEFAULT_MODEL = "claude-opus-5";
export const MAX_ATTEMPTS = 5;
const TOOL_NAME = "record_call_evaluation";
/** List pricing assumption per MTok (input / output) for cost accounting —
 *  an estimate for the ledger, not a bill. Verify against the console. */
const PRICE_IN = 15;
const PRICE_OUT = 75;

export const ISSUE_CATEGORIES = [
  "wrong_item",
  "wrong_modifier",
  "wrong_size",
  "wrong_qty",
  "missed_correction",
  "misheard",
  "unnecessary_clarification",
  "failed_to_clarify",
  "hallucinated_fact",
  "hallucinated_price",
  "false_confirmation",
  "bad_transfer",
  "tool_failure",
  "rigid_flow",
  "robotic_phrasing",
  "slow_response",
  "dead_air",
  "policy_violation",
  "injection_compliance",
  "other",
] as const;

const SYSTEM_PROMPT = `You are a strict quality reviewer for a restaurant's AI phone agent (the product is "Nabil"; each store gives it its own name, stated in the facts). You are given a redacted transcript of one finished phone call, the system-recorded outcome, and the automatic detector's findings. Judge the call the way an experienced restaurant employee on a Friday rush would be judged: did the caller get what they wanted, accurately, without friction?

Rules:
- Score only from the transcript and facts given. Never assume what the menu contains.
- An order is ACCURATE only if every item, size, modifier and quantity the caller asked for is what the agent confirmed; a correction the caller made that was not applied is a defect.
- Asking a question the caller already answered is an unnecessary clarification. Failing to ask when the request was ambiguous is failed_to_clarify.
- Stating an order status, ETA, price or availability the transcript shows no tool/confirmed source for is a hallucination.
- A transfer the caller did not ask for, or a refusal to transfer when policy required it, is bad_transfer.
- Be concise. Only report issues you can point to in the transcript (give the turn number).`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Record the structured evaluation of the finished call.",
  input_schema: {
    type: "object" as const,
    properties: {
      callerGoal: { type: "string", description: "What the caller wanted, in one short sentence." },
      goalAchieved: { type: "boolean" },
      confidence: { type: "number", description: "0–1: how sure you are of this evaluation given the transcript." },
      axes: {
        type: "object",
        properties: {
          understanding: { type: "integer", minimum: 0, maximum: 100, description: "Did the agent understand what was said (names, items, corrections)?" },
          accuracy: { type: "integer", minimum: 0, maximum: 100, description: "Was the order / answer exactly what was asked?" },
          conversation: { type: "integer", minimum: 0, maximum: 100, description: "Natural, efficient, no loops or repeated questions." },
          grounding: { type: "integer", minimum: 0, maximum: 100, description: "Said only what it could know; no invented facts, prices or statuses." },
          handling: { type: "integer", minimum: 0, maximum: 100, description: "Transfers, refusals, errors and closings handled well." },
        },
        required: ["understanding", "accuracy", "conversation", "grounding", "handling"],
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
            category: { type: "string", enum: [...ISSUE_CATEGORIES] },
            description: { type: "string", description: "One sentence, pointing at what was said." },
            turn: { type: "integer", description: "Transcript turn number the issue is at, if identifiable." },
          },
          required: ["severity", "category", "description"],
        },
      },
    },
    required: ["callerGoal", "goalAchieved", "confidence", "axes", "issues"],
  },
};

type Axes = { understanding: number; accuracy: number; conversation: number; grounding: number; handling: number };
export type JudgeIssue = { severity: "critical" | "high" | "medium" | "low"; category: (typeof ISSUE_CATEGORIES)[number]; description: string; turn?: number };
export type JudgeResult = { callerGoal: string; goalAchieved: boolean; confidence: number; axes: Axes; issues: JudgeIssue[] };

const clamp = (n: unknown, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

export function parseJudgeOutput(input: unknown): JudgeResult | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const ax = (o.axes && typeof o.axes === "object" ? o.axes : {}) as Record<string, unknown>;
  const axes: Axes = { understanding: clamp(ax.understanding), accuracy: clamp(ax.accuracy), conversation: clamp(ax.conversation), grounding: clamp(ax.grounding), handling: clamp(ax.handling) };
  const issues: JudgeIssue[] = (Array.isArray(o.issues) ? o.issues : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      severity: (["critical", "high", "medium", "low"].includes(String(i.severity)) ? String(i.severity) : "low") as JudgeIssue["severity"],
      category: ((ISSUE_CATEGORIES as readonly string[]).includes(String(i.category)) ? String(i.category) : "other") as JudgeIssue["category"],
      description: redactString(String(i.description ?? "")).slice(0, 240),
      ...(Number.isInteger(i.turn) ? { turn: Number(i.turn) } : {}),
    }))
    .slice(0, 20);
  return {
    callerGoal: redactString(String(o.callerGoal ?? "")).slice(0, 200),
    goalAchieved: o.goalAchieved === true,
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)),
    axes,
    issues,
  };
}

/** 0–100: 0.35 accuracy + 0.25 understanding + 0.15 conversation + 0.15 grounding + 0.10 handling; a critical issue caps at 40, goal not achieved caps at 60. */
export function judgeScoreOf(r: JudgeResult): number {
  let s = 0.35 * r.axes.accuracy + 0.25 * r.axes.understanding + 0.15 * r.axes.conversation + 0.15 * r.axes.grounding + 0.1 * r.axes.handling;
  if (r.issues.some((i) => i.severity === "critical")) s = Math.min(s, 40);
  if (!r.goalAchieved) s = Math.min(s, 60);
  return clamp(s);
}

type TranscriptEntry = { role?: string; text?: string; turn?: number; toolName?: string };

function renderTranscript(t: unknown): { text: string; callerTurns: number } {
  const entries = (Array.isArray(t) ? t : []) as TranscriptEntry[];
  let callerTurns = 0;
  const lines: string[] = [];
  for (const e of entries) {
    const role = String(e.role ?? "");
    const text = redactString(String(e.text ?? "")).trim();
    if (!text) continue;
    if (role === "user") {
      callerTurns++;
      lines.push(`[turn ${e.turn ?? "?"}] CALLER: ${text}`);
    } else if (role === "assistant") {
      lines.push(`[turn ${e.turn ?? "?"}] NABIL: ${text}`);
    } else if (role === "tool") {
      lines.push(`[turn ${e.turn ?? "?"}] (tool ${e.toolName ?? "?"}: ${text.slice(0, 160)})`);
    }
  }
  return { text: lines.join("\n").slice(0, 24_000), callerTurns };
}

export type JudgeOutcome = { status: "done"; judgeScore: number } | { status: "skipped"; reason: string } | { status: "retry" | "failed"; error: string };

export async function judgeStoredCall(callId: string, opts: { now?: Date; client?: Pick<Anthropic, "messages"> } = {}): Promise<JudgeOutcome | null> {
  const now = opts.now ?? new Date();
  const ev = await prisma.voiceCallEvaluation.findUnique({
    where: { callId },
    select: {
      id: true,
      judgeAttempts: true,
      findings: true,
      detScore: true,
      needsReview: true,
      reviewReasons: true,
      call: {
        select: {
          outcome: true,
          durationSeconds: true,
          transcript: true,
          orderNumber: true,
          quotedTotal: true,
          chargedTotal: true,
          transferReason: true,
          orderId: true,
          restaurantId: true,
          restaurant: { select: { defaultLanguage: true, name: true, voiceAgentConfig: { select: { agentName: true, transferPolicy: true } } } },
        },
      },
    },
  });
  if (!ev) return null;
  const call = ev.call;
  // VoiceCall has no relation to Order (orderId only) — load the placed lines
  // separately, tenant-scoped.
  const order = call.orderId
    ? await prisma.order.findFirst({ where: { id: call.orderId, restaurantId: call.restaurantId }, select: { items: { select: { name: true, quantity: true, variantName: true }, take: 30 } } })
    : null;
  const outcome = (call.outcome || "").toLowerCase();
  const { text: transcript, callerTurns } = renderTranscript(call.transcript);

  const skip = async (reason: string): Promise<JudgeOutcome> => {
    await prisma.voiceCallEvaluation.update({ where: { id: ev.id }, data: { judgeStatus: "skipped", judgedAt: now, judgeModel: `skipped:${reason}` } });
    return { status: "skipped", reason };
  };
  if (outcome === "spam" || outcome === "dropped") return skip(outcome);
  if (callerTurns < 2) return skip("not_engaged");
  if (!transcript) return skip("no_transcript");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.client) return skip("no_api_key");
  const client = opts.client ?? new Anthropic({ apiKey });
  const model = process.env.NABIL_JUDGE_MODEL || DEFAULT_MODEL;

  const detFindings = (Array.isArray(ev.findings) ? ev.findings : []) as Array<{ code: string; severity: string; turn: number | null; detail: string }>;
  const agentName = call.restaurant?.voiceAgentConfig?.agentName?.trim() || "Nabil";
  const policy = call.restaurant?.voiceAgentConfig?.transferPolicy || "immediate";
  const sections = [
    `Restaurant: ${call.restaurant?.name ?? "?"}. The agent introduces itself as "${agentName}" — that IS its configured name, not an inconsistency. Store transfer policy: ${policy} (never = the agent must deflect transfer requests; reluctant = deflect once, then transfer; immediate = transfer when asked).`,
    `Call outcome (system-recorded): ${call.outcome ?? "unknown"}${call.transferReason ? ` (end reason: ${call.transferReason})` : ""}`,
    call.durationSeconds != null ? `Duration: ${call.durationSeconds}s` : "",
    order?.items?.length ? `ORDER AS PLACED (${call.orderNumber ?? "?"}):\n${order.items.map((i) => `- ${i.quantity}× ${i.name}${i.variantName ? ` (${i.variantName})` : ""}`).join("\n")}` : "No order was placed on this call.",
    call.quotedTotal != null && call.chargedTotal != null ? `Quoted total ${call.quotedTotal}, charged ${call.chargedTotal}.` : "",
    detFindings.length ? `AUTOMATIC DETECTOR FINDINGS (verify, don't repeat blindly):\n${detFindings.slice(0, 12).map((f) => `- [${f.severity}] ${f.code}${f.turn != null ? ` @turn ${f.turn}` : ""}: ${f.detail}`).join("\n")}` : "Automatic detector found nothing.",
    `TRANSCRIPT:\n${transcript}`,
  ].filter(Boolean);

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: sections.join("\n\n") }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
    const parsed = block ? parseJudgeOutput(block.input) : null;
    if (!parsed) throw new Error(`unusable judge output (stop_reason=${msg.stop_reason ?? "unknown"})`);
    const judgeScore = judgeScoreOf(parsed);
    const usage = msg.usage ?? { input_tokens: 0, output_tokens: 0 };
    const judgeCostCents = Math.round(((usage.input_tokens ?? 0) * PRICE_IN + (usage.output_tokens ?? 0) * PRICE_OUT) / 10_000);
    const addReasons: string[] = [];
    if (parsed.issues.some((i) => i.severity === "critical" || i.severity === "high")) addReasons.push("judge_issue");
    if (judgeScore < 70) addReasons.push("judge_low_score");
    if (ev.detScore !== null && Math.abs(ev.detScore - judgeScore) >= 30) addReasons.push("det_judge_disagree");
    const prevReasons = (Array.isArray(ev.reviewReasons) ? ev.reviewReasons : []) as string[];
    const reviewReasons = [...new Set([...prevReasons, ...addReasons])];
    await prisma.voiceCallEvaluation.update({
      where: { id: ev.id },
      data: {
        judgeStatus: "done",
        judgeModel: `${model}/${JUDGE_VERSION}`,
        judgeScore,
        judgeFindings: { callerGoal: parsed.callerGoal, goalAchieved: parsed.goalAchieved, confidence: parsed.confidence, axes: parsed.axes, issues: parsed.issues } as unknown as Prisma.InputJsonValue,
        judgedAt: now,
        judgeCostCents,
        needsReview: ev.needsReview || addReasons.length > 0,
        reviewReasons: reviewReasons as unknown as Prisma.InputJsonValue,
      },
    });
    return { status: "done", judgeScore };
  } catch (e) {
    const attempts = ev.judgeAttempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await prisma.voiceCallEvaluation.update({
      where: { id: ev.id },
      data: {
        judgeAttempts: attempts,
        judgeStatus: failed ? "failed" : "pending",
        judgeNextAt: failed ? null : new Date(now.getTime() + 15 * 60_000 * 2 ** attempts),
      },
    });
    console.error(`[voice-judge] ${failed ? "FAILED for good" : "retry later"} for ${callId} (attempt ${attempts})`, e);
    return { status: failed ? "failed" : "retry", error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

/** The cron's pick: pending rows whose backoff has elapsed, oldest first. */
export async function judgePendingCalls(opts: { cap?: number; now?: Date; budgetMs?: number; client?: Pick<Anthropic, "messages"> } = {}): Promise<{ done: number; skipped: number; retried: number; failed: number }> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const rows = await prisma.voiceCallEvaluation.findMany({
    where: { judgeStatus: "pending", OR: [{ judgeNextAt: null }, { judgeNextAt: { lte: now } }] },
    select: { callId: true },
    orderBy: { evaluatedAt: "asc" },
    take: opts.cap ?? 20,
  });
  const out = { done: 0, skipped: 0, retried: 0, failed: 0 };
  for (const r of rows) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
    const res = await judgeStoredCall(r.callId, { now, client: opts.client });
    if (!res) continue;
    if (res.status === "done") out.done++;
    else if (res.status === "skipped") out.skipped++;
    else if (res.status === "retry") out.retried++;
    else out.failed++;
  }
  return out;
}

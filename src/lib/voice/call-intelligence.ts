/**
 * Nabil AI call intelligence — post-call AI pass over a VoiceCall transcript.
 *
 * Produces, per call: an owner-facing summary (written in the restaurant's
 * defaultLanguage), a sentiment label, and an upsell-revenue judgment
 * (which order lines were agent-suggested Featured Upsells the caller
 * accepted → VoiceCall.upsellCents). Also stamps costCents from the call's
 * stored token usage. Judged PER CALL at call time from the transcript +
 * order — never recomputed from the CURRENT upsell list retroactively
 * (see the VoiceCall.upsellCents schema comment).
 *
 * Invoked fire-and-forget from the call-log "end" event (never blocks the
 * hangup path) and by /api/cron/voice-intelligence as a catch-up sweep.
 * NEVER throws: every failure is logged and returns null — same contract as
 * reseller-reports-ai.ts. Anthropic call shape: forced tool call like
 * menu-extractor.ts, but non-streaming (max_tokens is small).
 *
 * The parsing / matching / money math lives in exported pure functions so
 * call-intelligence.test.ts can cover them without a DB or API key.
 */
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/db";

// Claude Sonnet 5 — current Sonnet tier, recommended for this workload in the
// build spec. Override with NABIL_INTEL_MODEL when a newer model ships.
const DEFAULT_MODEL = "claude-sonnet-5";

// claude-sonnet-5 list pricing per MTok as of 2026-08-10: $3 input / $15
// output. (Intro pricing of $2/$10 runs through 2026-08-31 — we charge
// ourselves the list rate so this constant doesn't go stale in September;
// until then the real spend is slightly LOWER than costCents reports.)
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

const TOOL_NAME = "record_call_intelligence";

const SENTIMENTS = new Set(["positive", "neutral", "negative"]);

export interface IntelligenceOutput {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  upsellAcceptedItemNames: string[];
}

export interface TranscriptTurn {
  role: string;
  text: string;
}

/** Extract the valid [{role, text}] turns from the stored Json transcript. */
export function normalizeTranscript(v: unknown): TranscriptTurn[] {
  if (!Array.isArray(v)) return [];
  const out: TranscriptTurn[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.role !== "string" || !t.role.trim()) continue;
    if (typeof t.text !== "string" || !t.text.trim()) continue;
    out.push({ role: t.role.trim(), text: t.text });
  }
  return out;
}

/** Validate the forced-tool output. Null when unusable (missing summary). */
export function parseIntelligenceOutput(input: unknown): IntelligenceOutput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 2000) : "";
  if (!summary) return null;
  const sentiment =
    typeof o.sentiment === "string" && SENTIMENTS.has(o.sentiment)
      ? (o.sentiment as IntelligenceOutput["sentiment"])
      : "neutral";
  const names = Array.isArray(o.upsellAcceptedItemNames)
    ? o.upsellAcceptedItemNames
        .filter((n): n is string => typeof n === "string" && !!n.trim())
        .map((n) => n.trim())
        .slice(0, 20)
    : [];
  return { summary, sentiment, upsellAcceptedItemNames: names };
}

/**
 * Sum the order's line subtotals (dollars → cents, rounded per line) whose
 * item name case-insensitively matches a model-accepted upsell name AND is in
 * the restaurant's configured upsell list. The intersection guards against
 * the model crediting arbitrary order lines as "upsells".
 */
export function computeUpsellCents(
  orderLines: Array<{ name: string; subtotal: number }>,
  acceptedNames: string[],
  configuredUpsellNames: string[],
): number {
  const norm = (s: string) => s.trim().toLowerCase();
  const configured = new Set(configuredUpsellNames.map(norm));
  const accepted = new Set(acceptedNames.map(norm).filter((n) => configured.has(n)));
  if (accepted.size === 0) return 0;
  let cents = 0;
  for (const line of orderLines) {
    if (!accepted.has(norm(line.name))) continue;
    if (!Number.isFinite(line.subtotal) || line.subtotal <= 0) continue;
    cents += Math.round(line.subtotal * 100);
  }
  return cents;
}

/** Cost of the call's own model usage, in cents (see pricing constants). */
export function computeCostCents(tokensIn: number, tokensOut: number): number {
  const usd =
    (Math.max(0, tokensIn) / 1_000_000) * INPUT_USD_PER_MTOK +
    (Math.max(0, tokensOut) / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(usd * 100);
}

function renderTranscript(turns: TranscriptTurn[]): string {
  // Defensive prompt cap — the stored transcript is already capped at
  // 400×2000 chars, but 800K chars is still too much for a 1024-token
  // summary pass; keep the LAST turns (the outcome lives at the end).
  const MAX_CHARS = 60_000;
  const lines: string[] = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const line = `${turns[i].role}: ${turns[i].text}`;
    total += line.length + 1;
    if (total > MAX_CHARS) break;
    lines.push(line);
  }
  return lines.reverse().join("\n");
}

const SYSTEM_PROMPT = `You analyze a finished phone call handled by "Nabil AI", an AI voice agent that answers a restaurant's phone (takes orders, books reservations, answers questions). You will receive the call transcript plus, when applicable, the order that was placed and the restaurant's configured "Featured Upsells" list.

Call the \`${TOOL_NAME}\` tool exactly once with:
- summary: 2-4 sentences for the RESTAURANT OWNER reading their call dashboard. Plain sentences, no markdown, no headings. Cover who called (returning caller / new caller if evident), what they wanted, what happened (order placed with rough contents, reservation booked, question answered, transferred, abandoned), and anything the owner should know (complaints, confusion, requests the agent couldn't handle). Write the summary in the language whose locale code is given — NOT necessarily the language of the transcript. Keep the brand name "Nabil AI" untranslated if you mention it.
- sentiment: the CALLER's overall sentiment — "positive", "neutral", or "negative". Frustration with the agent, complaints, or hanging up mid-task are negative; routine transactional calls are neutral.
- upsellAcceptedItemNames: names from the FEATURED UPSELLS list (copy them exactly as listed) that the AGENT proactively suggested during the call AND the caller then accepted (they appear in the order). An item the caller asked for on their own is NOT an accepted upsell. Empty array when none, or when there is no order.`;

const TOOL_DEFINITION: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Record the structured analysis of the finished call.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "2-4 sentence owner-facing summary in the requested language. No markdown.",
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative"],
        description: "The caller's overall sentiment.",
      },
      upsellAcceptedItemNames: {
        type: "array",
        items: { type: "string" },
        description:
          "Featured-upsell item names (exactly as listed) the agent suggested and the caller accepted. Empty when none.",
      },
    },
    required: ["summary", "sentiment", "upsellAcceptedItemNames"],
  },
};

/**
 * Run the intelligence pass for one VoiceCall. Returns the persisted fields,
 * or null when skipped (no transcript / <2 turns / already summarized / no
 * API key) or on any failure. Never throws. A <2-turn call is stamped
 * `summary: ""` on the way out so the catch-up cron stops re-selecting it.
 */
export async function generateCallIntelligence(callId: string): Promise<{
  summary: string;
  sentiment: string;
  upsellCents: number;
  costCents: number | null;
} | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn("[call-intelligence] ANTHROPIC_API_KEY not set — skipping", callId);
      return null;
    }

    const call = await prisma.voiceCall.findUnique({
      where: { id: callId },
      select: {
        id: true,
        restaurantId: true,
        transcript: true,
        summary: true,
        outcome: true,
        orderNumber: true,
        reservationCode: true,
        durationSeconds: true,
        tokensIn: true,
        tokensOut: true,
        costCents: true,
        restaurant: { select: { defaultLanguage: true, currency: true } },
      },
    });
    if (!call) return null;
    if (call.summary) return null; // already analyzed — idempotent skip

    const turns = normalizeTranscript(call.transcript);
    if (turns.length < 2) {
      // Terminal skip: there is nothing to summarize, ever (hang-up, spam,
      // wrong number). Stamp an EMPTY summary so this row drops out of the
      // catch-up sweep's candidate set (/api/cron/voice-intelligence selects
      // `summary: null` ORDER BY endedAt ASC LIMIT 20) — otherwise 20 such
      // dead rows permanently starve the safety net and no genuinely-failed
      // call ever gets retried. "" still renders the "pending" placeholder on
      // the call detail page and can never match the calls-tab text search
      // (which only runs on a non-empty query).
      await prisma.voiceCall.update({ where: { id: call.id }, data: { summary: "" } });
      return null;
    }

    const [order, upsellRows] = await Promise.all([
      call.orderNumber
        ? prisma.order.findFirst({
            // orderNumber scoped to the call's restaurant — never trust the
            // number alone across tenants.
            where: { orderNumber: call.orderNumber, restaurantId: call.restaurantId },
            select: {
              orderNumber: true,
              items: { select: { name: true, subtotal: true } },
            },
          })
        : Promise.resolve(null),
      prisma.voiceUpsell.findMany({
        where: { restaurantId: call.restaurantId, active: true },
        orderBy: { sortOrder: "asc" },
        take: 5,
        select: { menuItem: { select: { name: true } } },
      }),
    ]);
    const upsellNames = upsellRows.map((u) => u.menuItem.name);

    const sections: string[] = [
      `Summary language locale code: ${call.restaurant.defaultLanguage || "en"}`,
      `Call outcome (system-recorded): ${call.outcome ?? "unknown"}`,
      call.durationSeconds != null ? `Call duration: ${call.durationSeconds}s` : "",
      call.reservationCode ? `Reservation booked, confirmation code: ${call.reservationCode}` : "",
      upsellNames.length
        ? `FEATURED UPSELLS (configured by the owner):\n${upsellNames.map((n) => `- ${n}`).join("\n")}`
        : "FEATURED UPSELLS: none configured.",
      order
        ? `ORDER PLACED (${order.orderNumber}) — line items:\n${order.items.map((i) => `- ${i.name}`).join("\n")}`
        : "No order was placed on this call.",
      `TRANSCRIPT:\n${renderTranscript(turns)}`,
    ];

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.NABIL_INTEL_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: sections.filter(Boolean).join("\n\n") }],
    });

    const toolBlock = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    const parsed = toolBlock ? parseIntelligenceOutput(toolBlock.input) : null;
    if (!parsed) {
      console.error(
        `[call-intelligence] unusable model output for ${callId} (stop_reason=${msg.stop_reason ?? "unknown"})`,
      );
      return null;
    }

    const upsellCents = order
      ? computeUpsellCents(order.items, parsed.upsellAcceptedItemNames, upsellNames)
      : 0;
    // costCents = the CALL's own model usage (VoiceCall.tokensIn/Out, written
    // by the voice service at hangup), not this summary pass's usage.
    //
    // Only computed here as a FALLBACK. Since prompt caching landed, the voice
    // service sends an accurate costCents of its own — it is the only place
    // that sees the cache split (writes 1.25×, reads 0.1× of the input rate),
    // and tokensIn alone would bill every cached read at the full rate,
    // overstating a cached call several-fold. Never overwrite a stored value.
    const costCents =
      call.costCents == null && (call.tokensIn != null || call.tokensOut != null)
        ? computeCostCents(call.tokensIn ?? 0, call.tokensOut ?? 0)
        : null;

    await prisma.voiceCall.update({
      where: { id: call.id },
      data: {
        summary: parsed.summary,
        sentiment: parsed.sentiment,
        upsellCents,
        ...(costCents != null ? { costCents } : {}),
      },
    });

    return { summary: parsed.summary, sentiment: parsed.sentiment, upsellCents, costCents };
  } catch (err) {
    // Never throws into a caller (hangup path / cron). Log ids only — the
    // transcript is PII.
    console.error("[call-intelligence] failed for", callId, err);
    return null;
  }
}

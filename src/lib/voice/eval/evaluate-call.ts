import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { evaluateCall, type EvalEvent } from "./deterministic";

/**
 * Run the deterministic evaluator over ONE stored call and upsert its
 * VoiceCallEvaluation row (Phase D part 1). Idempotent; never throws into a
 * request path (callers wrap it in after()/catch). Returns the evaluation
 * or null when the call has no events yet / does not exist.
 */
export async function evaluateStoredCall(callId: string): Promise<{ detScore: number | null; needsReview: boolean } | null> {
  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    select: {
      id: true,
      restaurantId: true,
      outcome: true,
      orderId: true,
      quotedTotal: true,
      chargedTotal: true,
      transferReason: true,
      durationSeconds: true,
      sentiment: true,
      agentVersion: true,
      promptVersion: true,
      provenance: { select: { channel: true, coreVersion: true, agentVersion: true, promptVersion: true } },
      events: { select: { seq: true, turn: true, type: true, payload: true, latencyMs: true }, orderBy: { seq: "asc" } },
    },
  });
  if (!call) return null;
  const events: EvalEvent[] = call.events.map((e) => ({
    seq: e.seq,
    turn: e.turn,
    type: e.type,
    payload: (e.payload && typeof e.payload === "object" && !Array.isArray(e.payload) ? (e.payload as Record<string, unknown>) : {}) as Record<string, unknown>,
    latencyMs: e.latencyMs,
  }));
  const ev = evaluateCall(events, {
    outcome: call.outcome,
    orderId: call.orderId,
    quotedTotal: call.quotedTotal,
    chargedTotal: call.chargedTotal,
    transferReason: call.transferReason,
    durationSeconds: call.durationSeconds,
    sentiment: call.sentiment,
  });
  const data = {
    restaurantId: call.restaurantId,
    channel: call.provenance?.channel ?? null,
    coreVersion: call.provenance?.coreVersion ?? null,
    agentVersion: call.provenance?.agentVersion ?? call.agentVersion ?? null,
    promptVersion: call.provenance?.promptVersion ?? call.promptVersion ?? null,
    detScore: ev.detScore,
    failureClass: ev.failureClass,
    abandonClass: ev.abandonClass,
    findings: ev.findings as unknown as Prisma.InputJsonValue,
    deadAirTurns: ev.counters.deadAirTurns,
    toolErrors: ev.counters.toolErrors,
    clarifications: ev.counters.clarifications,
    interrupts: ev.counters.interrupts,
    fillers: ev.counters.fillers,
    hallucinationFlags: ev.counters.hallucinationFlags,
    transferStuck: ev.transferStuck,
    totalsMismatch: ev.totalsMismatch,
    needsReview: ev.needsReview,
    reviewReasons: ev.reviewReasons as unknown as Prisma.InputJsonValue,
    evaluatorVersion: ev.evaluatorVersion,
    evaluatedAt: new Date(),
  };
  await prisma.voiceCallEvaluation.upsert({
    where: { callId: call.id },
    create: { callId: call.id, ...data },
    update: data,
    select: { id: true },
  });
  return { detScore: ev.detScore, needsReview: ev.needsReview };
}

/** Catch-up: ended calls of the last `hours` with no evaluation row (or an
 *  older evaluator version), oldest first, capped. */
export async function evaluateMissingCalls(opts: { hours?: number; cap?: number; now?: Date } = {}): Promise<{ evaluated: number; ids: string[] }> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.hours ?? 48) * 3600_000);
  const rows = await prisma.voiceCall.findMany({
    where: { endedAt: { not: null, gte: since }, evaluation: null },
    select: { id: true },
    orderBy: { endedAt: "asc" },
    take: opts.cap ?? 20,
  });
  const ids: string[] = [];
  for (const r of rows) {
    try {
      const res = await evaluateStoredCall(r.id);
      if (res) ids.push(r.id);
    } catch (e) {
      console.error("[voice-eval] evaluation failed for", r.id, e);
    }
  }
  return { evaluated: ids.length, ids };
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { startCallRecording } from "@/lib/voice/twilio-recording";
import { generateCallIntelligence } from "@/lib/voice/call-intelligence";
import { evaluateStoredCall } from "@/lib/voice/eval/evaluate-call";
import { alertTotalsMismatch } from "@/lib/voice/totals-mismatch-alarm";
import { redactEventPayload } from "@/lib/voice/event-redaction";
import { parseStartBody, parseEndBody, parseEventsBody, parseMenuSnapshotBody, parseHandoffBody, type ParsedEvent } from "./validation";
import { phoneDigitsKey } from "@/lib/phone";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/call-log  (x-internal-key)
 *
 * The voice service calls this several times per call:
 *
 *  - event:"start" — at call setup. Upserts the minimal row with the REAL
 *    startedAt (the pre-2026-08-10 rows were created at hangup, so
 *    startedAt≈endedAt and duration analytics had to lean on durationSeconds).
 *    When the restaurant's VoiceAgentConfig.recordCalls is on, this is also
 *    what triggers the Twilio call recording (startCallRecording is no-throw;
 *    a recording failure never breaks the call).
 *
 *  - event:"events" — mid-call flushes of the EVENT LOG (directive §25–§26):
 *    `{ restaurantId, callSid, events: CallEvent[] }`. Each event is
 *    whitelisted + capped (validation.ts), REDACTED (event-redaction.ts) and
 *    written with createMany + skipDuplicates on (callId, seq), so a retried
 *    flush is a no-op. The VoiceCall stub is created if "start" hasn't landed
 *    yet (reordering). Responds `{ ok, id, inserted }`.
 *
 *  - event:"end" (default, so an un-upgraded voice service keeps working) —
 *    at hangup. Merges the whitelisted outcome fields (see validation.ts),
 *    the §27 `versions` block (agentVersion/promptVersion/toolsVersion +
 *    menuSnapshotHash → columns) and the TAIL of the event log (same path as
 *    "events"), and then, AFTER the response is sent, fires the AI
 *    intelligence pass (summary/sentiment/upsell revenue) — fire-and-forget
 *    via next/server `after`, error-logged, never blocking or throwing into
 *    the request path.
 *
 *  - event:"menu-snapshot" — `{ restaurantId, hash, payload }`: the exact menu
 *    payload a call ran against, upserted by content hash (VoiceMenuSnapshot)
 *    so a call can be replayed against what it actually saw. Not sent by the
 *    service yet; the branch is here so enabling it is a service-only change.
 *
 * Idempotent on the Twilio callSid (unique) so retries can't duplicate, and
 * start/events/end arriving out of order still converge on the same row.
 * PII: fromNumber + transcript are covered by PII_ERASURE_MAP (VoiceCall);
 * event payloads by PII_ERASURE_MAP (VoiceCallEvent, deleted with the call).
 */
export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const b = await req.json().catch(() => ({}));
  const event =
    b?.event === "start"
      ? "start"
      : b?.event === "events"
        ? "events"
        : b?.event === "menu-snapshot"
          ? "menu-snapshot"
          : b?.event === "handoff"
            ? "handoff"
            : "end";

  if (event === "handoff") {
    // A1 (2026-08-22): the service writes the hand-off reason BEFORE ending
    // the relay session, so after-stream/handoff find it on the row instead of
    // racing finalize(). Tiny, idempotent, never clobbers start/end fields.
    const parsed = parseHandoffBody(b);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
    }
    const { callSid, restaurantId, reason, transferredAt } = parsed.data;
    const row = await prisma.voiceCall.upsert({
      where: { callSid },
      create: { callSid, restaurantId, fromNumber: "", toNumber: "", transferReason: reason, transferredAt },
      update: { transferReason: reason, transferredAt },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: row.id });
  }

  if (event === "start") {
    const parsed = parseStartBody(b);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
    }
    const { callSid, restaurantId, fromNumber, toNumber, startedAt } = parsed.data;

    const row = await prisma.voiceCall.upsert({
      where: { callSid },
      // fromDigits is the ERASURE key — written here, at the only moment the
      // number is guaranteed present. Without it a "delete my data" request
      // cannot reach this row or the Twilio audio it points at.
      create: { callSid, restaurantId, fromNumber, toNumber, startedAt, fromDigits: phoneDigitsKey(fromNumber) },
      // If "end" somehow landed first (retry reordering), still stamp the real
      // startedAt; never clobber a known number with an empty retry payload.
      update: {
        startedAt,
        ...(fromNumber ? { fromNumber, fromDigits: phoneDigitsKey(fromNumber) } : {}),
        ...(toNumber ? { toNumber } : {}),
      },
      select: { id: true },
    });

    const cfg = await prisma.voiceAgentConfig.findUnique({
      where: { restaurantId },
      select: { recordCalls: true },
    });
    if (cfg?.recordCalls) {
      // No-throw by contract (logs its own failures) — the call must proceed
      // even when Twilio refuses to record.
      await startCallRecording(callSid, restaurantId);
    }

    return NextResponse.json({ ok: true, id: row.id });
  }

  if (event === "events") {
    const parsed = parseEventsBody(b);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
    }
    const { callSid, restaurantId, events } = parsed.data;
    // Stub the call row if the flush beat "start" (or start failed) — the
    // events must never be lost for want of a parent. fromNumber is unknown
    // here; "start"/"end" fill it in when they land (they merge, not clobber).
    const row = await prisma.voiceCall.upsert({
      where: { callSid },
      create: { callSid, restaurantId, fromNumber: "", toNumber: "" },
      update: {},
      select: { id: true },
    });
    const inserted = await persistEvents(row.id, events);
    return NextResponse.json({ ok: true, id: row.id, inserted });
  }

  if (event === "menu-snapshot") {
    const parsed = parseMenuSnapshotBody(b);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
    }
    const { restaurantId, hash, payload } = parsed.data;
    // Content-addressed: the same menu → the same hash → one row. A retry or
    // a second call on the same menu is a no-op update. No PII in a menu.
    await prisma.voiceMenuSnapshot.upsert({
      where: { hash },
      create: { hash, restaurantId, payload: payload as Prisma.InputJsonValue },
      update: {},
      select: { hash: true },
    });
    return NextResponse.json({ ok: true, hash });
  }

  const parsed = parseEndBody(b);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
  }
  const d = parsed.data;

  const data = {
    language: d.language,
    outcome: d.outcome,
    orderId: d.orderId,
    orderNumber: d.orderNumber,
    reservationId: d.reservationId,
    reservationCode: d.reservationCode,
    customerId: d.customerId,
    transferReason: d.transferReason,
    transferredAt: d.transferredAt,
    billableSeconds: d.billableSeconds,
    transcript: d.transcript,
    model: d.model,
    costCents: d.costCents,
    tokensIn: d.tokensIn,
    tokensOut: d.tokensOut,
    durationSeconds: d.durationSeconds,
    // The number read aloud vs the number charged. Recorded so a divergence is
    // VISIBLE: it has happened twice (2026-08-11, 2026-08-13), both times the
    // call logged as a clean success and both times it was found by hand, days
    // later, by reading a transcript.
    quotedTotal: d.quotedTotal,
    latency: d.latency ?? undefined,
    chargedTotal: d.chargedTotal,
    // §27 — what was live on this call. Only set when the service sent them
    // (undefined = leave the column alone on an un-upgraded service's retry).
    ...(d.versions?.agentVersion ? { agentVersion: d.versions.agentVersion } : {}),
    ...(d.versions?.promptVersion ? { promptVersion: d.versions.promptVersion } : {}),
    ...(d.versions?.toolsVersion ? { toolsVersion: d.versions.toolsVersion } : {}),
    ...(d.menuSnapshotHash ? { menuSnapshotHash: d.menuSnapshotHash } : {}),
    endedAt: new Date(),
  };

  const row = await prisma.voiceCall.upsert({
    where: { callSid: d.callSid },
    create: {
      restaurantId: d.restaurantId,
      callSid: d.callSid,
      fromNumber: d.fromNumber,
      fromDigits: phoneDigitsKey(d.fromNumber),
      toNumber: d.toNumber,
      ...data,
    },
    // fromNumber/toNumber belong to the start event — only merge them here
    // when present so an end retry can't blank what start already wrote.
    update: {
      ...data,
      ...(d.fromNumber ? { fromNumber: d.fromNumber, fromDigits: phoneDigitsKey(d.fromNumber) } : {}),
      ...(d.toNumber ? { toNumber: d.toNumber } : {}),
    },
    select: { id: true },
  });

  // The tail of the event log rides on the end event (whatever the last
  // mid-call flush didn't send, plus call_end). Same idempotent path.
  if (d.events.length) {
    await persistEvents(row.id, d.events);
  }

  // Phase B: provenance — everything that shaped this call, no PII, 1:1,
  // idempotent (an end retry rewrites the same row). Never blocks the end
  // record: a failure here is logged and the response still says ok.
  if (d.versions) {
    const v = d.versions;
    const prov = {
      restaurantId: d.restaurantId,
      channel: v.channel ?? req.headers.get("x-nabil-channel"),
      agentVersion: v.agentVersion ?? req.headers.get("x-nabil-agent"),
      gitSha: v.gitSha,
      coreVersion: v.coreVersion ?? req.headers.get("x-nabil-core"),
      coreContentHash: v.coreContentHash,
      promptVersion: v.promptVersion,
      systemStableHash: v.systemStableHash,
      toolsVersion: v.toolsVersion,
      cfgHash: v.cfgHash,
      menuSnapshotHash: d.menuSnapshotHash ?? v.menuSnapshotHash,
      model: v.model,
      modelConfig: (v.modelConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      audioProfile: { pipeline: v.sttModel ? "mediastreams" : "conversationrelay", sttModel: v.sttModel, ttsVoice: v.ttsVoice } as Prisma.InputJsonValue,
      flyMachineId: v.flyMachineId,
      flyRegion: v.flyRegion,
      appVersion: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || null,
    };
    try {
      await prisma.voiceCallProvenance.upsert({
        where: { callId: row.id },
        create: { callId: row.id, ...prov },
        update: prov,
        select: { id: true },
      });
    } catch (err) {
      console.error("[call-log] provenance write failed for", row.id, err);
    }
  }

  // Fire-and-forget AFTER the response is sent (Vercel keeps the function
  // alive for `after` callbacks). generateCallIntelligence never throws, but
  // belt-and-suspenders: a rejection here must never surface anywhere.
  after(() => {
    void generateCallIntelligence(row.id).catch((err) => {
      console.error("[call-log] intelligence pass failed for", row.id, err);
    });
    // Phase D: the deterministic evaluator scores EVERY call from its event
    // log (model-free; the judge is a separate, later pass).
    void evaluateStoredCall(row.id).catch((err) => {
      console.error("[call-log] evaluation failed for", row.id, err);
    });
    // 🚨 quoted ≠ charged on a PLACED order → one ops alarm per call, ever
    // (the helper skips refusals that stored both totals but billed nobody,
    // and claims the alert with a conditional update so an end retry can't
    // alert twice). See src/lib/voice/totals-mismatch-alarm.ts.
    void alertTotalsMismatch({
      callId: row.id,
      restaurantId: d.restaurantId,
      callSid: d.callSid,
      orderNumber: d.orderNumber ?? null,
      outcome: d.outcome ?? null,
      quoted: d.quotedTotal ?? null,
      charged: d.chargedTotal ?? null,
      endedAt: data.endedAt,
    }).catch((err) => {
      console.error("[call-log] totals-mismatch alarm failed for", row.id, err);
    });
  });

  return NextResponse.json({ ok: true, id: row.id });
}

/**
 * Redact + insert a batch of events for one call, idempotently: the
 * (callId, seq) unique + skipDuplicates means a retried flush inserts nothing
 * and eventCount only grows by what actually landed. Returns the number of
 * rows inserted.
 */
async function persistEvents(callId: string, events: ParsedEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const rows = events.map((e) => ({
    callId,
    seq: e.seq,
    ts: e.ts,
    turn: e.turn,
    type: e.type,
    // THE redaction chokepoint — nothing reaches VoiceCallEvent.payload
    // without passing through here (event-redaction.ts).
    payload: redactEventPayload(e.payload) as Prisma.InputJsonValue,
    latencyMs: e.latencyMs,
    cartHash: e.cartHash,
  }));
  const { count } = await prisma.voiceCallEvent.createMany({ data: rows, skipDuplicates: true });
  if (count > 0) {
    // COALESCE, not Prisma `increment`: the column is nullable (null on every
    // pre-event-log row) and `NULL + n` is NULL, so an increment would leave
    // the counter empty forever. Atomic, so two flushes can't lose an add.
    await prisma.$executeRaw`UPDATE "VoiceCall" SET "eventCount" = COALESCE("eventCount", 0) + ${count} WHERE "id" = ${callId}`;
  }
  return count;
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { startCallRecording } from "@/lib/voice/twilio-recording";
import { generateCallIntelligence } from "@/lib/voice/call-intelligence";
import { parseStartBody, parseEndBody } from "./validation";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/call-log  (x-internal-key)
 *
 * The voice service calls this twice per call:
 *
 *  - event:"start" — at call setup. Upserts the minimal row with the REAL
 *    startedAt (the pre-2026-08-10 rows were created at hangup, so
 *    startedAt≈endedAt and duration analytics had to lean on durationSeconds).
 *    When the restaurant's VoiceAgentConfig.recordCalls is on, this is also
 *    what triggers the Twilio call recording (startCallRecording is no-throw;
 *    a recording failure never breaks the call).
 *
 *  - event:"end" (default, so an un-upgraded voice service keeps working) —
 *    at hangup. Merges the whitelisted outcome fields (see validation.ts) and
 *    then, AFTER the response is sent, fires the AI intelligence pass
 *    (summary/sentiment/upsell revenue) — fire-and-forget via next/server
 *    `after`, error-logged, never blocking or throwing into the request path.
 *
 * Idempotent on the Twilio callSid (unique) so retries can't duplicate, and
 * start/end arriving out of order still converge on the same row.
 * PII: fromNumber + transcript are covered by PII_ERASURE_MAP (VoiceCall).
 */
export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const b = await req.json().catch(() => ({}));
  const event = b?.event === "start" ? "start" : "end";

  if (event === "start") {
    const parsed = parseStartBody(b);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
    }
    const { callSid, restaurantId, fromNumber, toNumber, startedAt } = parsed.data;

    const row = await prisma.voiceCall.upsert({
      where: { callSid },
      create: { callSid, restaurantId, fromNumber, toNumber, startedAt },
      // If "end" somehow landed first (retry reordering), still stamp the real
      // startedAt; never clobber a known number with an empty retry payload.
      update: {
        startedAt,
        ...(fromNumber ? { fromNumber } : {}),
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
    transcript: d.transcript,
    model: d.model,
    tokensIn: d.tokensIn,
    tokensOut: d.tokensOut,
    durationSeconds: d.durationSeconds,
    endedAt: new Date(),
  };

  const row = await prisma.voiceCall.upsert({
    where: { callSid: d.callSid },
    create: {
      restaurantId: d.restaurantId,
      callSid: d.callSid,
      fromNumber: d.fromNumber,
      toNumber: d.toNumber,
      ...data,
    },
    // fromNumber/toNumber belong to the start event — only merge them here
    // when present so an end retry can't blank what start already wrote.
    update: {
      ...data,
      ...(d.fromNumber ? { fromNumber: d.fromNumber } : {}),
      ...(d.toNumber ? { toNumber: d.toNumber } : {}),
    },
    select: { id: true },
  });

  // Fire-and-forget AFTER the response is sent (Vercel keeps the function
  // alive for `after` callbacks). generateCallIntelligence never throws, but
  // belt-and-suspenders: a rejection here must never surface anywhere.
  after(() => {
    void generateCallIntelligence(row.id).catch((err) => {
      console.error("[call-log] intelligence pass failed for", row.id, err);
    });
  });

  return NextResponse.json({ ok: true, id: row.id });
}

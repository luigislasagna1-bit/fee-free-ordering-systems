import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/call-log  (x-internal-key)
 * The voice service calls this once per call (on hangup) to persist the
 * VoiceCall row that powers the Calls & Reports dashboard. Idempotent on the
 * Twilio callSid (unique) so a retry can't duplicate.
 *
 * NOTE (follow-up): AI end-of-call summary + sentiment generation is deferred —
 * the transcript + outcome + usage are stored now; a background pass will fill
 * `summary`/`sentiment`. PII: fromNumber + transcript are covered by
 * PII_ERASURE_MAP (VoiceCall).
 */
export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const b = await req.json().catch(() => ({}));
  const callSid = String(b.callSid || "").trim();
  const restaurantId = String(b.restaurantId || "").trim();
  if (!callSid || !restaurantId) {
    return NextResponse.json({ error: "Missing callSid/restaurantId", code: "bad_request" }, { status: 400 });
  }

  const data = {
    fromNumber: String(b.fromNumber || ""),
    toNumber: String(b.toNumber || ""),
    language: b.language ?? null,
    outcome: b.outcome ?? "abandoned",
    orderId: b.orderId ?? null,
    reservationId: b.reservationId ?? null,
    customerId: b.customerId ?? null,
    transcript: b.transcript ?? undefined,
    model: b.model ?? null,
    tokensIn: typeof b.tokensIn === "number" ? b.tokensIn : null,
    tokensOut: typeof b.tokensOut === "number" ? b.tokensOut : null,
    durationSeconds: typeof b.durationSeconds === "number" ? b.durationSeconds : null,
    endedAt: new Date(),
  };

  const row = await prisma.voiceCall.upsert({
    where: { callSid },
    create: { restaurantId, callSid, ...data },
    update: data,
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: row.id });
}

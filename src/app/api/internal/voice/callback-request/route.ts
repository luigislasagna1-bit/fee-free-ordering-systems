import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { phoneDigitsKey } from "@/lib/phone";
import { sendSms } from "@/lib/sms";

/**
 * A1b (2026-08-22) — a message the caller left for the store because Nabil
 * could not, or by the store's transfer policy would not, hand them to a
 * person. Stored as VoiceCallbackRequest (side table; PII registered in
 * PII_ERASURE_MAP) and texted, best-effort, to the store's human line —
 * transfer number → alert phone → main phone, the same precedence the
 * hand-off routes dial.
 *
 * Internal-key gated (Fly → Vercel). Tenant check: when the call row already
 * exists it must belong to the restaurantId in the body.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 500;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const restaurantId = str(b.restaurantId);
  const callSid = str(b.callSid);
  const message = str(b.message).slice(0, MAX_MESSAGE);
  const phone = str(b.phone);
  const name = str(b.name).slice(0, 80) || null;
  if (!restaurantId || !callSid || !message) {
    return NextResponse.json({ error: "restaurantId, callSid and message are required", code: "bad_request" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, phone: true, alertPhone: true, voiceAgentConfig: { select: { transferToNumber: true } } },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  const call = await prisma.voiceCall.findUnique({ where: { callSid }, select: { id: true, restaurantId: true } });
  if (call && call.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Call belongs to another restaurant", code: "tenant_mismatch" }, { status: 403 });
  }

  const row = await prisma.voiceCallbackRequest.create({
    data: {
      restaurantId,
      callId: call?.id ?? null,
      callSid,
      phoneDigits: phone ? phoneDigitsKey(phone) || null : null,
      callerName: name,
      message,
    },
    select: { id: true },
  });

  // Best-effort alert to the store's human line. sendSms never throws.
  const to = (restaurant.voiceAgentConfig?.transferToNumber || restaurant.alertPhone || restaurant.phone || "").trim();
  let alerted = false;
  if (to) {
    const body =
      `Nabil AI — message for ${restaurant.name}: ` +
      (name ? `${name} — ` : "") +
      message +
      (phone ? ` — call back ${phone}` : "");
    const r = await sendSms({ to, body }).catch(() => ({ sent: false as const }));
    alerted = !!r.sent;
    if (!r.sent) console.warn("[callback-request] alert SMS not sent", { restaurantId, id: row.id, reason: (r as { reason?: string }).reason ?? "unknown" });
  }

  return NextResponse.json({ ok: true, id: row.id, alerted });
}

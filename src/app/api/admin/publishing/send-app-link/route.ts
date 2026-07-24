import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { sendKitchenAppLinkEmail } from "@/lib/email";
import { APP_LINKS } from "@/lib/app-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/publishing/send-app-link  { channel: "email" | "sms", to: string }
 *
 * The restaurant owner sends THEMSELVES the Kitchen Order App download link on
 * the device they'll use in the kitchen (from /admin/publishing). Session-gated
 * to the owner; the destination is their own email/phone. Rate-limited per
 * restaurant so it can't be turned into a spammer, and it only ever sends the
 * fixed app-download message — never arbitrary content.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 6 sends per restaurant per hour — plenty for "email me + text me", far below abuse.
  if (!rateLimit(`send-app-link:${user.restaurantId}`, 6, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited", code: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const channel = body?.channel;
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (channel !== "email" && channel !== "sms") {
    return NextResponse.json({ error: "bad_channel" }, { status: 400 });
  }
  if (!to) return NextResponse.json({ error: "missing_to" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { name: true },
  });
  const restaurantName = restaurant?.name || "your restaurant";

  if (channel === "email") {
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "invalid_email", code: "invalid_contact" }, { status: 400 });
    }
    const res = await sendKitchenAppLinkEmail({ to, restaurantName });
    if (!res.success) {
      return NextResponse.json({ error: res.error || "send_failed", code: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  // SMS
  const phone = sanitizePhone(to);
  if (!phone) {
    return NextResponse.json({ error: "invalid_phone", code: "invalid_contact" }, { status: 400 });
  }
  // Fixed, link-only body (kept well under the 2-segment cap). Availability-driven.
  const parts = [`${restaurantName} Kitchen Order App —`];
  if (APP_LINKS.kitchen.play) parts.push(`Android: ${APP_LINKS.kitchen.play}`);
  if (APP_LINKS.kitchen.ios) parts.push(`iPhone/iPad: ${APP_LINKS.kitchen.ios}`);
  const smsBody = parts.join(" ");
  const res = await sendSms({ to: phone, body: smsBody });
  if (!res.sent) {
    return NextResponse.json({ error: res.reason || "send_failed", code: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

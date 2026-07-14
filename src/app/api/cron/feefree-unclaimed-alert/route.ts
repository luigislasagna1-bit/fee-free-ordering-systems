import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import prisma from "@/lib/db";
import { sendSms } from "@/lib/sms";

/**
 * GET/POST /api/cron/feefree-unclaimed-alert  (Vercel cron, every minute)
 *
 * Fee Free Delivery safety net (Luigi 2026-07-14): a delivery must never sit in
 * the driver pool unnoticed. If an order was sent to Fee Free drivers and NO
 * driver has accepted it within UNCLAIMED_MINUTES (whether because no driver is
 * online or they all ignored it), the Fee Free platform owner gets an SMS so
 * they can dispatch it manually or call a driver.
 *
 * "Unclaimed" = a DeliveryAssignment still awaiting a driver (acceptedAt null,
 * status queued/assigned/offered) whose createdAt is older than the threshold.
 * `unclaimedAlertedAt` makes it fire EXACTLY ONCE per stuck order (the cron runs
 * every minute). Send target is the platform-owner phone in
 * FEEFREE_DISPATCH_ALERT_PHONE (E.164 or plain digits) — no-op if unset (or if
 * Twilio isn't configured), same graceful-degrade as every other SMS path.
 */
export const maxDuration = 30;

const UNCLAIMED_MINUTES = 3;
const MAX_ROWS = 25;
const AWAITING = ["queued", "assigned", "offered"];

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const phone = process.env.FEEFREE_DISPATCH_ALERT_PHONE?.trim();
  const cutoff = new Date(Date.now() - UNCLAIMED_MINUTES * 60_000);

  const stuck = await prisma.deliveryAssignment.findMany({
    where: {
      acceptedAt: null,
      status: { in: AWAITING },
      unclaimedAlertedAt: null,
      createdAt: { lte: cutoff },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
    select: {
      id: true, createdAt: true,
      order: { select: { orderNumber: true, customerName: true } },
      restaurant: { select: { name: true } },
    },
  });

  if (stuck.length === 0) return NextResponse.json({ ok: true, alerted: 0 });

  // No target / Twilio off → still STAMP so we don't recount them every run, but
  // record that we couldn't notify (visible in logs). We only stamp on a real
  // send OR when there's simply no phone configured (nothing we can do).
  let alerted = 0;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com").replace(/\/$/, "");
  for (const a of stuck) {
    const waited = Math.round((Date.now() - a.createdAt.getTime()) / 60_000);
    const ord = a.order ? `#${a.order.orderNumber}${a.order.customerName ? ` · ${a.order.customerName}` : ""}` : "an order";
    if (phone) {
      const res = await sendSms({
        to: phone,
        body: `Fee Free Delivery: ${ord} at ${a.restaurant?.name ?? "a restaurant"} has waited ${waited} min with NO driver accepting. Assign it manually: ${appUrl}/superadmin/drivers`,
      });
      if (!res.sent) console.warn(`[feefree-unclaimed-alert] SMS not sent for ${a.id}: ${res.reason}`);
    } else {
      console.warn(`[feefree-unclaimed-alert] no FEEFREE_DISPATCH_ALERT_PHONE set — ${ord} unclaimed ${waited}m`);
    }
    // Stamp regardless so the alert fires once (a missing phone/Twilio is an ops
    // config gap, not a reason to re-alert every minute forever).
    await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { unclaimedAlertedAt: new Date() } }).catch(() => {});
    alerted++;
  }

  console.log(`[feefree-unclaimed-alert] ${alerted} unclaimed order(s) escalated${phone ? "" : " (no alert phone configured)"}`);
  return NextResponse.json({ ok: true, alerted });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

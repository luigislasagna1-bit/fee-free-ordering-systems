import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { sendKitchenPush } from "@/lib/push";

/**
 * Self-diagnosing push test — same playbook as the Twilio test-call button.
 *
 * Sends a real push through the EXACT production path (sendKitchenPush →
 * FCM → APNs/Android) to the restaurant's active kitchen device and returns
 * FCM's per-device response verbatim, so a failing send shows its actual
 * error text in the browser instead of hiding in server logs.
 * Built 2026-07-05 while chasing the iOS "no ring when closed/locked" bug.
 *
 * GET on purpose: it must be triggerable from a plain browser tab by the
 * owner (open URL → read JSON → hear phone ring). The only side effect is
 * one test notification to the owner's own device; auth is the same strict
 * session check as the kitchen test-order button. Superadmins may pass
 * ?slug=<restaurant> to test any store; everyone else is locked to their
 * own restaurant.
 *
 * data.type is "test_push" (NOT "new_order") so the Android native alarm
 * service ignores it — Android delivery still shows in the results, but no
 * phantom full-length alarm with no order behind it. On iOS it's an alert
 * push with the real alarm sound, which is exactly what we're testing.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser({ preferKitchen: true });
  if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let restaurantId = user.restaurantId ?? null;
  const slug = req.nextUrl.searchParams.get("slug");
  if (slug && user.role === "superadmin") {
    const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!r) return NextResponse.json({ error: "Unknown restaurant slug" }, { status: 404 });
    restaurantId = r.id;
  }
  if (!restaurantId) return NextResponse.json({ error: "No restaurant" }, { status: 400 });

  const devices = await prisma.kitchenPushToken.findMany({
    where: { restaurantId },
    orderBy: { lastSeenAt: "desc" },
    select: { platform: true, lastSeenAt: true },
  });

  const result = await sendKitchenPush(restaurantId, {
    title: "Push test",
    body: `Test push sent ${new Date().toISOString()}`,
    data: { type: "test_push", autoAccept: "false" },
  });

  return NextResponse.json({
    registeredDevices: devices.map((d) => ({ platform: d.platform, lastSeenAt: d.lastSeenAt })),
    targeted: "most recent device only (single-active-device rule)",
    ...result,
  });
}

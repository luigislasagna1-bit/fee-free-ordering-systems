import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { sendKitchenPush } from "@/lib/push";

// The POST flow sleeps up to 15s server-side before sending (see below), so
// pin the function duration well past it instead of trusting the dashboard
// default. Precedent: cron/ios-ring-pending sleeps ~29s under maxDuration 55.
export const maxDuration = 30;

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

// The kitchen 3-dot menu's push-health "Test ring" button (iOS shell, Fabrizio
// cmrkvs5r) POSTs — a button that SENDS a push is an action, not a read. GET
// stays for the open-URL-in-a-browser-tab diagnosis flow above.
//
// ROUND 2 (cmrkvs5r): a real handler, no longer a GET alias. Pressed with the
// app FOREGROUND, the immediate send was invisible+silent BY DESIGN
// (presentationOptions: [] — the web engine owns foreground sound, and a
// test_push creates no order for it to ring about), so the button read as
// broken. Now the client asks for a DELAYED send: we resolve the target
// device first, sleep server-side (the phone's WebView being frozen after
// lock is irrelevant here), then send — the push lands on the now-LOCKED
// phone as a full banner + alarm .caf, which is the exact path the button
// exists to prove. The response carries a true `state` verdict, including
// "your device isn't the ring owner" (single-active-device rule) computed by
// comparing the presser's own token against the freshest registration. The
// 8-15s await lives in a user-initiated diagnostic route, not a hot path.
export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => null)) as
    | { delaySeconds?: unknown; deviceToken?: unknown }
    | null;
  const delayRaw =
    typeof body?.delaySeconds === "number" && Number.isFinite(body.delaySeconds) ? body.delaySeconds : 0;
  const delaySeconds = Math.min(15, Math.max(0, Math.floor(delayRaw))); // clamp: never past maxDuration
  const deviceToken = typeof body?.deviceToken === "string" && body.deviceToken ? body.deviceToken : null;

  // Resolve the ACTIVE device BEFORE sleeping (same single-active-device query
  // shape sendKitchenPush uses): no device → answer immediately, don't sleep
  // for nothing; a device that isn't the presser's → still send (the ring
  // should be proven on whichever device OWNS it) but tell the presser theirs
  // won't ring.
  const active = await prisma.kitchenPushToken.findMany({
    where: { restaurantId },
    orderBy: { lastSeenAt: "desc" },
    select: { token: true, platform: true, lastSeenAt: true },
    take: 1,
  });
  if (active.length === 0) {
    return NextResponse.json({ state: "no_device", sent: 0, pruned: 0, registeredDevices: [] });
  }
  const otherDeviceOwnsRing = !!deviceToken && deviceToken !== active[0].token;

  if (delaySeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }

  const result = await sendKitchenPush(restaurantId, {
    title: "Push test",
    body: `Test push sent ${new Date().toISOString()}`,
    data: { type: "test_push", autoAccept: "false" },
  });

  const firstError = result.results?.find((r) => !r.ok)?.error ?? null;
  const state =
    result.sent > 0
      ? otherDeviceOwnsRing
        ? "sent_other_device"
        : "sent"
      : firstError === "no registered devices" // race: the token vanished during the sleep
      ? "no_device"
      : "error";

  return NextResponse.json({
    state,
    ...(state === "error" && firstError ? { error: firstError } : {}),
    registeredDevices: active.map((d) => ({ platform: d.platform, lastSeenAt: d.lastSeenAt })),
    targeted: "most recent device only (single-active-device rule)",
    ...result,
  });
}

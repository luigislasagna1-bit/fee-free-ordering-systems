/**
 * POST   /api/kitchen/register-device — the native Kitchen Order App calls this
 *   on launch (and whenever FCM rotates the token) with its push token, so the
 *   server can ring THIS device when a new order arrives. Kitchen-authed; the
 *   token is bound to the session's restaurant. Idempotent upsert on the unique
 *   token — a re-launch refreshes lastSeenAt and re-points the token if the
 *   device switched restaurants (shared tablet).
 *
 * DELETE /api/kitchen/register-device — unregister on logout so a shared device
 *   stops receiving another restaurant's orders.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import { checkKitchenSessionFresh } from "@/lib/session";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A SUPERSEDED device (another device has since claimed the active kitchen
  // session) must NOT be able to (re)register its push token — otherwise a
  // stale phone that briefly wakes could reclaim sole ring ownership and bump
  // the genuinely-active device off the push list. Only the fresh/active
  // session may own the ring. Luigi 2026-06-26.
  if ((await checkKitchenSessionFresh()) === "stale") {
    return NextResponse.json(
      { error: "session_superseded", code: "session_superseded" },
      { status: 401 },
    );
  }

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  // FCM/APNs tokens are well under 4 KB; cap to reject junk without truncating real ones.
  if (!token || token.length > 4096) {
    return NextResponse.json({ error: "Missing or invalid token" }, { status: 400 });
  }
  const platform = ["android", "ios", "web"].includes(body.platform ?? "")
    ? (body.platform as string)
    : "android";

  await prisma.kitchenPushToken.upsert({
    where: { token },
    update: { restaurantId, platform, lastSeenAt: new Date() },
    create: { restaurantId, token, platform },
  });

  // Single ACTIVE device per kitchen — mirror the single-session login rule.
  // The kitchen logs in on one device at a time (a new login logs the others
  // out), so only ONE device should ring/buzz. This device just (re)registered
  // as the active one, so retire every OTHER push token for the restaurant.
  // Without this, a phone that was logged in earlier keeps its token and still
  // VIBRATES on every new order even after it's been logged out — the active
  // device gets the ring, the stale ones get a silent buzz. Fixes the Fabrizio
  // multi-device report (Luigi 2026-06-16). The native app POSTs here on launch
  // and on FCM token refresh, so the live device reclaims sole ownership; a
  // superseded device sends no orders and is simply dropped from the push list.
  await prisma.kitchenPushToken.deleteMany({
    where: { restaurantId, token: { not: token } },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  // Scope the delete to THIS restaurant so one tenant can't unregister another's
  // device by guessing a token.
  if (token) {
    await prisma.kitchenPushToken.deleteMany({ where: { token, restaurantId } });
  }
  return NextResponse.json({ ok: true });
}

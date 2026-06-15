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
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

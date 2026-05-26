import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/track/event
 *
 * Fires a single WebsiteFunnelEvent row for funnel-step transitions
 * AFTER the initial visit. Called from the customer order page on:
 *
 *   "menu_browsed"   — scrolled past the menu fold OR opened any item
 *   "item_added"     — first cart add
 *   "checkout_open"  — opened the checkout drawer
 *   "checkout_info"  — filled customer details
 *   "payment_open"   — reached payment step
 *   "order_placed"   — successful POST /api/orders (terminal)
 *
 * Body: { restaurantId, sessionHash, step, targetId? }
 *
 * The "visit" step itself is written by /api/track/visit at the same
 * time as the WebsiteVisit row — DO NOT also POST "visit" here, or
 * the funnel will double-count entries.
 *
 * Privacy + idempotency identical to /api/track/visit (read header
 * comment there).
 */
const VALID_STEPS = new Set([
  "menu_browsed",
  "item_added",
  "checkout_open",
  "checkout_info",
  "payment_open",
  "order_placed",
]);

export async function POST(req: NextRequest) {
  // Rate limit per IP — a real customer fires at most 6 funnel events
  // (menu_browsed / item_added / checkout_open / checkout_info /
  // payment_open / order_placed) per session. 120/min is the soft cap
  // — enough for legitimate "user reopens cart 20× in a session" but
  // far below what a spammer needs to skew the funnel meaningfully.
  const ip = getClientIp(req);
  if (!rateLimit(`event:${ip}`, 120, 60_000)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: { restaurantId?: string; sessionHash?: string; step?: string; targetId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, sessionHash, step, targetId } = body;
  if (typeof restaurantId !== "string" || restaurantId.length < 1 || restaurantId.length > 50) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }
  if (typeof sessionHash !== "string" || !/^[a-f0-9]{16,64}$/i.test(sessionHash)) {
    return NextResponse.json({ error: "Invalid sessionHash" }, { status: 400 });
  }
  if (typeof step !== "string" || !VALID_STEPS.has(step)) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  try {
    await prisma.websiteFunnelEvent.create({
      data: {
        restaurantId,
        sessionHash,
        step,
        targetId: typeof targetId === "string" ? targetId.slice(0, 50) : null,
      },
    });
  } catch (err) {
    // Same swallow-and-204 policy as the visit beacon — analytics
    // failures never block the customer order flow.
    console.error("[track/event] failed", { restaurantId, step, err: err instanceof Error ? err.message : String(err) });
  }

  return new NextResponse(null, { status: 204 });
}

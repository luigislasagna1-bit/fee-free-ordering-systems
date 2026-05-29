/**
 * POST /api/public/cart-session
 *
 * Public heartbeat endpoint — called by /order/[slug] every time the
 * customer's cart changes (debounced 3s on the client). Powers the
 * cart-abandonment Autopilot campaign by persisting an ephemeral
 * CartSession row keyed on a per-browser sessionToken.
 *
 * No auth required — anonymous browsers must be able to call this.
 * The sessionToken in the request body is the only identity we trust;
 * customerEmail / customerPhone arrive once the checkout form is filled
 * in. We always upsert by sessionToken so multiple pings consolidate
 * into one row.
 *
 * Suppression: if any Order from this customerEmail has landed at this
 * restaurant in the last 4 hours, we mark `recoveredAt = now` so the
 * sweep skips this row even if it sits long enough to look abandoned.
 * (Luigi-confirmed window — broad enough to catch the "completed order
 * but the cart-session ping arrived in flight" race.)
 *
 * Scale notes:
 *   - sessionToken is @unique on CartSession, so upsert is a single
 *     statement.
 *   - We don't index Order.customerEmail platform-wide; the suppression
 *     lookup uses restaurantId + email which IS indexed. Per AGENTS.md
 *     scale rules: bounded query, restaurant-scoped, includes a time
 *     window.
 *   - This endpoint MUST stay fast. No outbound HTTP, no emails — just
 *     the upsert + a small suppression check.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPRESSION_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function POST(req: NextRequest) {
  let body: {
    restaurantSlug?: string;
    sessionToken?: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    itemCount?: number;
    cartTotal?: number;
    cartJson?: unknown;
    reachedCheckout?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionToken = (body.sessionToken ?? "").trim();
  const restaurantSlug = (body.restaurantSlug ?? "").trim();
  if (!sessionToken || !restaurantSlug) {
    return NextResponse.json({ error: "sessionToken and restaurantSlug required" }, { status: 400 });
  }

  // Resolve restaurantId from slug. We deliberately don't accept a raw
  // restaurantId from the client per AGENTS.md.
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  // Normalize the cart-state fields.
  const itemCount = Number.isFinite(body.itemCount) ? Math.max(0, Math.floor(body.itemCount as number)) : 0;
  const cartTotal = Number.isFinite(body.cartTotal) ? Math.max(0, body.cartTotal as number) : 0;
  // cartJson must be JSON-serialisable; cap by re-stringify size to avoid
  // pathological payloads.
  let cartJson: unknown = [];
  try {
    const stringified = JSON.stringify(body.cartJson ?? []);
    if (stringified.length < 16_000) {
      cartJson = JSON.parse(stringified);
    }
  } catch {
    cartJson = [];
  }
  const customerEmail = typeof body.customerEmail === "string" && body.customerEmail.includes("@")
    ? body.customerEmail.trim().toLowerCase()
    : null;
  const customerPhone = typeof body.customerPhone === "string" && body.customerPhone.trim().length > 0
    ? body.customerPhone.trim()
    : null;
  const reachedCheckout = body.reachedCheckout === true;

  // Try to associate with an existing Customer row at this restaurant.
  // Email is the canonical match key (phones aren't unique on Customer).
  let customerId: string | null = null;
  if (customerEmail) {
    const customer = await prisma.customer.findFirst({
      where: { restaurantId: restaurant.id, email: customerEmail },
      select: { id: true },
    });
    customerId = customer?.id ?? null;
  }

  // Suppression check: any order from this email at this restaurant
  // within the last 4 hours? If yes, treat as recovered.
  let recoveredAt: Date | null = null;
  if (customerEmail) {
    const cutoff = new Date(Date.now() - SUPPRESSION_WINDOW_MS);
    const recent = await prisma.order.findFirst({
      where: {
        restaurantId: restaurant.id,
        customerEmail,
        createdAt: { gte: cutoff },
      },
      select: { id: true },
    });
    if (recent) recoveredAt = new Date();
  }

  await prisma.cartSession.upsert({
    where: { sessionToken },
    create: {
      restaurantId: restaurant.id,
      sessionToken,
      customerEmail,
      customerPhone,
      customerId,
      itemCount,
      cartTotal,
      cartJson: cartJson as object,
      reachedCheckout,
      recoveredAt,
    },
    update: {
      restaurantId: restaurant.id,
      // Only OVERWRITE identity fields if the new ping supplies them — a
      // later ping with empty email shouldn't blank out an earlier capture.
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerPhone ? { customerPhone } : {}),
      ...(customerId ? { customerId } : {}),
      itemCount,
      cartTotal,
      cartJson: cartJson as object,
      // reachedCheckout is sticky-true — once set, stays set.
      ...(reachedCheckout ? { reachedCheckout: true } : {}),
      // Same for recoveredAt — never blank out.
      ...(recoveredAt ? { recoveredAt } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

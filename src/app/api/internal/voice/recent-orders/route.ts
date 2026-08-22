import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { phoneDigitsKey } from "@/lib/phone";

/**
 * GET /api/internal/voice/recent-orders?slug=&phone=&orderNumber=  (x-internal-key)
 *
 * A5 (Luigi 2026-08-22): phone callers mostly chase an order they placed
 * ONLINE (website / branded app) or a delivery in transit — not a phone
 * order. This is the ONE source the voice agent may state an order's status
 * from: it searches every channel of THIS restaurant's orders in the last
 * 48 h, and the agent is told to never guess (call cmt… "on its way, any
 * minute now" with no order at all).
 *
 * Identity tiers (privacy by construction):
 *   1. phone match — caller ID digits against Customer.phoneDigits (every row
 *      behind the number; same line = same household) and against the
 *      order's own customerPhone → status, stage, ETA, item count, type.
 *      NO address, NO total.
 *   2. order number (full, or its last 4+ digits) — returned with full
 *      details (total, items) only when the phone ALSO matches; otherwise the
 *      same limited view as tier 1 (the number alone is on a receipt anyone
 *      can read).
 *   3. nothing → found: 0; the agent asks for the order number once, then
 *      offers a person.
 *
 * Cost: one (restaurantId, createdAt)-indexed scan over ≤48 h of orders plus
 * one indexed Customer lookup. Read-only; nothing is stored.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 48 * 60 * 60_000;
const MAX_SCAN = 400;
const MAX_RESULTS = 5;

/** Third-party delivery apps the store can't see into — the agent deflects. */
const THIRD_PARTY = /doordash|uber|skip|fantuan|grubhub|instacart|ritual/i;

type Stage = "received" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled" | "scheduled";

function stageOf(o: { status: string; type: string; shipdayStatus: string | null; dispatchedAt: Date | null; scheduledFor: Date | null }, now: Date): Stage {
  const st = (o.status || "").toLowerCase();
  if (st === "cancelled" || st === "rejected") return "cancelled";
  if (st === "completed") return "completed";
  if (o.type === "delivery" && (o.shipdayStatus === "picked_up" || (o.dispatchedAt && o.shipdayStatus !== "failed" && o.shipdayStatus !== "cancelled" && st === "ready"))) return "out_for_delivery";
  if (st === "ready") return "ready";
  if (st === "preparing") return "preparing";
  if (o.scheduledFor && o.scheduledFor.getTime() > now.getTime() + 30 * 60_000 && (st === "pending" || st === "accepted")) return "scheduled";
  if (st === "accepted") return "accepted";
  return "received";
}

export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("slug") || "").toLowerCase().trim();
  const phone = (sp.get("phone") || "").trim();
  const orderNumberRaw = (sp.get("orderNumber") || "").replace(/\D/g, "");
  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!phone && !orderNumberRaw) return NextResponse.json({ error: "Missing phone or orderNumber", code: "missing_lookup_key" }, { status: 400 });

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true, timezone: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  const digits = phone ? phoneDigitsKey(phone) : null;

  const [customers, orders] = await Promise.all([
    digits
      ? prisma.customer.findMany({ where: { restaurantId: restaurant.id, phoneDigits: digits }, select: { id: true }, take: 10 })
      : Promise.resolve([] as Array<{ id: string }>),
    prisma.order.findMany({
      where: { restaurantId: restaurant.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_SCAN,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        channel: true,
        customerId: true,
        customerPhone: true,
        customerName: true,
        total: true,
        createdAt: true,
        acceptedAt: true,
        completedAt: true,
        estimatedReady: true,
        scheduledFor: true,
        scheduledSlotMinutes: true,
        shipdayStatus: true,
        dispatchedAt: true,
        items: { select: { quantity: true, name: true, variantName: true }, take: 12 },
      },
    }),
  ]);
  const customerIds = new Set(customers.map((c) => c.id));

  const phoneMatches = (o: (typeof orders)[number]) =>
    !!digits && ((!!o.customerId && customerIds.has(o.customerId)) || (!!o.customerPhone && phoneDigitsKey(o.customerPhone) === digits));
  const numberMatches = (o: (typeof orders)[number]) => {
    if (!orderNumberRaw) return false;
    const n = (o.orderNumber || "").replace(/\D/g, "");
    if (!n) return false;
    if (orderNumberRaw.length >= 6) return n === orderNumberRaw || n.endsWith(orderNumberRaw);
    return orderNumberRaw.length >= 4 && n.endsWith(orderNumberRaw);
  };

  const hits = orders
    .map((o) => ({ o, byPhone: phoneMatches(o), byNumber: numberMatches(o) }))
    .filter((h) => (orderNumberRaw ? h.byNumber : h.byPhone))
    .slice(0, MAX_RESULTS);

  const result = hits.map(({ o, byPhone, byNumber }) => {
    const stage = stageOf(o, now);
    const full = byNumber && byPhone; // tier 2 with a cross-check
    const source = (o.channel || "web").toLowerCase();
    return {
      id: o.id,
      orderRef: (o.orderNumber || "").replace(/\D/g, "").slice(-4) || null,
      placedAtIso: o.createdAt.toISOString(),
      minutesAgo: Math.max(0, Math.round((now.getTime() - o.createdAt.getTime()) / 60_000)),
      source,
      thirdParty: THIRD_PARTY.test(source),
      type: o.type,
      status: o.status,
      stage,
      itemCount: o.items.reduce((n, it) => n + (it.quantity || 0), 0),
      items: o.items.slice(0, 6).map((it) => `${it.quantity}× ${it.name}${it.variantName ? ` (${it.variantName})` : ""}`),
      readyEstimateIso: o.estimatedReady ? o.estimatedReady.toISOString() : null,
      readyInMinutes: o.estimatedReady ? Math.round((o.estimatedReady.getTime() - now.getTime()) / 60_000) : null,
      scheduledForIso: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      scheduledSlotMinutes: o.scheduledSlotMinutes ?? null,
      dispatch: o.type === "delivery" ? { status: o.shipdayStatus, dispatchedAtIso: o.dispatchedAt ? o.dispatchedAt.toISOString() : null } : null,
      matchedBy: byNumber && byPhone ? "number+phone" : byNumber ? "number" : "phone",
      // Full details only with a cross-checked order number.
      ...(full ? { total: o.total, customerName: o.customerName } : {}),
    };
  });

  return NextResponse.json({ found: result.length, timezone: restaurant.timezone ?? null, orders: result });
}

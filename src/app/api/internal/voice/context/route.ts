import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { liveOpenStatus, statusForToday, nextOpenAt } from "@/lib/restaurant-hours";
import { holidayEffectToday } from "@/lib/holiday-rules";
import { shouldDispatchToShipday } from "@/lib/shipday";

export const runtime = "nodejs";

/**
 * GET /api/internal/voice/context?slug=<slug>
 *
 * The `check_hours_and_services` tool. Answers FAQ questions AND gates what
 * Nabil is allowed to offer: is the restaurant open right now, today's hours,
 * the next open moment, address/phone, which services are offered + whether
 * each is currently paused, the delivery minimum, and — critically —
 * `cashDeliveryBlocked`: for a ShipDay-dispatched restaurant, delivery is
 * prepaid-only (the driver can't collect at the door), so Nabil must never
 * offer cash delivery. This mirrors the exact server guard in /api/orders.
 *
 * Single-sourced on restaurant-hours.ts (timezone + holiday + split-hours
 * aware), holiday-rules.ts, and shipday.ts — the same logic every other
 * surface uses, so the phone answer can never disagree with the website.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const slug = (req.nextUrl.searchParams.get("slug") || "").toLowerCase().trim();
  if (!slug) {
    return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  }

  const r = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true, name: true, address: true, city: true, state: true, zip: true,
      phone: true, timezone: true, hoursFormat: true, currency: true, taxRate: true,
      acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true, acceptsTakeOut: true,
      acceptsCatering: true, acceptsReservations: true,
      pickupPausedUntil: true, deliveryPausedUntil: true, dineInPausedUntil: true,
      takeOutPausedUntil: true, cateringPausedUntil: true, reservationsPausedUntil: true,
      minimumOrder: true, deliveryFee: true, estimatedPickup: true, estimatedDelivery: true,
      acceptOutsideZoneOrders: true,
      openingHours: true,
      holidays: true,
      deliveryZones: {
        where: { isActive: true },
        select: { name: true, minimumOrder: true, deliveryFee: true, estimatedMinutes: true },
      },
    },
  });
  if (!r) {
    return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });
  }

  // Agent behavior config + FAQ/upsell prompt material, fetched in one
  // parallel batch (this endpoint is hit once per call setup — keep it fast).
  const [cfg, faqRows, upsellRows] = await Promise.all([
    prisma.voiceAgentConfig.findUnique({
      where: { restaurantId: r.id },
      select: {
        canTakeOrders: true,
        canBookReservations: true,
        canAnswerFaq: true,
        quoteEta: true,
        smsConfirmations: true,
        maxCallSeconds: true,
        allowScheduledOrders: true,
        afterHoursBehavior: true,
      },
    }),
    prisma.voiceFaq.findMany({
      where: { restaurantId: r.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 30,
      select: { question: true, answer: true, category: true },
    }),
    prisma.voiceUpsell.findMany({
      where: { restaurantId: r.id, active: true },
      orderBy: { sortOrder: "asc" },
      take: 5,
      select: { note: true, menuItem: { select: { name: true, price: true } } },
    }),
  ]);

  const now = new Date();
  const tz = r.timezone || undefined;
  const fmt: "12h" | "24h" = r.hoursFormat === "12h" ? "12h" : "24h";
  // Cast to the lib's row types (the tests do the same) — the selected relations
  // carry the fields these pure helpers read.
  const hours = r.openingHours as never;
  const holidays = r.holidays as never;

  // Today's holiday effect drives openness, exactly as nextOpenAt does it.
  const eff = holidayEffectToday(holidays, tz, null, now);
  const todayHol =
    eff?.kind === "closed"
      ? {}
      : eff?.kind === "custom_hours"
        ? { intervals: eff.intervals }
        : undefined;

  const live = liveOpenStatus(hours, now, fmt, todayHol, tz);
  const today = statusForToday(hours, now, fmt, eff?.kind === "closed" ? {} : undefined, tz);
  const nextOpen = nextOpenAt(hours, now, tz, holidays, null);

  const pausedNow = (until: Date | null) => !!until && until.getTime() > now.getTime();
  const svc = (offered: boolean, until: Date | null) => ({ offered: !!offered, pausedNow: pausedNow(until) });

  // Mirror the /api/orders guard: cash delivery is impossible when ShipDay
  // dispatches (the third-party driver can't collect at the door).
  const cashDeliveryBlocked = r.acceptsDelivery ? await shouldDispatchToShipday(r.id) : false;

  return NextResponse.json({
    restaurant: {
      name: r.name,
      address: [r.address, r.city, r.state, r.zip].filter(Boolean).join(", "),
      phone: r.phone,
      timezone: tz ?? null,
      currency: r.currency,
      hoursFormat: fmt,
      taxRatePct: r.taxRate,
    },
    open: {
      isOpenNow: live.kind === "open",
      status: live, // tagged union: open{closesAt} | opens_at{opensAt} | closed_today | holiday{name}
      todayHours: today.openRange || null, // "12:00 – 15:00, 18:00 – 23:00" (null on holiday/custom days — use `status`)
      holidayName: live.kind === "holiday" ? (live.name ?? null) : null,
      nextOpenAt: nextOpen ? nextOpen.toISOString() : null,
    },
    services: {
      pickup: svc(r.acceptsPickup, r.pickupPausedUntil),
      delivery: svc(r.acceptsDelivery, r.deliveryPausedUntil),
      dineIn: svc(r.acceptsDineIn, r.dineInPausedUntil),
      takeOut: svc(r.acceptsTakeOut, r.takeOutPausedUntil),
      catering: svc(r.acceptsCatering, r.cateringPausedUntil),
      reservations: svc(r.acceptsReservations, r.reservationsPausedUntil),
    },
    delivery: {
      minimumOrder: r.minimumOrder,
      deliveryFee: r.deliveryFee,
      estimatedMinutes: r.estimatedDelivery,
      acceptOutsideZoneOrders: r.acceptOutsideZoneOrders,
      cashDeliveryBlocked, // true ⇒ Nabil must NOT offer cash delivery (ShipDay prepaid-only)
      zones: r.deliveryZones,
    },
    pickup: { estimatedMinutes: r.estimatedPickup },
    // Agent behavior gates. Defaults mirror the VoiceAgentConfig schema
    // defaults so a restaurant without a config row behaves identically to a
    // freshly-created one (the voice service previously fell back to its own
    // permissive defaults because this block didn't exist).
    config: {
      canTakeOrders: cfg?.canTakeOrders ?? true,
      canBookReservations: cfg?.canBookReservations ?? true,
      canAnswerFaq: cfg?.canAnswerFaq ?? true,
      quoteEta: cfg?.quoteEta ?? true,
      smsConfirmations: cfg?.smsConfirmations ?? true,
      maxCallSeconds: cfg?.maxCallSeconds ?? 600,
      allowScheduledOrders: cfg?.allowScheduledOrders ?? false,
      afterHoursBehavior: cfg?.afterHoursBehavior ?? "take_orders",
    },
    // Owner-curated FAQ (active only, ≤30) — becomes a prompt section.
    faqs: faqRows.map((f) => ({
      q: f.question.trim(),
      a: f.answer.trim(),
      category: f.category,
    })),
    // Featured Upsells (active, ≤5) — items the agent suggests contextually.
    upsells: upsellRows.map((u) => ({
      name: u.menuItem.name,
      price: u.menuItem.price,
      note: u.note ?? null,
    })),
  });
}

import prisma from "@/lib/db";
import {
  liveOpenStatus,
  statusForToday,
  nextOpenAt,
  type LiveOpenStatus,
} from "@/lib/restaurant-hours";
import { holidayEffectToday } from "@/lib/holiday-rules";
import { shouldDispatchToShipday, shipdayPayAtDoorEnabled } from "@/lib/shipday";
import { localDayKey } from "@/lib/voice/analytics";

/**
 * The `check_hours_and_services` tool payload — extracted verbatim from
 * `/api/internal/voice/context/route.ts` so the SAME builder feeds the live
 * route AND the offline snapshot / simulator (`scripts/nabil-snapshot-menu.ts`).
 * The route is a thin wrapper: auth + parse + call + NextResponse.json.
 *
 * Answers FAQ questions AND gates what Nabil is allowed to offer: is the
 * restaurant open right now, today's hours, the next open moment,
 * address/phone, which services are offered + whether each is currently
 * paused, the delivery minimum, and — critically — `cashDeliveryBlocked`: for
 * a ShipDay-dispatched restaurant, delivery is prepaid-only (the driver can't
 * collect at the door), so Nabil must never offer cash delivery. This mirrors
 * the exact server guard in /api/orders.
 *
 * Single-sourced on restaurant-hours.ts (timezone + holiday + split-hours
 * aware), holiday-rules.ts, and shipday.ts — the same logic every other
 * surface uses, so the phone answer can never disagree with the website.
 */

/* ─────────────────────────────── types ─────────────────────────────────── */

export type VoiceServiceStatus = {
  offered: boolean;
  pausedNow: boolean;
  /** UTC ISO of the pause end — for machines (the tool gate compares it to
   *  Date.now() so a pause that expires MID-CALL self-heals). Absent when not
   *  paused; optional so older snapshots/fixtures stay valid. */
  pausedUntil?: string | null;
  /** The same moment in the restaurant's local time and words ("this evening
   *  at 8:00 PM"), computed here like open.nextOpenLocal — a FACT, never left
   *  to the model (see describeNextOpen). Absent when not paused. */
  resumesLocal?: string | null;
};

export type VoiceContextZone = {
  name: string;
  minimumOrder: number | null;
  deliveryFee: number | null;
  estimatedMinutes: number | null;
};

export type VoiceContextPayload = {
  restaurant: {
    name: string;
    address: string;
    phone: string | null;
    timezone: string | null;
    currency: string;
    hoursFormat: "12h" | "24h";
    taxRatePct: number | null;
  };
  open: {
    isOpenNow: boolean;
    /** tagged union: open{closesAt} | opens_at{opensAt} | closed_today | holiday{name} */
    status: LiveOpenStatus;
    /** "12:00 – 15:00, 18:00 – 23:00" (null on holiday/custom days — use `status`) */
    todayHours: string | null;
    holidayName: string | null;
    /** UTC ISO of the next opening moment — for machines. Never for speech:
     *  a model handed "2026-08-16T14:00:00Z" said "we reopen at two" (it was
     *  10 AM Toronto). Use `nextOpenLocal`. */
    nextOpenAt: string | null;
    /** The same moment already in the restaurant's local time and words, e.g.
     *  "this morning at 10:00 AM" / "this evening at 5:00 PM" /
     *  "tomorrow (Saturday) at 10:00 AM" / "Monday at 11:00 AM". Computed here
     *  (timezone + hoursFormat aware) so the model never does timezone
     *  arithmetic. Null when nextOpenAt is null or the restaurant is open. */
    nextOpenLocal: string | null;
    /** YYYY-MM-DD in the restaurant's timezone — passed to reservation tools. */
    localDate: string;
  };
  services: {
    pickup: VoiceServiceStatus;
    delivery: VoiceServiceStatus;
    dineIn: VoiceServiceStatus;
    takeOut: VoiceServiceStatus;
    catering: VoiceServiceStatus;
    reservations: VoiceServiceStatus;
  };
  delivery: {
    minimumOrder: number | null;
    deliveryFee: number | null;
    estimatedMinutes: number | null;
    acceptOutsideZoneOrders: boolean;
    /** true ⇒ Nabil must NOT offer cash delivery (ShipDay prepaid-only) */
    cashDeliveryBlocked: boolean;
    zones: VoiceContextZone[];
  };
  pickup: { estimatedMinutes: number | null };
  config: {
    canTakeOrders: boolean;
    canBookReservations: boolean;
    canAnswerFaq: boolean;
    canAnswerOrderStatus: boolean;
    quoteEta: boolean;
    smsConfirmations: boolean;
    maxCallSeconds: number;
    allowScheduledOrders: boolean;
    afterHoursBehavior: string;
    allowPizzaCombo: boolean;
    offerDayDeals: boolean;
    pickupPaymentMode: string;
    deliveryPaymentMode: string;
    /** never | reluctant | immediate — enforced in the voice service's
     *  transfer chokepoint (tools.ts applyTransferPolicy). Optional so older
     *  fixtures stay valid; absent ⇒ "immediate". */
    transferPolicy?: string;
    transferDeflectionMessage?: string | null;
    transferTakeMessage?: boolean;
    pizzaAskGroups: string[];
    languages: string[];
    agentName: string;
  };
  faqs: Array<{ q: string; a: string; category: string | null }>;
  upsells: Array<{ name: string; price: number; note: string | null }>;
  /** Owner-written Temporary Closure message (VoiceAgentConfig.pauseGreeting),
   *  spoken/relayed INSTEAD of the auto-composed pause notice while any service
   *  is paused. Top-level (not in `config`) because it is live state the
   *  volatile prompt block reads, not an agent behavior gate. Optional so older
   *  snapshots/fixtures stay valid. */
  pauseGreeting?: string | null;
};

export type VoiceContextError = { error: string; code: "missing_slug" | "not_found" };

export type VoiceContextResult =
  | { status: 200; body: VoiceContextPayload }
  | { status: 400 | 404; body: VoiceContextError };

/* ─────────────────────────────── helpers ───────────────────────────────── */

// Extracted to its own prisma-free module (2026-08-20) so the Twilio greeting
// composer + pure libs can use it without importing the DB client; re-exported
// here so every existing import keeps working.
export { describeNextOpen } from "./local-time-words";
import { describeNextOpen } from "./local-time-words";

/* ─────────────────────────────── builder ───────────────────────────────── */

export async function buildVoiceContextPayload(rawSlug: string): Promise<VoiceContextResult> {
  const slug = (rawSlug || "").toLowerCase().trim();
  if (!slug) {
    return { status: 400, body: { error: "Missing slug", code: "missing_slug" } };
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
    return { status: 404, body: { error: "Restaurant not found", code: "not_found" } };
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
        canAnswerOrderStatus: true,
        quoteEta: true,
        smsConfirmations: true,
        maxCallSeconds: true,
        allowScheduledOrders: true,
        afterHoursBehavior: true,
        allowPizzaCombo: true,
        pizzaAskGroups: true,
        languages: true,
        offerDayDeals: true,
        agentName: true,
        // The owner's PHONE payment policy, separate from the web one by
        // design (Luigi 2026-08-12). Until now these were written by the admin
        // and read by nobody, while place_order hardcoded cash — so a store
        // that switched phone orders to prepaid saw nothing change.
        pickupPaymentMode: true,
        deliveryPaymentMode: true,
        // Per-store TRANSFER POLICY (Luigi 2026-08-22): never / reluctant /
        // immediate + the store's own deflection line + take-a-message.
        transferPolicy: true,
        transferDeflectionMessage: true,
        transferTakeMessage: true,
        pauseGreeting: true,
        // Phone-only pause timestamps — separate from the shared
        // Restaurant.*PausedUntil so a Nabil pause never affects the website.
        phonePickupPausedUntil: true,
        phoneDeliveryPausedUntil: true,
        phoneDineInPausedUntil: true,
        phoneTakeOutPausedUntil: true,
        phoneCateringPausedUntil: true,
        phoneReservationsPausedUntil: true,
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
  const svc = (offered: boolean, until: Date | null): VoiceServiceStatus =>
    pausedNow(until)
      ? {
          offered: !!offered,
          pausedNow: true,
          pausedUntil: until!.toISOString(),
          // Use the restaurant's actual next opening time after the pause ends,
          // not the raw pause-end timestamp (which is 23:59 for "until tomorrow").
          // Callers hear "back tomorrow at 10:00 AM", not "back at 11:59 PM".
          resumesLocal: describeNextOpen(nextOpenAt(hours, until!, tz, holidays, null) ?? until!, now, tz, fmt),
        }
      : { offered: !!offered, pausedNow: false };

  // Mirror the /api/orders guard: cash delivery is impossible when ShipDay
  // dispatches (the third-party driver can't collect at the door) — UNLESS the
  // owner turned on pay-at-door delivery, in which case their own staff
  // delivers it and ShipDay only gets a record (Luigi 2026-08-11).
  const cashDeliveryBlocked = r.acceptsDelivery
    ? (await shouldDispatchToShipday(r.id)) && !(await shipdayPayAtDoorEnabled(r.id))
    : false;

  return {
    status: 200,
    body: {
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
        // Only meaningful while closed: nextOpenAt() returns `now` when open.
        nextOpenLocal: nextOpen && live.kind !== "open" ? describeNextOpen(nextOpen, now, tz, fmt) : null,
        // YYYY-MM-DD in the restaurant's timezone — the model needs this to call
        // reservation tools correctly (passing "today" as a date string causes
        // the availability route's regex validation to return 400).
        localDate: localDayKey(now, tz),
      },
      services: {
        pickup: svc(r.acceptsPickup, cfg?.phonePickupPausedUntil ?? null),
        delivery: svc(r.acceptsDelivery, cfg?.phoneDeliveryPausedUntil ?? null),
        dineIn: svc(r.acceptsDineIn, cfg?.phoneDineInPausedUntil ?? null),
        takeOut: svc(r.acceptsTakeOut, cfg?.phoneTakeOutPausedUntil ?? null),
        catering: svc(r.acceptsCatering, cfg?.phoneCateringPausedUntil ?? null),
        reservations: svc(r.acceptsReservations, cfg?.phoneReservationsPausedUntil ?? null),
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
        canAnswerOrderStatus: cfg?.canAnswerOrderStatus ?? true,
        quoteEta: cfg?.quoteEta ?? true,
        smsConfirmations: cfg?.smsConfirmations ?? true,
        maxCallSeconds: cfg?.maxCallSeconds ?? 600,
        allowScheduledOrders: cfg?.allowScheduledOrders ?? false,
        afterHoursBehavior: cfg?.afterHoursBehavior ?? "take_orders",
        // v2 pizza/combo building. Opt-in per store: absent config must keep the
        // v1 transfer behavior, never silently start building.
        allowPizzaCombo: cfg?.allowPizzaCombo ?? false,
        // Offer a cheaper same-day equivalent unprompted. Opt-in: down-selling is
        // a margin decision, never a deploy decision.
        offerDayDeals: cfg?.offerDayDeals ?? false,
        // "unpaid" = pay at the store (cash) · "paid" = require a pay-link ·
        // "both" = link with a pay-at-store fallback. Default "unpaid" matches
        // both the schema default and what every store does today, so nothing
        // changes for anyone until an owner deliberately picks otherwise.
        pickupPaymentMode: cfg?.pickupPaymentMode ?? "unpaid",
        deliveryPaymentMode: cfg?.deliveryPaymentMode ?? "unpaid",
        // Transfer policy. "immediate" = today's behaviour, so nothing changes
        // for any store until its owner picks a level (Luigi 2026-08-22).
        transferPolicy: cfg?.transferPolicy ?? "immediate",
        transferDeflectionMessage: cfg?.transferDeflectionMessage?.trim() || null,
        transferTakeMessage: cfg?.transferTakeMessage ?? true,
        pizzaAskGroups: Array.isArray(cfg?.pizzaAskGroups)
          ? (cfg.pizzaAskGroups as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20)
          : [],
        // Extra languages the owner enabled. Non-empty ⇒ the TwiML nests
        // <Language code="multi"/> and Deepgram auto-detects, so the agent must
        // be told it may answer in whatever language it hears.
        languages: Array.isArray(cfg?.languages)
          ? (cfg.languages as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 38)
          : [],
        // The persona name spoken on calls ("Hi, this is Sophia"). null/empty ⇒
        // the voice service's own normalizeAgentConfig() falls back to "Nabil".
        agentName: cfg?.agentName?.trim() || "",
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
      // Owner's Temporary Closure message — replaces the auto pause notice in
      // the greeting + prompt while any service is paused (Luigi 2026-08-20).
      pauseGreeting: cfg?.pauseGreeting?.trim() || null,
    },
  };
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { validateScheduledSlot, type SlotRules, type SlotVerdict } from "@/lib/voice/scheduled-slot";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/validate-slot
 *
 * The `set_fulfilment` tool's scheduling check: "for six tonight" / "tomorrow at
 * noon" / "Tuesday at 6 pm" → is that a slot THIS store's website would have
 * offered, and what are the exact words to say back? (Luigi's decision A64(b),
 * 2026-08-17.)
 *
 *   body   { slug, type: "pickup" | "delivery", date?: string, time?: string }
 *            date/time EXACTLY as the caller said them ("tomorrow", "Tuesday",
 *            "6 pm", "18:00", "noon", "in an hour"); the resolution happens here,
 *            in the restaurant's timezone — never in the language model.
 *   200    SlotVerdict (src/lib/voice/scheduled-slot.ts):
 *            { ok:true,  scheduledFor:"YYYY-MM-DDTHH:MM" (restaurant wall clock,
 *              what /api/orders takes), scheduledStyle, spoken:"Tuesday at 6:00 PM",
 *              snapped, requestedSpoken?, meridiemGuessed, isToday, isTomorrow }
 *            { ok:false, code, message, earliest?:{scheduledFor,spoken},
 *              latest?:{dateKey,spoken,maxDays}, nearestBefore?, nearestAfter?,
 *              windows?, holidayName?, resumesSpoken?, candidates? }
 *          codes: scheduling_off (the store's toggle is off — the ONLY answer
 *          then, nothing else is evaluated) · service_not_offered · bad_when ·
 *          missing_time · ambiguous_time · scheduled_in_past · service_paused ·
 *          holiday_closed · holiday_custom_hours · holiday_closed_windows ·
 *          outside_opening_hours · first_order_delay · slot_not_offered ·
 *          preorder_too_soon · preorder_too_far · no_slots
 *   4xx    only for a malformed request (bad JSON, missing slug/type, unknown slug).
 *
 * SAME RULES AS THE WEBSITE, by construction: the verdict is computed by the
 * pure `validateScheduledSlot`, which composes the exact library functions the
 * checkout picker and /api/orders use over the exact Restaurant columns they
 * read (hours, holidays, per-service slot interval + first-order delay + slot
 * style, min lead, max days ahead, prep estimates, service pauses). Nothing is
 * re-implemented in the voice service. And /api/orders still re-validates the
 * `scheduledFor` it is handed at quote (dryRun) and placement, so this can only
 * ever be as permissive as the order route — never more.
 *
 * `acceptScheduledOrders` is read HERE from the DB (not trusted from the voice
 * service's cached context) — a store that flips the toggle mid-call gets the
 * new answer on the next tool call.
 */

type Body = { slug?: string; type?: string; date?: string | null; time?: string | null };

export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }
  const slug = (body.slug || "").toLowerCase().trim();
  const type = body.type === "delivery" ? "delivery" : body.type === "pickup" ? "pickup" : null;
  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!type) return NextResponse.json({ error: "type must be pickup or delivery", code: "bad_type" }, { status: 400 });

  const r = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      timezone: true,
      hoursFormat: true,
      serviceSettings: true,
      scheduledOrderInterval: true,
      allowScheduledOrders: true,
      requireScheduledOrders: true,
      pickupMinLeadMinutes: true,
      pickupMaxAdvanceDays: true,
      deliveryMinLeadMinutes: true,
      deliveryMaxAdvanceDays: true,
      estimatedPickup: true,
      estimatedDelivery: true,
      pickupPausedUntil: true,
      deliveryPausedUntil: true,
      acceptsPickup: true,
      acceptsDelivery: true,
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      holidays: true,
      voiceAgentConfig: { select: { acceptScheduledOrders: true } },
    },
  });
  if (!r) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  // The per-store gate — Luigi's toggle, read fresh from the DB every time.
  if (!r.voiceAgentConfig?.acceptScheduledOrders) {
    const off: SlotVerdict = {
      ok: false,
      code: "scheduling_off",
      message: "This restaurant does not take orders for a specific later time by phone — orders are for as soon as possible.",
    };
    return NextResponse.json(off);
  }

  const rules: SlotRules = {
    timezone: r.timezone,
    hoursFormat: r.hoursFormat === "12h" ? "12h" : "24h",
    openingHours: r.openingHours as never,
    holidays: r.holidays as never,
    serviceSettings: r.serviceSettings,
    scheduledOrderInterval: r.scheduledOrderInterval,
    allowScheduledOrders: r.allowScheduledOrders,
    requireScheduledOrders: r.requireScheduledOrders,
    pickupMinLeadMinutes: r.pickupMinLeadMinutes,
    pickupMaxAdvanceDays: r.pickupMaxAdvanceDays,
    deliveryMinLeadMinutes: r.deliveryMinLeadMinutes,
    deliveryMaxAdvanceDays: r.deliveryMaxAdvanceDays,
    estimatedPickup: r.estimatedPickup,
    estimatedDelivery: r.estimatedDelivery,
    pickupPausedUntil: r.pickupPausedUntil,
    deliveryPausedUntil: r.deliveryPausedUntil,
    acceptsPickup: r.acceptsPickup,
    acceptsDelivery: r.acceptsDelivery,
  };
  const verdict = validateScheduledSlot({
    rules,
    type,
    when: { date: typeof body.date === "string" ? body.date : null, time: typeof body.time === "string" ? body.time : null },
  });
  return NextResponse.json(verdict);
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { placeVoiceCall, pollyVoiceForLocale } from "@/lib/voice-call";
import { getDict } from "@/lib/i18n-dict";
import { liveOpenStatus } from "@/lib/restaurant-hours";
import { holidayEffectToday } from "@/lib/holiday-rules";

/**
 * POST/GET /api/cron/order-alert-calls  (Vercel cron, every minute)
 *
 * "Nearly-missed order" auto-call (report cmpxeph4l). Places ONE automated voice
 * call when an order has gone unaccepted ~90s past the moment it started RINGING
 * in the kitchen — so an unattended tablet doesn't drop a real order.
 *
 * The 90s timer is anchored on `alertAt ?? notifiedAt` — the moment the order
 * began ringing / its accept-countdown started (Luigi 2026-06-13):
 *   • notifiedAt — fired to the kitchen the instant it was placed (an order
 *                  placed during OPEN hours rings immediately, scheduled or not).
 *   • alertAt    — deferred ring time for an order PLACED WHILE CLOSED (set to
 *                  the next opening); the clock starts when you open.
 * scheduledFor is deliberately NOT an anchor: a scheduled pre-order rings and is
 * accepted just like a standard order (immediately if open, at opening if
 * closed) — its slot only governs when the food is DUE. So the call lands inside
 * the SAME acceptance window the kitchen + auto-reject use, warning staff before
 * the order times out. Earlier this anchored on scheduledFor, so the warning
 * fired long AFTER the order had already auto-rejected — no useful call ever
 * reached the owner. We NEVER call while the restaurant is currently closed.
 *
 * Idempotent: alertCallAt is stamped so we never call twice. No-op when Twilio
 * voice creds aren't configured (placeVoiceCall returns placed=false) — we still
 * stamp alertCallAt so we don't retry every minute.
 *
 * Authorized callers: Vercel cron (Bearer CRON_SECRET) or a superadmin.
 */
const THRESHOLD_MS = 90_000; // 1.5 minutes unaccepted past the anchor
const LOOKBACK_MS = 30 * 60_000; // ignore anchors older than this (cron catch-up safety)
const MAX_PER_RUN = 50;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const cutoff = new Date(now - THRESHOLD_MS); // anchor must be at/under this (≥90s old)
  const floor = new Date(now - LOOKBACK_MS); // anchor must be at/over this (≤30min old)

  // Pre-filter on the ring anchor = alertAt ?? notifiedAt, which must sit in
  // [floor, cutoff] (≥90s and ≤30min old). Closed-placed orders anchor on
  // alertAt (the deferred opening ring); everything else on notifiedAt. We
  // re-derive the exact anchor + open status per row below.
  const candidates = await prisma.order.findMany({
    where: {
      status: "pending",
      alertCallAt: null,
      notifiedAt: { not: null },
      OR: [
        // Placed-while-closed: ring anchor is the deferred opening time.
        { alertAt: { gte: floor, lte: cutoff } },
        // Everything else (incl. scheduled-while-open): ring anchor = notifiedAt.
        { alertAt: null, notifiedAt: { gte: floor, lte: cutoff } },
      ],
      restaurant: {
        is: {
          autoCallOnNewOrder: true,
          OR: [{ phone: { not: null } }, { alertPhone: { not: null } }],
        },
      },
    },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      notifiedAt: true,
      alertAt: true,
      restaurant: {
        select: {
          name: true,
          phone: true,
          alertPhone: true,
          defaultLanguage: true,
          timezone: true,
          hoursFormat: true,
          openingHours: true,
          holidays: true,
        },
      },
    },
    take: MAX_PER_RUN,
    orderBy: { notifiedAt: "asc" },
  });

  let called = 0;
  const results: Array<{ orderId: string; placed: boolean; reason?: string }> = [];
  for (const o of candidates) {
    const r = o.restaurant;
    // Dedicated alert number wins; otherwise the public phone.
    const phone = r.alertPhone?.trim() || r.phone;
    if (!phone) continue;

    // Anchor = the moment the order started RINGING: the deferred opening time
    // (alertAt) for a closed-placed order, else when it hit the kitchen
    // (notifiedAt). NOT scheduledFor — a pre-order rings/accepts immediately.
    const anchorMs = o.alertAt ? o.alertAt.getTime() : (o.notifiedAt ? o.notifiedAt.getTime() : 0);
    const sinceAnchor = now - anchorMs;
    // Not yet 90s past the anchor, or older than the catch-up window — leave it.
    if (sinceAnchor < THRESHOLD_MS || sinceAnchor > LOOKBACK_MS) {
      results.push({ orderId: o.id, placed: false, reason: "outside alert window" });
      continue;
    }

    // NEVER call while the restaurant is currently closed (holiday-aware). A
    // closed-placed order's anchor is already deferred to opening via alertAt;
    // this also covers an order that went unaccepted right as the shop closed.
    const tz = r.timezone ?? undefined;
    const holiday = holidayEffectToday((r.holidays ?? []) as any, tz, null);
    const live = liveOpenStatus(
      (r.openingHours ?? []) as any,
      new Date(),
      r.hoursFormat === "12h" ? "12h" : "24h",
      holiday
        ? {
            name: holiday.name ?? undefined,
            intervals: holiday.kind === "custom_hours" ? holiday.intervals : undefined,
          }
        : undefined,
      tz,
    );
    if (live.kind !== "open") {
      results.push({ orderId: o.id, placed: false, reason: "restaurant closed" });
      continue;
    }

    // Stamp FIRST so a slow Twilio call or a retry never double-dials.
    await prisma.order.update({ where: { id: o.id }, data: { alertCallAt: new Date() } });

    const locale = r.defaultLanguage || "en";
    const t = await getDict(locale);
    const message = t("kitchen.autoCallMessage");
    const langTag = bcp47(locale);
    const res = await placeVoiceCall({ to: phone, message, language: langTag, voice: pollyVoiceForLocale(locale) });
    if (res.placed) called++;
    else console.error("[order-alert-calls] order voice call NOT placed", { orderId: o.id, to: phone, reason: res.reason });
    results.push({ orderId: o.id, placed: res.placed, reason: res.reason });
  }

  // ── Reservations: the SAME "missed → call the store" safety net (Luigi
  // 2026-06-15). A PENDING (un-accepted) table booking ~90s past its ring anchor
  // gets the same warning call orders do. Anchor = alertAt ?? createdAt (a
  // booking rings on creation, or at opening when placed while closed). Deposit-
  // awaiting bookings are excluded — they wait on the CUSTOMER's payment, not the
  // kitchen. Same open-hours + idempotency (alertCallAt) guards as orders.
  const resCandidates = await prisma.reservation.findMany({
    where: {
      status: "pending",
      alertCallAt: null,
      AND: [
        {
          OR: [
            { alertAt: { gte: floor, lte: cutoff } },
            { alertAt: null, createdAt: { gte: floor, lte: cutoff } },
          ],
        },
        { OR: [{ depositAmount: { lte: 0 } }, { depositPaid: true }] },
      ],
      restaurant: {
        is: {
          autoCallOnNewOrder: true,
          OR: [{ phone: { not: null } }, { alertPhone: { not: null } }],
        },
      },
    },
    select: {
      id: true,
      alertAt: true,
      createdAt: true,
      restaurant: {
        select: {
          name: true, phone: true, alertPhone: true, defaultLanguage: true,
          timezone: true, hoursFormat: true, openingHours: true, holidays: true,
        },
      },
    },
    take: MAX_PER_RUN,
    orderBy: { createdAt: "asc" },
  });

  let resCalled = 0;
  for (const b of resCandidates) {
    const r = b.restaurant;
    const phone = r.alertPhone?.trim() || r.phone;
    if (!phone) continue;
    const anchorMs = b.alertAt ? b.alertAt.getTime() : (b.createdAt ? b.createdAt.getTime() : 0);
    const sinceAnchor = now - anchorMs;
    if (sinceAnchor < THRESHOLD_MS || sinceAnchor > LOOKBACK_MS) {
      results.push({ orderId: `res:${b.id}`, placed: false, reason: "outside alert window" });
      continue;
    }
    const tz = r.timezone ?? undefined;
    const holiday = holidayEffectToday((r.holidays ?? []) as any, tz, null);
    const live = liveOpenStatus(
      (r.openingHours ?? []) as any,
      new Date(),
      r.hoursFormat === "12h" ? "12h" : "24h",
      holiday
        ? { name: holiday.name ?? undefined, intervals: holiday.kind === "custom_hours" ? holiday.intervals : undefined }
        : undefined,
      tz,
    );
    if (live.kind !== "open") {
      results.push({ orderId: `res:${b.id}`, placed: false, reason: "restaurant closed" });
      continue;
    }
    // Stamp FIRST so a slow call or retry never double-dials.
    await prisma.reservation.update({ where: { id: b.id }, data: { alertCallAt: new Date() } });
    const locale = r.defaultLanguage || "en";
    const t = await getDict(locale);
    const message = t("kitchen.autoCallReservationMessage");
    const langTag = bcp47(locale);
    const callRes = await placeVoiceCall({ to: phone, message, language: langTag, voice: pollyVoiceForLocale(locale) });
    if (callRes.placed) resCalled++;
    else console.error("[order-alert-calls] reservation voice call NOT placed", { resId: b.id, to: phone, reason: callRes.reason });
    results.push({ orderId: `res:${b.id}`, placed: callRes.placed, reason: callRes.reason });
  }

  return NextResponse.json({
    scanned: candidates.length + resCandidates.length,
    called: called + resCalled,
    results,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

/** Map our locale codes to Twilio <Say> BCP-47 language tags (best effort). */
function bcp47(locale: string): string {
  const map: Record<string, string> = {
    en: "en-US", it: "it-IT", fr: "fr-FR", es: "es-ES", de: "de-DE", pt: "pt-PT",
    "pt-BR": "pt-BR", nl: "nl-NL", pl: "pl-PL", ru: "ru-RU", sv: "sv-SE", da: "da-DK",
    nb: "nb-NO", fi: "fi-FI", el: "el-GR", ro: "ro-RO", ja: "ja-JP", ko: "ko-KR",
    zh: "zh-CN", ca: "ca-ES", tr: "tr-TR", uk: "uk-UA", ar: "ar-XA", he: "he-IL",
    id: "id-ID", vi: "vi-VN", th: "th-TH", hi: "hi-IN", cs: "cs-CZ", sk: "sk-SK",
    hu: "hu-HU", bg: "bg-BG", hr: "hr-HR",
  };
  return map[locale] || "en-US";
}

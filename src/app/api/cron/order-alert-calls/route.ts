import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { placeVoiceCall } from "@/lib/voice-call";
import { getDict } from "@/lib/i18n-dict";
import { liveOpenStatus } from "@/lib/restaurant-hours";
import { holidayEffectToday } from "@/lib/holiday-rules";

/**
 * POST/GET /api/cron/order-alert-calls  (Vercel cron, every minute)
 *
 * "Nearly-missed order" auto-call (report cmpxeph4l). Places ONE automated voice
 * call when an order has gone unaccepted ~90s past the moment it became the
 * kitchen's LIVE job — so an unattended tablet doesn't drop a real order.
 *
 * The 90s timer is anchored on `max(notifiedAt, alertAt, scheduledFor)`, NOT on
 * when the customer placed the order (Luigi 2026-06-13):
 *   • notifiedAt  — fired to the kitchen (ASAP order during open hours).
 *   • alertAt     — deferred ring time for an order PLACED WHILE CLOSED (set to
 *                   the next opening); so the clock starts when you open.
 *   • scheduledFor— a SCHEDULED order only becomes "live" at its scheduled time,
 *                   never hours before. (Fixes: a tomorrow order rang a call 90s
 *                   after it was placed.)
 * And we NEVER call while the restaurant is currently closed (holiday-aware).
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

  // Pre-filter: every anchor candidate present on the row must be ≥90s old, and
  // AT LEAST ONE must be within the last 30 min — i.e. max(anchors) ∈ [floor,
  // cutoff]. We re-derive the exact anchor + open status per row below.
  const candidates = await prisma.order.findMany({
    where: {
      status: "pending",
      alertCallAt: null,
      notifiedAt: { not: null, lte: cutoff },
      AND: [
        { OR: [{ alertAt: null }, { alertAt: { lte: cutoff } }] },
        { OR: [{ scheduledFor: null }, { scheduledFor: { lte: cutoff } }] },
        {
          OR: [
            { notifiedAt: { gte: floor } },
            { alertAt: { gte: floor } },
            { scheduledFor: { gte: floor } },
          ],
        },
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
      scheduledFor: true,
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

    // Anchor = the latest moment the order became the kitchen's LIVE job.
    const anchorMs = Math.max(
      o.notifiedAt ? o.notifiedAt.getTime() : 0,
      o.alertAt ? o.alertAt.getTime() : 0,
      o.scheduledFor ? o.scheduledFor.getTime() : 0,
    );
    const sinceAnchor = now - anchorMs;
    // Not yet 90s past the anchor (e.g. a scheduled order whose time hasn't come),
    // or older than the catch-up window — leave it for now / forever.
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
    const message = t("kitchen.autoCallMessage", {
      restaurant: r.name,
      number: o.orderNumber,
    });
    const langTag = bcp47(locale);
    const res = await placeVoiceCall({ to: phone, message, language: langTag });
    if (res.placed) called++;
    results.push({ orderId: o.id, placed: res.placed, reason: res.reason });
  }

  return NextResponse.json({ scanned: candidates.length, called, results });
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

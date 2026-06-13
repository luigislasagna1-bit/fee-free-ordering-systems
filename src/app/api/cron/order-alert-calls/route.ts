import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { placeVoiceCall } from "@/lib/voice-call";
import { getDict } from "@/lib/i18n-dict";

/**
 * POST/GET /api/cron/order-alert-calls  (Vercel cron, every minute)
 *
 * "Nearly-missed order" auto-call (report cmpxeph4l). Finds orders that have
 * been released to the kitchen (notifiedAt set) ~90s ago, are still pending
 * (not accepted/rejected), belong to a restaurant that enabled
 * autoCallOnNewOrder + has a phone number, and haven't been called yet —
 * then places one automated voice call so an unattended tablet doesn't drop
 * the order. Idempotent: alertCallAt is stamped so we never call twice.
 *
 * No-op when Twilio voice creds aren't configured (placeVoiceCall returns
 * placed=false) — we still stamp alertCallAt so we don't retry every minute.
 *
 * Authorized callers: Vercel cron (Bearer CRON_SECRET) or a superadmin.
 */
const THRESHOLD_MS = 90_000; // 1.5 minutes
const LOOKBACK_MS = 30 * 60_000; // ignore very old orders (cron catch-up safety)
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
  const cutoff = new Date(now - THRESHOLD_MS);
  const floor = new Date(now - LOOKBACK_MS);

  const candidates = await prisma.order.findMany({
    where: {
      status: "pending",
      alertCallAt: null,
      notifiedAt: { not: null, lte: cutoff, gte: floor },
      // Needs SOME number to call: the dedicated alertPhone OR the public phone.
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
      restaurant: { select: { name: true, phone: true, alertPhone: true, defaultLanguage: true } },
    },
    take: MAX_PER_RUN,
    orderBy: { notifiedAt: "asc" },
  });

  let called = 0;
  const results: Array<{ orderId: string; placed: boolean; reason?: string }> = [];
  for (const o of candidates) {
    // Dedicated alert number wins; otherwise the public phone.
    const phone = o.restaurant.alertPhone?.trim() || o.restaurant.phone;
    if (!phone) continue;
    // Stamp FIRST so a slow Twilio call or a retry never double-dials.
    await prisma.order.update({ where: { id: o.id }, data: { alertCallAt: new Date() } });

    const locale = o.restaurant.defaultLanguage || "en";
    const t = await getDict(locale);
    const message = t("kitchen.autoCallMessage", {
      restaurant: o.restaurant.name,
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

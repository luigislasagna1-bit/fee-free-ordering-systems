import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { placeVoiceCall } from "@/lib/voice-call";
import { getDict } from "@/lib/i18n-dict";

/**
 * GET /api/admin/test-alert-call
 *
 * Owner-triggered TEST of the missed-order auto phone-call. Places ONE voice
 * call to the restaurant's OWN saved alert number (alertPhone, else the store
 * phone) and returns Twilio's exact result — so the owner can verify the call
 * works, and we can see the precise failure reason when it doesn't (e.g. voice
 * creds not configured in prod, or an international number blocked by Twilio's
 * Voice Geographic Permissions). It only ever dials the restaurant's own saved
 * number (never a caller-supplied one), so it can't be used to ring arbitrary
 * numbers. Luigi reseller report 2026-06-16.
 */
const LANG: Record<string, string> = {
  en: "en-US", it: "it-IT", fr: "fr-FR", es: "es-ES", de: "de-DE", pt: "pt-PT",
  "pt-BR": "pt-BR", nl: "nl-NL", ro: "ro-RO", pl: "pl-PL", ar: "ar-XA",
};

export async function GET() {
  // Admin/owner-triggered (the "Test call" button on the Orders settings page),
  // so use the admin session — NOT preferKitchen, which could resolve to a
  // different location for a multi-location owner with a stale kitchen session.
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { name: true, phone: true, alertPhone: true, defaultLanguage: true },
  });

  const configured = !!(
    process.env.FFOS_TWILIO_ACCOUNT_SID &&
    process.env.FFOS_TWILIO_AUTH_TOKEN &&
    process.env.FFOS_TWILIO_FROM_NUMBER
  );
  const to = (r?.alertPhone?.trim() || r?.phone?.trim() || "");
  if (!to) {
    return NextResponse.json({
      ok: false,
      configured,
      error: "No alert phone or store phone is set for this restaurant.",
    });
  }

  const locale = r?.defaultLanguage || "en";
  const t = await getDict(locale);
  const message = t("kitchen.autoCallMessage", { restaurant: r?.name ?? "", number: "TEST" });
  const res = await placeVoiceCall({ to, message, language: LANG[locale] ?? "en-US" });

  return NextResponse.json({
    ok: res.placed,
    configured,
    calledNumber: to,
    placed: res.placed,
    reason: res.reason ?? null,
    sid: res.sid ?? null,
  });
}

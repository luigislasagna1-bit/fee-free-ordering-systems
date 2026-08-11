import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requirePhoneOrderingFeature } from "./guard";

export const runtime = "nodejs";

/**
 * Nabil AI config — GET + PATCH the restaurant's VoiceAgentConfig.
 * Restaurant-scoped by the session (user.restaurantId), like every other admin
 * settings route, plus the phone_ordering_agent entitlement. The config is 1:1
 * with the restaurant; PATCH upserts it.
 */

// Only these fields are owner-editable (whitelist — never trust arbitrary keys).
const BOOL_FIELDS = [
  "enabled", "ambientNoise", "canTakeOrders", "canBookReservations", "canAnswerFaq",
  "allowPizzaCombo", "allowAnonymousCallers", "quoteEta", "allowScheduledOrders",
  "smsConfirmations", "recordCalls",
] as const;
const STR_FIELDS = [
  "openGreeting", "closedGreeting", "primaryLanguage", "ttsProvider", "sttProvider",
  "voice", "transferToNumber", "afterHoursBehavior", "pickupPaymentMode",
  "deliveryPaymentMode", "payByLinkPrepMode",
] as const;
const INT_FIELDS = ["maxCallSeconds", "payByLinkWindowMinutes"] as const;
const FLOAT_FIELDS = ["voiceSpeed"] as const;

const PAYMENT_MODES = new Set(["unpaid", "paid", "both"]);
const PREP_MODES = new Set(["cook_now", "hold_until_paid"]);
const AFTER_HOURS = new Set(["take_orders", "reservations_only", "message_only", "transfer"]);

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forbidden = await requirePhoneOrderingFeature(restaurantId);
  if (forbidden) return forbidden;

  const [config, number] = await Promise.all([
    prisma.voiceAgentConfig.findUnique({ where: { restaurantId } }),
    prisma.voiceNumber.findFirst({ where: { restaurantId }, orderBy: { createdAt: "asc" } }),
  ]);
  return NextResponse.json({ config, number });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forbidden = await requirePhoneOrderingFeature(restaurantId);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  for (const k of BOOL_FIELDS) if (typeof body[k] === "boolean") data[k] = body[k];
  for (const k of STR_FIELDS) {
    if (typeof body[k] === "string") {
      const v = body[k].trim();
      // Validate the enum-ish fields; ignore invalid values rather than
      // storing junk. DELIBERATE: silent-ignore (not a 400) — the existing
      // settings client PATCHes the whole form and expects partial saves to
      // succeed. Keep it this way (audited 2026-08-10).
      if (k === "pickupPaymentMode" || k === "deliveryPaymentMode") {
        if (PAYMENT_MODES.has(v)) data[k] = v;
      } else if (k === "payByLinkPrepMode") {
        if (PREP_MODES.has(v)) data[k] = v;
      } else if (k === "afterHoursBehavior") {
        if (AFTER_HOURS.has(v)) data[k] = v;
      } else if (k === "openGreeting" || k === "closedGreeting") {
        data[k] = v.slice(0, 200); // ≤200 chars, matches the ConversationRelay greeting
      } else {
        data[k] = v || null;
      }
    }
  }
  for (const k of INT_FIELDS) {
    if (typeof body[k] === "number" && Number.isFinite(body[k])) {
      let n = Math.round(body[k]);
      if (k === "payByLinkWindowMinutes") n = Math.min(60, Math.max(1, n));
      if (k === "maxCallSeconds") n = Math.min(1800, Math.max(60, n));
      data[k] = n;
    }
  }
  for (const k of FLOAT_FIELDS) {
    if (typeof body[k] === "number" && Number.isFinite(body[k])) {
      data[k] = Math.min(2, Math.max(0.5, body[k]));
    }
  }
  // Pizza option groups the agent must always ask about instead of taking the
  // store default (empty = smart defaults). Ids only, capped.
  if (Array.isArray(body.pizzaAskGroups)) {
    data.pizzaAskGroups = body.pizzaAskGroups
      .filter((s: unknown) => typeof s === "string")
      .slice(0, 20);
  }
  // languages (enabled locale slugs) as a JSON array of strings.
  if (Array.isArray(body.languages)) {
    data.languages = body.languages.filter((s: unknown) => typeof s === "string").slice(0, 38);
  }

  const config = await prisma.voiceAgentConfig.upsert({
    where: { restaurantId },
    create: { restaurantId, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true, config });
}

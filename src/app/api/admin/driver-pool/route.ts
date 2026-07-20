import { NextRequest, NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { encrypt } from "@/lib/encrypt";
import { claimPartnerIntro, unclaimPartnerIntro, buildAndSendPartnerIntro } from "@/lib/shipday-partner";
import { restaurantHasOnlinePayments } from "@/lib/shipday";

/**
 * PUT /api/admin/driver-pool
 * Body: {
 *   enabled?: boolean,
 *   deliverySource?: "own" | "shipday" | "both",
 *   deliveryFeeMode?: "pass_through" | "flat" | "tiered",
 *   flatDeliveryFee?: number,
 *   tieredRules?: Array<{ minOrderTotal: number, customerFee: number }>,
 *   apiKey?: string, // optional — only sent when the owner is setting/replacing
 * }
 *
 * Owner-scoped, gated on the `driver_pool` entitlement (granted by
 * the Driver Pool or Marketplace add-on). The apiKey, when provided,
 * is encrypted with the platform key before storage and never logged.
 *
 * Returns 412 if entitlement is missing (UI should redirect to the
 * locked-view page in that case). Server-side check is the source
 * of truth — a tampered client can't bypass the locked view by
 * POSTing directly.
 */

const SOURCE_OK = new Set(["own", "shipday", "both"]);
const FEE_MODE_OK = new Set(["pass_through", "flat", "tiered"]);

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate (LR-SEC-02): this saves the delivery PROVIDER chooser + ShipDay
  // config — owner-only, the ShipDay-side sibling of the FeeFree config PUT.
  // Gate on `role`, not effectiveRole (impersonating superadmins still pass).
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitled = await hasFeature(restaurantId, "driver_pool");

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  if (typeof body.deliverySource === "string") {
    if (!SOURCE_OK.has(body.deliverySource)) {
      return NextResponse.json({ error: "Invalid deliverySource" }, { status: 400 });
    }
    // Only "own" is allowed without the driver_pool entitlement.
    // "shipday" and "both" both require an active standalone Driver Pool
    // subscription. Tamper-resistant: the UI hides those tiles for
    // non-entitled users but a direct PUT would otherwise let them save an
    // invalid state that the kitchen can't actually dispatch.
    if (body.deliverySource !== "own" && !entitled) {
      return NextResponse.json(
        {
          error: "Subscribe to the Driver Pool add-on to dispatch via ShipDay.",
          code: "addon_required",
        },
        { status: 412 },
      );
    }
    update.deliverySource = body.deliverySource;
  }

  // ShipDay-credentials / fee-mode fields are gated — no point saving
  // a ShipDay API key for a restaurant that can't actually use ShipDay.
  //
  // BUT: the client always sends the full ShipdayConfig payload (enabled,
  // deliveryFeeMode, flatDeliveryFee, tieredRules) regardless of which
  // delivery source is chosen, because the form has all the fields on
  // screen. Treating ALL of those as "trying to configure ShipDay" was
  // rejecting saves where the user picked "Own drivers" and just hit
  // Save — they hadn't touched any ShipDay-specific config but the
  // payload still carried the default values. Luigi hit this exact bug
  // during setup.
  //
  // The fix: only enforce the entitlement gate when the user is ACTUALLY
  // trying to enable ShipDay (deliverySource != "own" OR enabled=true OR
  // they typed a new API key). Pure "Own drivers" saves with leftover
  // ShipDay defaults in the payload pass through.
  const effectiveSource = typeof body.deliverySource === "string" ? body.deliverySource : null;
  const wantsShipday =
    (effectiveSource && effectiveSource !== "own") ||
    body.enabled === true ||
    (typeof body.apiKey === "string" && body.apiKey.trim() !== "");
  if (wantsShipday && !entitled) {
    return NextResponse.json(
      {
        error: "Subscribe to the Driver Pool add-on to configure ShipDay dispatch.",
        code: "addon_required",
      },
      { status: 412 },
    );
  }

  // ShipDay dispatch also requires a WORKING online payment method (Luigi
  // 2026-07-04): ShipDay drivers only pick up + drop off — they can't collect
  // cash or take a card at the door, so every dispatched order must be prepaid
  // online. Without Stripe keys or a connected PayPal account, enabling
  // ShipDay would make delivery checkout impossible (the customer page hides
  // at-door methods for ShipDay delivery). Gate only the ENABLING transition
  // (deliverySource → shipday/both, or enabled=true) — "own drivers" saves
  // and key-only updates pass through.
  const enablingShipday =
    (effectiveSource && effectiveSource !== "own") || body.enabled === true;
  if (enablingShipday && !(await restaurantHasOnlinePayments(restaurantId))) {
    return NextResponse.json(
      {
        error:
          "ShipDay dispatch needs an online payment method first. ShipDay drivers only pick up and drop off — they can't collect payment at the door — so delivery orders must be paid online. Enable card payments (Settings → Payments) or connect PayPal, then turn ShipDay on.",
        code: "online_payment_required",
      },
      { status: 412 },
    );
  }

  if (typeof body.deliveryFeeMode === "string") {
    if (!FEE_MODE_OK.has(body.deliveryFeeMode)) {
      return NextResponse.json({ error: "Invalid deliveryFeeMode" }, { status: 400 });
    }
    update.deliveryFeeMode = body.deliveryFeeMode;
  }

  if (typeof body.flatDeliveryFee === "number" && body.flatDeliveryFee >= 0) {
    update.flatDeliveryFee = body.flatDeliveryFee;
  }

  if (Array.isArray(body.tieredRules)) {
    // Filter to well-formed entries only — silently drop malformed rows.
    const clean = body.tieredRules.filter(
      (r: unknown): r is { minOrderTotal: number; customerFee: number } =>
        !!r && typeof (r as any).minOrderTotal === "number" && typeof (r as any).customerFee === "number",
    );
    update.tieredRules = JSON.stringify(clean);
  }

  // API key — encrypt before storage. Only update the three encrypted
  // columns together (or skip entirely if no key in body). NEVER store
  // the raw key.
  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    const { enc, iv, tag } = encrypt(body.apiKey.trim());
    update.apiKeyEnc = enc;
    update.apiKeyIv = iv;
    update.apiKeyTag = tag;
  }

  await prisma.shipdayConfig.upsert({
    where: { restaurantId },
    create: { restaurantId, ...update },
    update,
  });

  const cfg = await prisma.shipdayConfig.findUnique({
    where: { restaurantId },
    select: { deliverySource: true, partnerNotifiedAt: true, webhookToken: true },
  });

  // PER-RESTAURANT webhook token — minted the first time the restaurant picks
  // a ShipDay source (wizard step 3 shows the URL to paste into ShipDay →
  // Integrations). 16 random bytes hex = exactly ShipDay's 32-char token cap.
  // Never regenerated on later saves (the pasted dashboard URL must stay valid).
  if (cfg && cfg.deliverySource !== "own" && !cfg.webhookToken) {
    await prisma.shipdayConfig.update({
      where: { restaurantId },
      data: { webhookToken: randomBytes(16).toString("hex") },
    });
  }

  // Auto-intro to the Shipday partner (Justin) the FIRST time this restaurant
  // turns Shipday on — loops Justin + the merchant + ops into one thread so the
  // account is created, the partner discount applied, credits added, and
  // onboarding scheduled (the handoff Justin asked for). Atomic one-shot claim
  // (shared with the wizard's "Have ShipDay contact me" button); after() so a
  // slow email never blocks the save; failed send un-claims for a retry.
  if (cfg && cfg.deliverySource !== "own" && !cfg.partnerNotifiedAt) {
    if (await claimPartnerIntro(restaurantId)) {
      after(() =>
        buildAndSendPartnerIntro(restaurantId).catch(async (e) => {
          console.error("[driver-pool] shipday partner intro failed", e);
          await unclaimPartnerIntro(restaurantId);
        }),
      );
    }
  }

  return NextResponse.json({ ok: true });
}

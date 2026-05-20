import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { encrypt } from "@/lib/encrypt";

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
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitled = await hasFeature(restaurantId, "driver_pool");
  if (!entitled) {
    return NextResponse.json(
      {
        error: "Subscribe to Driver Pool or Marketplace to configure dispatch.",
        code: "addon_required",
      },
      { status: 412 },
    );
  }

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
    update.deliverySource = body.deliverySource;
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

  return NextResponse.json({ ok: true });
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { isFeeFreeServiceArea } from "@/lib/feefree-delivery";
import { DriverPoolClient } from "./DriverPoolClient";
import { FeeFreeDeliverySection } from "./FeeFreeDeliverySection";
import { FeeFreeDeliveryOps } from "./FeeFreeDeliveryOps";

/**
 * /admin/delivery/pool — delivery dispatch configuration.
 *
 * Available to EVERY restaurant that accepts delivery — not gated on
 * the driver_pool entitlement. Every restaurant must explicitly choose
 * how they manage deliveries (own drivers, ShipDay pool, or both)
 * before they can join the marketplace. Without the Driver Pool
 * entitlement, the "Own drivers" option is freely selectable while
 * "ShipDay" and "Both" appear locked with an upsell link.
 *
 * The actual dispatch-to-ShipDay API calls are made at order
 * acceptance time by the kitchen — this page is config only.
 */
export const dynamic = "force-dynamic";

export default async function DriverPoolConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  // Upsert pattern: create the config row if it doesn't exist yet so the
  // form has a stable shape to bind to. Defaults match the schema
  // (deliverySource="own", enabled=false, etc.).
  let config = await prisma.shipdayConfig.findUnique({
    where: { restaurantId: user.restaurantId },
  });
  if (!config) {
    config = await prisma.shipdayConfig.create({
      data: { restaurantId: user.restaurantId },
    });
  }

  const entitled = await hasFeature(user.restaurantId, "driver_pool");

  // FeeFree Delivery is geo-gated: our own driver pool only serves its home region
  // (≤100km of Milton / the GTA). Restaurants OUTSIDE that radius never see the
  // FeeFree option at all — they only get Own + ShipDay (ShipDay is global). Luigi
  // 2026-07-14.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { lat: true, lng: true },
  });
  const feefreeAvailable = isFeeFreeServiceArea(restaurant?.lat, restaurant?.lng);

  // Fee Free Delivery (our own driver pool) — sibling config, precedence over
  // ShipDay when enabled. Upsert so the section always has a row to bind to.
  // Only touched/read when FeeFree is available in this restaurant's area.
  const feefree = feefreeAvailable
    ? ((await prisma.feeFreeDeliveryConfig.findUnique({ where: { restaurantId: user.restaurantId } })) ??
       (await prisma.feeFreeDeliveryConfig.create({ data: { restaurantId: user.restaurantId } })))
    : null;

  // Never send the encrypted API key blob to the client — just whether
  // one has been saved. The form shows "•••• saved" if so, with a
  // "Replace" button to set a new one.
  const hasApiKey = !!config.apiKeyEnc;

  // Owner's personal webhook URL for the wizard's "connect the webhook" step.
  // The token is minted on the first shipday/both save (driver-pool PUT) —
  // null until then. Exposing it to the OWNER is the point: they paste it
  // into their ShipDay dashboard; it only authorizes THEIR orders.
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");
  const webhookUrl = config.webhookToken
    ? `${base}/api/webhooks/shipday?token=${config.webhookToken}`
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {feefree && (
        <>
          <FeeFreeDeliverySection
            initial={{ enabled: feefree.enabled, autoSend: feefree.autoSend }}
            entitled={entitled}
          />
          {feefree.enabled && <FeeFreeDeliveryOps restaurantId={user.restaurantId} />}
        </>
      )}
      <DriverPoolClient
      initial={{
        enabled: config.enabled,
        driverPoolEnabled: config.driverPoolEnabled,
        deliverySource: config.deliverySource as "own" | "shipday" | "both",
        deliveryFeeMode: config.deliveryFeeMode as "pass_through" | "flat" | "tiered",
        flatDeliveryFee: config.flatDeliveryFee ?? 0,
        tieredRules: safeJsonArray(config.tieredRules),
        hasApiKey,
        webhookUrl,
        webhookVerified: !!config.webhookVerifiedAt,
        partnerContacted: !!config.partnerNotifiedAt,
      }}
      driverPoolEntitled={entitled}
      />
    </div>
  );
}

function safeJsonArray(s: string | null | undefined): Array<{ minOrderTotal: number; customerFee: number }> {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (r): r is { minOrderTotal: number; customerFee: number } =>
        typeof r?.minOrderTotal === "number" && typeof r?.customerFee === "number",
    );
  } catch {
    return [];
  }
}

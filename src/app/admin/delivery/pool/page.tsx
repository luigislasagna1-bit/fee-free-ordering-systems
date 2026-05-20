import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { DriverPoolLockedView } from "./DriverPoolLockedView";
import { DriverPoolClient } from "./DriverPoolClient";

/**
 * /admin/delivery/pool — ShipDay driver-pool configuration.
 *
 * Gated on the `driver_pool` entitlement (granted by EITHER the
 * Driver Pool add-on OR the bundled Marketplace add-on). Owners
 * paste their ShipDay credentials, flip the master enable, pick how
 * customers see the per-delivery fee, and choose whether their own
 * drivers, ShipDay drivers, or both handle deliveries.
 *
 * The actual dispatch-to-ShipDay API calls are made at order
 * acceptance time by the kitchen — this page is config only.
 */
export const dynamic = "force-dynamic";

export default async function DriverPoolConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const entitled = await hasFeature(user.restaurantId, "driver_pool");
  if (!entitled) {
    return <DriverPoolLockedView />;
  }

  // Upsert pattern: create the config row if it doesn't exist yet so the
  // form has a stable shape to bind to. Defaults match the schema.
  let config = await prisma.shipdayConfig.findUnique({
    where: { restaurantId: user.restaurantId },
  });
  if (!config) {
    config = await prisma.shipdayConfig.create({
      data: { restaurantId: user.restaurantId },
    });
  }

  // Never send the encrypted API key blob to the client — just whether
  // one has been saved. The form shows "•••• saved" if so, with a
  // "Replace" button to set a new one.
  const hasApiKey = !!config.apiKeyEnc;

  return (
    <DriverPoolClient
      initial={{
        enabled: config.enabled,
        driverPoolEnabled: config.driverPoolEnabled,
        deliverySource: config.deliverySource as "own" | "shipday" | "both",
        deliveryFeeMode: config.deliveryFeeMode as "pass_through" | "flat" | "tiered",
        flatDeliveryFee: config.flatDeliveryFee ?? 0,
        tieredRules: safeJsonArray(config.tieredRules),
        hasApiKey,
      }}
    />
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

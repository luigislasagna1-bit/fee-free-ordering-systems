import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { OrderHandlingClient } from "./OrderHandlingClient";

export default async function OrderHandlingPage() {
  const user = await getSessionUser();
  // Authed-but-no-restaurant (superadmin) goes to /superadmin, not /login — see
  // AGENTS.md redirect-loop rule.
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: {
      autoAcceptOrders: true,
      allowScheduledOrders: true,
      requireScheduledOrders: true,
      // For the auto-accept help text ("…Pickup: {pickup} min, Delivery: {delivery} min").
      estimatedPickup: true,
      estimatedDelivery: true,
      // Relocated here from /admin/settings: kitchen workflow mode + missed-order auto-call.
      kitchenWorkflowMode: true,
      autoCallOnNewOrder: true,
      alertPhone: true,
      phone: true,
    },
  });

  // Platform Twilio VOICE creds present? Drives the auto-call "not configured" warning
  // (one account for all restaurants) — mirrors /admin/settings.
  const twilioVoiceConfigured = !!(
    process.env.FFOS_TWILIO_ACCOUNT_SID &&
    process.env.FFOS_TWILIO_AUTH_TOKEN &&
    process.env.FFOS_TWILIO_FROM_NUMBER
  );

  return (
    <OrderHandlingClient
      initial={{
        autoAcceptOrders: restaurant?.autoAcceptOrders ?? false,
        allowScheduledOrders: restaurant?.allowScheduledOrders ?? true,
        requireScheduledOrders: restaurant?.requireScheduledOrders ?? false,
        pickupEta: restaurant?.estimatedPickup ?? 20,
        deliveryEta: restaurant?.estimatedDelivery ?? 45,
        workflowMode: restaurant?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple",
        autoCallOnNewOrder: restaurant?.autoCallOnNewOrder ?? false,
        alertPhone: restaurant?.alertPhone ?? null,
        storePhone: restaurant?.phone ?? null,
      }}
      twilioVoiceConfigured={twilioVoiceConfigured}
    />
  );
}

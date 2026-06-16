import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { OrdersClient } from "./OrdersClient";
import { KitchenWorkflowToggle } from "./KitchenWorkflowToggle";

export default async function OrdersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [orders, restaurant] = await Promise.all([
    prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { include: { modifiers: true } },
        customer: true,
      },
    }),
    restaurantId
      ? prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { kitchenWorkflowMode: true, printNodeEnabled: true, autoCallOnNewOrder: true, kitchenVibrate: true, phone: true, alertPhone: true },
        })
      : null,
  ]);

  const mode = (restaurant?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple") as
    | "simple"
    | "tracking";
  const printNodeEnabled = !!restaurant?.printNodeEnabled;
  const autoCall = !!restaurant?.autoCallOnNewOrder;
  // Default ON: existing restaurants (null) + new ones vibrate unless turned off.
  const kitchenVibrate = restaurant?.kitchenVibrate !== false;
  // Platform Twilio VOICE creds present? Read server-side so the toggle can warn
  // when calls physically can't be placed (avoids a toggle that reads "On" but
  // silently no-ops). These are platform-level — one account for all restaurants.
  const twilioVoiceConfigured = !!(
    process.env.FFOS_TWILIO_ACCOUNT_SID &&
    process.env.FFOS_TWILIO_AUTH_TOKEN &&
    process.env.FFOS_TWILIO_FROM_NUMBER
  );

  return (
    <div className="space-y-6">
      <KitchenWorkflowToggle
        initialMode={mode}
        initialPrintNodeEnabled={printNodeEnabled}
        initialAutoCall={autoCall}
        initialKitchenVibrate={kitchenVibrate}
        storePhone={restaurant?.phone ?? null}
        initialAlertPhone={restaurant?.alertPhone ?? null}
        twilioVoiceConfigured={twilioVoiceConfigured}
      />
      <OrdersClient orders={orders as any} />
    </div>
  );
}

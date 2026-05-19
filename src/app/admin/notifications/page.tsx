import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { NotificationsClient } from "./NotificationsClient";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  // See add-ons/page.tsx for the rationale.
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [recipients, restaurant] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: {
        customerEmailPickupReady: true,
        customerEmailDeliveryReady: true,
        customerEmailDineInReady: true,
        customerEmailOrderRejected: true,
        customerEmailOrderConfirm: true,
      },
    }),
  ]);

  return <NotificationsClient initialRecipients={recipients as any} initialCustomer={restaurant as any} />;
}

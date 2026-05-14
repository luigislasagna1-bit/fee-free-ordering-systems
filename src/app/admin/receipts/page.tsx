import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { ReceiptsClient } from "./ReceiptsClient";

export default async function ReceiptsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const [templates, restaurant, printerSettings] = await Promise.all([
    prisma.receiptTemplate.findMany({ where: { restaurantId }, orderBy: { createdAt: "asc" } }),
    restaurantId ? prisma.restaurant.findUnique({ where: { id: restaurantId } }) : null,
    restaurantId ? prisma.printerSettings.findUnique({ where: { restaurantId } }) : null,
  ]);
  return (
    <ReceiptsClient
      templates={templates as any}
      restaurant={restaurant}
      printerSettings={printerSettings as any}
    />
  );
}

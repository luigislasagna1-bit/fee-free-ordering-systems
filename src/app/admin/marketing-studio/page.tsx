import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { buildSmartLinkUrl } from "@/lib/marketing-studio";
import { MarketingStudioClient } from "./MarketingStudioClient";

export default async function MarketingStudioPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null; // admin layout already gates auth

  const [restaurant, links] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } }),
    prisma.smartLink.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true, targetPath: true, isActive: true, scanCount: true, orderCount: true, revenueCents: true, createdAt: true },
    }),
  ]);

  return (
    <MarketingStudioClient
      currency={restaurant?.currency ?? "usd"}
      initialLinks={links.map((l) => ({
        ...l,
        url: buildSmartLinkUrl(l.code),
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}

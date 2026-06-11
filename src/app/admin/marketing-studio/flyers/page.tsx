import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseTheme } from "@/lib/theme";
import { FlyersClient } from "./FlyersClient";

export default async function FlyersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null;

  const [restaurant, links, assets] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, logoUrl: true, address: true, city: true, phone: true, themeSettings: true },
    }),
    prisma.smartLink.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.marketingAsset.findMany({
      where: { restaurantId, type: "flyer" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, designJson: true, smartLinkId: true },
    }),
  ]);

  const theme = parseTheme(restaurant?.themeSettings);

  return (
    <FlyersClient
      branding={{
        name: restaurant?.name ?? "",
        logoUrl: restaurant?.logoUrl ?? null,
        address: [restaurant?.address, restaurant?.city].filter(Boolean).join(", "),
        phone: restaurant?.phone ?? null,
        primaryColor: theme.primaryColor,
      }}
      links={links}
      initialAssets={assets.map((a) => {
        let d: { templateId?: string; headline?: string; offerText?: string } = {};
        try { d = JSON.parse(a.designJson || "{}"); } catch {}
        return {
          id: a.id,
          name: a.name,
          smartLinkId: a.smartLinkId,
          templateId: d.templateId ?? "bold",
          headline: d.headline ?? "",
          offerText: d.offerText ?? "",
        };
      })}
    />
  );
}

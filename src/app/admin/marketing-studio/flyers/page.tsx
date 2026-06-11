import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseTheme } from "@/lib/theme";
import { flyerWebsiteDefault } from "@/lib/marketing-studio";
import { FlyersClient } from "./FlyersClient";

export default async function FlyersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null;

  const [restaurant, links, assets] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true, logoUrl: true, address: true, city: true, phone: true, themeSettings: true,
        slug: true, customDomain: true, customDomainStatus: true, socialLinks: true,
      },
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
  const phoneDefault = restaurant?.phone ?? "";
  const websiteDefault = restaurant ? flyerWebsiteDefault(restaurant) : "";

  return (
    <FlyersClient
      branding={{
        name: restaurant?.name ?? "",
        logoUrl: restaurant?.logoUrl ?? null,
        address: [restaurant?.address, restaurant?.city].filter(Boolean).join(", "),
        phone: phoneDefault,
        website: websiteDefault,
        primaryColor: theme.primaryColor,
      }}
      links={links}
      initialAssets={assets.map((a) => {
        let d: { templateId?: string; headline?: string; offerText?: string; phone?: string; website?: string; footerText?: string } = {};
        try { d = JSON.parse(a.designJson || "{}"); } catch {}
        return {
          id: a.id,
          name: a.name,
          smartLinkId: a.smartLinkId,
          templateId: d.templateId ?? "bold",
          headline: d.headline ?? "",
          offerText: d.offerText ?? "",
          // Backfill contact from live restaurant data for flyers saved before
          // these fields existed (empty string in JSON also falls back).
          phone: d.phone || phoneDefault,
          website: d.website || websiteDefault,
          footerText: d.footerText ?? "",
        };
      })}
    />
  );
}

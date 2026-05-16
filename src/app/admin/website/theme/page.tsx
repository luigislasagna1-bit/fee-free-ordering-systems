import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { WebsiteThemeClient } from "./WebsiteThemeClient";

export default async function WebsiteThemePage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId ?? "" },
    select: { slug: true, themeSettings: true, bannerUrl: true, logoUrl: true, name: true },
  });

  return <WebsiteThemeClient restaurant={restaurant as any} />;
}

import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { SocialMediaClient } from "./SocialMediaClient";

export default async function SocialMediaPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null;

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { socialLinks: true, marketingTier: true, slug: true },
  });

  let parsed: Record<string, string> = {};
  try { parsed = r?.socialLinks ? JSON.parse(r.socialLinks) : {}; } catch {}

  return (
    <SocialMediaClient
      initialLinks={parsed}
      restaurantSlug={r?.slug ?? ""}
    />
  );
}

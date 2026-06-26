import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { PromoPopupClient } from "./PromoPopupClient";

/** Admin → Marketing → Promo Popup. Loads the saved config + the restaurant's ACTIVE
 *  promotions and coupons so the owner can point the popup button straight at one. */
export default async function PromoPopupPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null; // admin layout handles auth redirects

  const [restaurant, promotions, coupons] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { orderingPopup: true } }),
    prisma.promotion.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.coupon.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, code: true, description: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <PromoPopupClient
      initialConfig={(restaurant?.orderingPopup ?? {}) as any}
      promotions={promotions}
      coupons={coupons}
    />
  );
}

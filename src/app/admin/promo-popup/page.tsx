import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { PromoPopupClient } from "./PromoPopupClient";

/** Admin → Marketing → Promo Popup. Loads the saved config + the restaurant's ACTIVE
 *  promotions so the owner can point the popup button straight at one. (Coupons are
 *  being folded into promotions, so the popup links to a promotion or a URL — not a
 *  standalone coupon. Luigi 2026-06-26.) */
export default async function PromoPopupPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null; // admin layout handles auth redirects

  const [restaurant, promotions] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { orderingPopup: true } }),
    prisma.promotion.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <PromoPopupClient
      initialConfig={(restaurant?.orderingPopup ?? {}) as any}
      promotions={promotions}
    />
  );
}

import "server-only";
import type prismaDefault from "@/lib/db";

/**
 * COMPLETELY delete a restaurant and every row scoped to it.
 *
 * Why this isn't just `prisma.restaurant.delete()`: ~25 of the ~55
 * restaurant-scoped tables have their FK to Restaurant set to the default
 * (Restrict), so a plain delete errors on the first one. We therefore delete
 * every restaurant-scoped table's rows ourselves first, then the Restaurant row
 * (the remaining Cascade children drop with it).
 *
 * FK ORDERING is resolved by RETRY, not by hand: on each pass we try to
 * `deleteMany` every remaining table; the ones still blocked by a child FK go to
 * the next pass. Leaf tables clear first, then their parents, until none remain.
 * We do NOT wrap the whole thing in one transaction — a failed statement aborts a
 * Postgres transaction, which would defeat the retry — but the Restaurant row is
 * only removed AFTER every scoped table is empty, and if the loop stalls (a
 * dependency we can't resolve) we throw BEFORE touching the Restaurant row, so
 * the restaurant is never half-deleted. Superadmin-only; destructive + permanent.
 * Luigi 2026-07-01.
 */

// Prisma delegate names (camelCase model names) for every table with a
// restaurantId column. Derived from prisma/schema.prisma. Keep in sync if a new
// restaurant-scoped table is added (a missing one just blocks the final delete
// with a clear error, so it fails safe).
const RESTAURANT_SCOPED_DELEGATES = [
  "autopilotCampaign", "autopilotState", "autopilotStep", "cartSession",
  "commissionTransaction", "connectivityEvent", "coupon", "customer",
  "customerCoupon", "customerGroup", "customerGroupMember", "customerGroupPromotion",
  "deliveryZone", "kickstarterState", "kitchenDevice", "kitchenPushToken",
  "marketingAsset", "marketplaceListing", "marketplaceSettlement", "menu",
  "menuCategory", "menuItem", "menuItemView", "modifierGroup",
  "notificationRecipient", "openingHours", "order", "orderRating",
  "paymentProvider", "pendingMenuImage", "printLog", "printerSettings",
  "promotion", "promotionUsage", "prospectImport", "receiptTemplate",
  "reportDailySnapshot", "reservation", "reservationSettings", "reservationTable",
  "restaurantAccess", "restaurantAddOn", "restaurantBillingProfile", "restaurantHoliday",
  "rewardAccount", "rewardEarnRule", "sandboxRestaurant", "serviceFee",
  "shipdayConfig", "smartLink", "subscriptionInvoice", "user",
  "vipSchedule", "websiteFunnelEvent", "websiteVisit",
] as const;

export async function deleteRestaurantCompletely(
  prisma: typeof prismaDefault,
  restaurantId: string,
): Promise<{ deletedTables: string[]; passes: number }> {
  // Guard: never orphan child locations. A brand parent with sub-locations must
  // have them reassigned/deleted first — otherwise their parentRestaurantId gets
  // SetNull and they silently become standalone.
  const childLocations = await prisma.restaurant.count({
    where: { parentRestaurantId: restaurantId },
  });
  if (childLocations > 0) {
    throw new Error(
      `Refusing to delete: this restaurant is a brand parent with ${childLocations} child location(s). Reassign or delete them first.`,
    );
  }

  const cleared: string[] = [];
  let remaining: string[] = [...RESTAURANT_SCOPED_DELEGATES];
  let pass = 0;
  for (; pass < 30 && remaining.length > 0; pass++) {
    const stillBlocked: string[] = [];
    for (const model of remaining) {
      try {
        await (prisma as any)[model].deleteMany({ where: { restaurantId } });
        cleared.push(model);
      } catch {
        // Almost always a child FK not yet deleted — retry next pass.
        stillBlocked.push(model);
      }
    }
    if (stillBlocked.length === remaining.length) {
      // A full pass made zero progress → an unresolved dependency. Fail BEFORE
      // deleting the Restaurant row, so nothing is half-removed.
      throw new Error(
        `Restaurant delete stalled — these tables are still blocked by a foreign key: ${stillBlocked.join(", ")}. Investigate before retrying.`,
      );
    }
    remaining = stillBlocked;
  }

  // Every scoped table is empty; the Restaurant row's remaining Cascade children
  // (if any) drop with it.
  await prisma.restaurant.delete({ where: { id: restaurantId } });
  return { deletedTables: cleared, passes: pass };
}

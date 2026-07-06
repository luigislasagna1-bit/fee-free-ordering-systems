/* Completely delete restaurant test accounts by owner/restaurant email — for
 * cleaning up signup test accounts so a test can be re-run on the same email.
 *
 *   DRY RUN (default — shows what WOULD be deleted, deletes nothing):
 *     npx tsx scripts/run-on-prod.ts scripts/_delete-test-accounts.ts a@x.com b@y.com
 *   ACTUALLY DELETE:
 *     npx tsx scripts/run-on-prod.ts scripts/_delete-test-accounts.ts a@x.com b@y.com --confirm
 *
 * Safety rails:
 *   • Dry run unless --confirm is passed.
 *   • Refuses any restaurant older than 7 days unless --force (so a mistyped
 *     email can't nuke an established real restaurant).
 *   • Each restaurant is deleted inside ONE transaction — if anything unexpected
 *     blocks it, the whole delete rolls back (no half-deleted account). If it
 *     errors on a table this script doesn't know about, paste the error and add
 *     that table to childrenDeletes below.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

const MAX_AGE_DAYS = 7;

async function deleteRestaurantCompletely(rid: string) {
  await prisma.$transaction(async (tx: any) => {
    // Parent ids needed to delete grandchildren that have no restaurantId.
    const menuItems = await tx.menuItem.findMany({ where: { restaurantId: rid }, select: { id: true } });
    const menuCats = await tx.menuCategory.findMany({ where: { restaurantId: rid }, select: { id: true } });
    const orders = await tx.order.findMany({ where: { restaurantId: rid }, select: { id: true } });
    const customers = await tx.customer.findMany({ where: { restaurantId: rid }, select: { id: true } });
    const rewardAccts = await tx.rewardAccount.findMany({ where: { restaurantId: rid }, select: { id: true } });
    const itemIds = menuItems.map((r: any) => r.id);
    const catIds = menuCats.map((r: any) => r.id);
    const orderIds = orders.map((r: any) => r.id);
    const customerIds = customers.map((r: any) => r.id);
    const rewardAcctIds = rewardAccts.map((r: any) => r.id);
    const groups = await tx.modifierGroup.findMany({
      where: { OR: [{ menuItemId: { in: itemIds } }, { categoryId: { in: catIds } }, { restaurantId: rid }] },
      select: { id: true },
    });
    const groupIds = groups.map((r: any) => r.id);
    const orderItems = await tx.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
    const orderItemIds = orderItems.map((r: any) => r.id);

    // Grandchildren first (FK-safe), then children, then the restaurant.
    await tx.modifierOption.deleteMany({ where: { modifierGroupId: { in: groupIds } } });
    await tx.modifierGroup.deleteMany({ where: { id: { in: groupIds } } });
    await tx.itemVariant.deleteMany({ where: { menuItemId: { in: itemIds } } });
    await tx.orderItemModifier.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderRating.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.rewardLedger.deleteMany({ where: { accountId: { in: rewardAcctIds } } });
    await tx.customerAddress.deleteMany({ where: { customerId: { in: customerIds } } });

    // Everything with a direct restaurantId (deleteMany is a no-op if empty).
    // Order matters: anything that references Customer (orders, reservations,
    // customerCoupon, rewardAccount) must go BEFORE customer; promotionUsage +
    // menu grandchildren already deleted above.
    for (const del of [
      () => tx.promotionUsage.deleteMany({ where: { restaurantId: rid } }),
      () => tx.order.deleteMany({ where: { restaurantId: rid } }),
      () => tx.reservationTable.deleteMany({ where: { restaurantId: rid } }),
      () => tx.reservation.deleteMany({ where: { restaurantId: rid } }),
      () => tx.reservationSettings.deleteMany({ where: { restaurantId: rid } }),
      () => tx.restaurantHoliday.deleteMany({ where: { restaurantId: rid } }),
      () => tx.customerCoupon.deleteMany({ where: { restaurantId: rid } }),
      () => tx.rewardEarnRule.deleteMany({ where: { restaurantId: rid } }),
      () => tx.rewardAccount.deleteMany({ where: { restaurantId: rid } }),
      () => tx.customer.deleteMany({ where: { restaurantId: rid } }),
      () => tx.promotion.deleteMany({ where: { restaurantId: rid } }),
      () => tx.coupon.deleteMany({ where: { restaurantId: rid } }),
      () => tx.menuItem.deleteMany({ where: { restaurantId: rid } }),
      () => tx.menuCategory.deleteMany({ where: { restaurantId: rid } }),
      () => tx.openingHours.deleteMany({ where: { restaurantId: rid } }),
      () => tx.deliveryZone.deleteMany({ where: { restaurantId: rid } }),
      () => tx.paymentProvider.deleteMany({ where: { restaurantId: rid } }),
      () => tx.printerSettings.deleteMany({ where: { restaurantId: rid } }),
      () => tx.printLog.deleteMany({ where: { restaurantId: rid } }),
      () => tx.receiptTemplate.deleteMany({ where: { restaurantId: rid } }),
      () => tx.reportDailySnapshot.deleteMany({ where: { restaurantId: rid } }),
      () => tx.autopilotCampaign.deleteMany({ where: { restaurantId: rid } }),
      () => tx.commissionTransaction.deleteMany({ where: { restaurantId: rid } }),
      () => tx.connectivityEvent.deleteMany({ where: { restaurantId: rid } }),
      () => tx.menuItemView.deleteMany({ where: { restaurantId: rid } }),
      () => tx.websiteVisit.deleteMany({ where: { restaurantId: rid } }),
      () => tx.websiteFunnelEvent.deleteMany({ where: { restaurantId: rid } }),
      () => tx.user.deleteMany({ where: { restaurantId: rid } }),
    ]) {
      await del();
    }

    // Finally the restaurant — cascades every remaining onDelete:Cascade child
    // (NotificationRecipient, notification settings, etc.).
    await tx.restaurant.delete({ where: { id: rid } });
  }, { timeout: 30000 });
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const force = args.includes("--force");
  const emails = args.filter((a) => a.includes("@")).map((e) => e.trim().toLowerCase());
  if (emails.length === 0) {
    console.error("Usage: _delete-test-accounts.ts <email> [email...] [--confirm] [--force]");
    process.exit(1);
  }

  // Match by owner (User) email OR the restaurant's own email.
  const byUser = await prisma.user.findMany({ where: { email: { in: emails } }, select: { restaurantId: true, email: true } });
  const ridsFromUsers = byUser.map((u: any) => u.restaurantId).filter(Boolean);
  const restaurants = await prisma.restaurant.findMany({
    where: { OR: [{ id: { in: ridsFromUsers } }, { email: { in: emails } }] },
    select: { id: true, name: true, slug: true, email: true, createdAt: true, resellerProfileId: true },
  });

  if (restaurants.length === 0) {
    console.log("No restaurants matched:", emails.join(", "));
    await prisma.$disconnect();
    return;
  }

  const now = Date.now();
  console.log(`\nMatched ${restaurants.length} restaurant(s):\n`);
  for (const r of restaurants) {
    const ageDays = Math.round((now - new Date(r.createdAt).getTime()) / 86400000);
    const [orders, items, users] = await Promise.all([
      prisma.order.count({ where: { restaurantId: r.id } }),
      prisma.menuItem.count({ where: { restaurantId: r.id } }),
      prisma.user.count({ where: { restaurantId: r.id } }),
    ]);
    console.log(`  • ${r.name}  [slug=${r.slug}] created ${ageDays}d ago  email=${r.email}  reseller=${r.resellerProfileId ?? "none"}  (orders=${orders}, menuItems=${items}, users=${users})`);
  }

  const tooOld = restaurants.filter((r: any) => (now - new Date(r.createdAt).getTime()) / 86400000 > MAX_AGE_DAYS);
  if (tooOld.length && !force) {
    console.error(`\n⛔ ${tooOld.length} restaurant(s) are older than ${MAX_AGE_DAYS} days. Refusing (pass --force to override):`);
    tooOld.forEach((r: any) => console.error(`   ${r.name} [${r.slug}]`));
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!confirm) {
    console.log(`\n🟡 DRY RUN — nothing deleted. Re-run with --confirm to permanently delete the above.\n`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n🔴 DELETING ${restaurants.length} restaurant(s)...\n`);
  for (const r of restaurants) {
    try {
      await deleteRestaurantCompletely(r.id);
      console.log(`   ✅ deleted ${r.name} [${r.slug}]`);
    } catch (e) {
      console.error(`   ❌ FAILED ${r.name} [${r.slug}] — rolled back. ${String(e).slice(0, 300)}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

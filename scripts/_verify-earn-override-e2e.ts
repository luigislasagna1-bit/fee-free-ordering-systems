/** DEV-only E2E for VIP earn-rate overrides (Luigi 2026-07-19).
 *  setup   → member customer (known pw) + VIP group @10% on demo-pizza-palace
 *  assert  → newest order of that customer: projectOrderEarn == 10% of basis,
 *            complete + awardForOrder → wallet == same amount (preview==grant);
 *            control customer (non-member) earns the base rate.
 *  cleanup → removes the test group/customers/wallets.
 *  Usage: npx tsx scripts/_verify-earn-override-e2e.ts <setup|assert|cleanup>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import bcrypt from "bcryptjs";

const EMAIL = "vip-earn-e2e@test.local";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = (await import("../src/lib/db")).default;
  const mode = process.argv[2] || "setup";
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: true, rewardEarnPercent: true } });
  if (!r) throw new Error("demo store missing");

  if (mode === "setup") {
    console.log(`store base: enabled=${r.rewardsEnabled}/${r.rewardEarnEnabled} mode=${r.rewardEarnMode} pct=${r.rewardEarnPercent}`);
    if (!r.rewardsEnabled || !r.rewardEarnEnabled) {
      await prisma.restaurant.update({ where: { id: r.id }, data: { rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: "percent", rewardEarnPercent: 5 } });
      console.log("→ enabled rewards 5% base for the test");
    }
    const pw = await bcrypt.hash("VipEarn123!", 12);
    const existing = await prisma.customer.findFirst({ where: { restaurantId: r.id, email: EMAIL }, select: { id: true } });
    const data = { passwordHash: pw, signedUpAt: new Date(Date.now() - 86400000), emailVerifiedAt: new Date() };
    const cust = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data })
      : await prisma.customer.create({ data: { restaurantId: r.id, name: "VIP Earn E2E", email: EMAIL, phone: "9055550123", ...data } });
    const group = await prisma.customerGroup.upsert({
      where: { restaurantId_name: { restaurantId: r.id, name: "E2E Double Bucks" } },
      update: { rewardEarnPercent: 10 },
      create: { restaurantId: r.id, name: "E2E Double Bucks", rewardEarnPercent: 10 },
    });
    await prisma.customerGroupMember.upsert({
      where: { groupId_customerId: { groupId: group.id, customerId: cust.id } },
      update: {},
      create: { groupId: group.id, restaurantId: r.id, customerId: cust.id, email: EMAIL },
    });
    // A promo-visible earn rule so the reward TILE renders (the per-customer
    // earn line lives on those tiles).
    const tileRule = await prisma.rewardEarnRule.findFirst({ where: { restaurantId: r.id, label: "E2E Signup Tile" } });
    if (!tileRule) {
      await prisma.rewardEarnRule.create({ data: { restaurantId: r.id, triggerType: "signup", earnAmount: 5, showInPromos: true, label: "E2E Signup Tile" } });
    }
    console.log(`✓ setup: customer ${cust.id} (${EMAIL} / VipEarn123!) in group @10%; base 5%; tile rule ready`);
    return;
  }

  if (mode === "assert") {
    const { projectOrderEarn } = await import("../src/lib/reward-earn");
    const { awardForOrder, getBalance, earnBasisForOrder } = await import("../src/lib/reward-ledger") as any;
    const cust = await prisma.customer.findFirst({ where: { restaurantId: r.id, email: EMAIL }, select: { id: true } });
    if (!cust) throw new Error("run setup first");
    const order = await prisma.order.findFirst({ where: { restaurantId: r.id, customerId: cust.id }, orderBy: { createdAt: "desc" }, select: { id: true, subtotal: true, status: true } });
    if (!order) throw new Error("no order for the member — place one signed-in first");
    const basis = await earnBasisForOrder(order.id);
    const projected = await projectOrderEarn(order.id);
    console.log(`order ${order.id} basis=$${basis} projected=$${projected} (expect 10% = $${(basis * 0.10).toFixed(2)})`);
    if (Math.abs(projected - basis * 0.10) > 0.011) throw new Error("PROJECTION != 10%");
    await prisma.order.update({ where: { id: order.id }, data: { status: "completed", completedAt: new Date() } });
    await awardForOrder({ orderId: order.id });
    const bal = await getBalance({ restaurantId: r.id, customerId: cust.id });
    console.log(`wallet after completion: $${bal} (expect == projected $${projected})`);
    if (Math.abs(bal - projected) > 0.001) throw new Error("GRANT != PROJECTION");
    console.log("✓ member earns 10% and preview == grant to the cent");
    return;
  }

  if (mode === "cleanup") {
    const cust = await prisma.customer.findFirst({ where: { restaurantId: r.id, email: EMAIL }, select: { id: true } });
    await prisma.customerGroup.deleteMany({ where: { restaurantId: r.id, name: "E2E Double Bucks" } });
    await prisma.rewardEarnRule.deleteMany({ where: { restaurantId: r.id, label: "E2E Signup Tile" } });
    if (cust) {
      await prisma.rewardLedger.deleteMany({ where: { account: { customerId: cust.id } } });
      await prisma.rewardAccount.deleteMany({ where: { customerId: cust.id } });
      await prisma.orderItemModifier.deleteMany({ where: { orderItem: { order: { customerId: cust.id } } } });
      await prisma.orderItem.deleteMany({ where: { order: { customerId: cust.id } } });
      await prisma.order.deleteMany({ where: { customerId: cust.id } });
      await prisma.customer.delete({ where: { id: cust.id } });
    }
    console.log("✓ cleanup done");
    return;
  }
  throw new Error("unknown mode");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/** DEV-only E2E for the placement-time earn-rate SNAPSHOT (A22, 2026-07-22).
 *  Builds on _verify-earn-override-e2e.ts (VIP customer @10%, base 5%).
 *  After placing a REAL order through the ordering UI as the VIP customer:
 *    assert → (1) Order.rewardEarnOverridePct === 10 (stamped at placement);
 *             (2) projectOrderEarn == 10% of basis;
 *             (3) RATE EDIT to 20% (the race!) → projection STILL 10% (stamp
 *                 wins; pre-fix it would flip to 20%);
 *             (4) awardForOrder → wallet credited exactly the projected amount
 *                 (promised == granted despite the mid-flight rate edit);
 *             (5) group restored to 10%.
 *  Usage: npx tsx scripts/_verify-earn-snapshot-e2e.ts assert
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "vip-earn-e2e@test.local";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = (await import("../src/lib/db")).default;
  const { projectOrderEarn } = await import("../src/lib/reward-earn");
  const { awardForOrder, getBalance, earnBasisForOrder } = (await import("../src/lib/reward-ledger")) as any;

  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo store missing");
  const cust = await prisma.customer.findFirst({ where: { restaurantId: r.id, email: EMAIL }, select: { id: true } });
  if (!cust) throw new Error("run _verify-earn-override-e2e.ts setup first");
  const group = await prisma.customerGroup.findFirst({ where: { restaurantId: r.id, name: "E2E Double Bucks" }, select: { id: true } });
  if (!group) throw new Error("E2E group missing");

  const order = await prisma.order.findFirst({
    where: { restaurantId: r.id, customerId: cust.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNumber: true, status: true, rewardEarnOverridePct: true },
  });
  if (!order) throw new Error("place an order as the VIP customer first (ordering UI)");
  console.log(`order ${order.orderNumber} status=${order.status} stamp=${order.rewardEarnOverridePct}`);

  // (1) the stamp
  if (order.rewardEarnOverridePct !== 10) throw new Error(`FAIL: stamp expected 10, got ${order.rewardEarnOverridePct}`);
  console.log("✓ (1) placement stamp = 10");

  // (2) projection at the stamped rate
  const basis = await earnBasisForOrder(order.id);
  const proj1 = await projectOrderEarn(order.id);
  const expect10 = Math.round(basis * 0.10 * 100) / 100;
  if (Math.abs(proj1 - expect10) > 0.001) throw new Error(`FAIL: projection ${proj1} != 10% of basis (${expect10})`);
  console.log(`✓ (2) projection ${proj1} == 10% of basis ${basis}`);

  // (3) THE RACE: rate edited mid-flight → projection must NOT move
  await prisma.customerGroup.update({ where: { id: group.id }, data: { rewardEarnPercent: 20 } });
  const proj2 = await projectOrderEarn(order.id);
  if (Math.abs(proj2 - expect10) > 0.001) throw new Error(`FAIL: projection moved to ${proj2} after rate edit (stamp ignored!)`);
  console.log(`✓ (3) rate edited to 20% mid-flight — projection unchanged at ${proj2}`);

  // (4) the grant pays the stamped rate
  const before = await getBalance({ restaurantId: r.id, customerId: cust.id });
  await prisma.order.update({ where: { id: order.id }, data: { status: "completed", completedAt: new Date() } });
  await awardForOrder({ orderId: order.id });
  const after = await getBalance({ restaurantId: r.id, customerId: cust.id });
  const earned = Math.round((after - before) * 100) / 100;
  if (Math.abs(earned - expect10) > 0.001) throw new Error(`FAIL: granted ${earned}, promised ${expect10}`);
  console.log(`✓ (4) grant ${earned} == promised ${expect10} (promised == granted despite the rate edit)`);

  // (5) restore
  await prisma.customerGroup.update({ where: { id: group.id }, data: { rewardEarnPercent: 10 } });
  console.log("✓ (5) group restored to 10%");
  console.log("ALL PASS");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

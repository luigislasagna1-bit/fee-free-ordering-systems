/**
 * E2E (dev DB): the gift-claim money path. Uses the pending gift created via the
 * browser test (gift-e2e-nobody@example.com, $7.50 at demo-pizza-palace):
 *   1. create the account-holding Customer row (simulating signup)
 *   2. claimPendingGiftsFor → wallet MUST be +7.50, gift claimed
 *   3. claim again → idempotent no-op (balance unchanged)
 *   4. clean up every fixture (gifts, customer, wallet)
 * Refuses to run against prod (dawn-tree).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = (await import("../src/lib/db")).default;
  const { claimPendingGiftsFor } = await import("../src/lib/reward-gifts");

  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo-pizza-palace not found");
  const email = "gift-e2e-nobody@example.com";

  const gift = await prisma.pendingRewardGrant.findFirst({ where: { restaurantId: r.id, email, status: "pending" } });
  if (!gift) throw new Error("pending gift fixture not found (run the browser step first)");
  console.log(`fixture gift: ${gift.id} $${gift.amount}`);

  // 1. "Signup" — account-holding customer row.
  const customer = await prisma.customer.create({
    data: { restaurantId: r.id, email, name: "E2E Nobody", signedUpAt: new Date() },
    select: { id: true },
  });

  // 2. Claim.
  const res1 = await claimPendingGiftsFor({ restaurantId: r.id, customerId: customer.id, email });
  const acct = await prisma.rewardAccount.findUnique({
    where: { restaurantId_customerId: { restaurantId: r.id, customerId: customer.id } },
    select: { id: true, balance: true, ledger: { select: { reason: true, orderId: true, amount: true } } },
  });
  console.log("claim #1:", JSON.stringify(res1), "balance:", acct?.balance, "ledger:", JSON.stringify(acct?.ledger));
  const claimed = await prisma.pendingRewardGrant.findUnique({ where: { id: gift.id }, select: { status: true, customerId: true } });
  console.log("gift row:", JSON.stringify(claimed));

  // 3. Idempotency — second claim must change nothing.
  const res2 = await claimPendingGiftsFor({ restaurantId: r.id, customerId: customer.id, email });
  const acct2 = await prisma.rewardAccount.findUnique({
    where: { restaurantId_customerId: { restaurantId: r.id, customerId: customer.id } },
    select: { balance: true },
  });
  console.log("claim #2 (should be 0):", JSON.stringify(res2), "balance still:", acct2?.balance);

  const pass =
    res1.claimed === 1 && res1.totalAmount === 7.5 &&
    acct?.balance === 7.5 && claimed?.status === "claimed" && claimed.customerId === customer.id &&
    res2.claimed === 0 && acct2?.balance === 7.5 &&
    acct?.ledger.some((l) => l.orderId === `gift:${gift.id}` && l.reason === "grant" && l.amount === 7.5);
  console.log(pass ? "\n✅ E2E PASS — claim credits once, idempotent, correct ledger key" : "\n❌ E2E FAIL");

  // 4. Cleanup: fixtures only.
  if (acct) await prisma.rewardLedger.deleteMany({ where: { accountId: acct.id } });
  await prisma.rewardAccount.deleteMany({ where: { restaurantId: r.id, customerId: customer.id } });
  await prisma.pendingRewardGrant.deleteMany({ where: { restaurantId: r.id, email: { startsWith: "gift-e2e-" } } });
  await prisma.customer.delete({ where: { id: customer.id } });
  console.log("fixtures cleaned");
  if (!pass) process.exit(1);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * READ-ONLY prod check before staging Erick's $10 make-good (Luigi's GO 2026-07-19):
 *   1. Luigi's store reward config — is the "sign up, earn 5% back in Luigi Bucks"
 *      email claim TRUE as configured? (rewardsEnabled/earn mode/percent/labels)
 *   2. Erick's Customer row (via his 2026-07-17 $12.79 pickup order) — id + masked
 *      email + account status, needed for the VIP-special attach + preview proof.
 *   3. Any existing promo code collision for the planned hidden code.
 * SELECT-only. Email is MASKED in output (PII stays in the DB).
 * Run: npx tsx scripts/_erick-giftcheck-readonly.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const envText = readFileSync(".env.local", "utf8");
const m = envText.match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod (dawn-tree) URL not found in .env.local comments.");

const mask = (e: string | null) => (e ? e.slice(0, 3) + "***@" + e.split("@")[1] : null);

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);

  const r = await p.restaurant.findUnique({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: {
      id: true, slug: true, name: true, currency: true, defaultLanguage: true,
      rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: true,
      rewardEarnPercent: true, rewardEarnPerDollar: true,
      rewardLabelSingular: true, rewardLabelPlural: true, vipMemberLabel: true,
    },
  });
  if (!r) throw new Error("Luigi's restaurant not found");
  console.log("RESTAURANT:", JSON.stringify({ ...r, id: r.id }, null, 2));

  // Erick's order: 2026-07-17, $12.79 (the kickstarter-email order with no discount).
  const order = await p.order.findFirst({
    where: {
      restaurantId: r.id,
      total: 12.79,
      createdAt: { gte: new Date("2026-07-16T00:00:00Z"), lte: new Date("2026-07-19T00:00:00Z") },
    },
    select: {
      id: true, orderNumber: true, total: true, type: true, createdAt: true,
      customerId: true,
      customer: { select: { id: true, name: true, email: true, phone: true, passwordHash: true, signedUpAt: true } },
    },
  });
  if (!order?.customer) throw new Error("Erick's order/customer not found");
  console.log("ERICK:", JSON.stringify({
    orderNumber: order.orderNumber, total: order.total, type: order.type, createdAt: order.createdAt,
    customerId: order.customer.id,
    name: order.customer.name,
    email: mask(order.customer.email),
    hasPhone: !!order.customer.phone,
    hasAccount: !!order.customer.passwordHash,
    signedUpAt: order.customer.signedUpAt,
  }, null, 2));

  // Existing VIP-special targets for him (should be none yet)?
  const existingTargets = await p.customerGroupPromotion.count({
    where: { restaurantId: r.id, groupId: null, customerId: order.customer.id },
  });
  console.log("existing individual VIP targets for Erick:", existingTargets);

  // Code collision check for the planned hidden code.
  for (const code of ["SORRY10", "ERICK10"]) {
    const clash = await p.promotion.findFirst({ where: { restaurantId: r.id, couponCode: code }, select: { id: true } });
    console.log(`code ${code}: ${clash ? "TAKEN" : "free"}`);
  }

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

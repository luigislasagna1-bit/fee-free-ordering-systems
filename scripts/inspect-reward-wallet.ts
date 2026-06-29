/**
 * READ-ONLY Reward Dollars wallet inspector (verification aid, 2026-06-29).
 *
 * Prints a customer's wallet balance, the full append-only ledger, and the
 * store's reward earn settings — everything needed to verify the money flow
 * during the Monday test pass (MONDAY_PLAN.md tests #1–#3). Writes NOTHING.
 *
 * Usage (against prod — Luigi runs this himself):
 *   npx tsx scripts/run-on-prod.ts scripts/inspect-reward-wallet.ts <store-slug> <customer-email>
 * e.g.
 *   npx tsx scripts/run-on-prod.ts scripts/inspect-reward-wallet.ts luigis-lasagna-pizzeria test@example.com
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set (check .env.local).");
  process.exit(1);
}
const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
const prisma = new PrismaClient({
  adapter: isNeon ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
} as any);

const [, , slug, email] = process.argv;
if (!slug || !email) {
  console.error("Usage: npx tsx scripts/run-on-prod.ts scripts/inspect-reward-wallet.ts <store-slug> <customer-email>");
  process.exit(1);
}

function money(n: number) {
  return (n < 0 ? "-$" : " $") + Math.abs(n).toFixed(2);
}

async function main() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, currency: true,
      rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true, rewardSignupBonus: true,
      rewardEarnEnabled: true, rewardEarnMode: true, rewardEarnPercent: true, rewardEarnPerDollar: true,
      rewardRedeemEnabled: true, rewardMaxRedeemPercent: true, rewardMinRedeemBalance: true, rewardExpiryDays: true,
    },
  });
  if (!restaurant) {
    console.error(`No restaurant with slug "${slug}".`);
    process.exit(1);
  }

  const rewardName = restaurant.rewardLabelPlural ?? restaurant.rewardLabelSingular ?? "(localized default)";
  console.log(`\n=== STORE: ${restaurant.name} (${slug}) ===`);
  console.log(`  Reward Dollars enabled : ${restaurant.rewardsEnabled}  | name: "${rewardName}"`);
  console.log(`  Signup bonus (always-on): ${money(restaurant.rewardSignupBonus ?? 0)}`);
  console.log(`  Auto-earn              : ${restaurant.rewardEarnEnabled}  | mode: ${restaurant.rewardEarnMode}`);
  console.log(`     percent of order    : ${restaurant.rewardEarnPercent}%`);
  console.log(`     per $1 spent        : ${restaurant.rewardEarnPerDollar}`);
  console.log(`  Spend at checkout      : ${restaurant.rewardRedeemEnabled}`);
  console.log(`  Spend caps             : max ${restaurant.rewardMaxRedeemPercent ?? "—"}% of order | min redeem balance ${money(restaurant.rewardMinRedeemBalance ?? 0)}`);
  console.log(`  Expiry days            : ${restaurant.rewardExpiryDays ?? "(none)"}`);

  // Earn rules / campaigns
  const rules = await prisma.rewardEarnRule.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { createdAt: "asc" },
  }).catch(() => [] as any[]);
  if (rules.length) {
    console.log(`\n  Ways to earn (${rules.length}):`);
    for (const r of rules) {
      const reward = r.earnAmount != null ? money(r.earnAmount) : r.earnPercent != null ? `${r.earnPercent}%` : "—";
      console.log(`    • [${r.active ? "ON " : "off"}] ${r.triggerType}  reward=${reward}` +
        (r.orderThreshold != null ? ` orderOver=${money(r.orderThreshold)}` : "") +
        (r.nthInterval != null ? ` everyNth=${r.nthInterval}` : "") +
        (r.label ? ` "${r.label}"` : "") +
        (r.startsAt ? ` from=${r.startsAt.toISOString().slice(0, 10)}` : "") +
        (r.endsAt ? ` to=${r.endsAt.toISOString().slice(0, 10)}` : "") +
        (r.showInPromos ? `  [shown in Promos]` : ""));
    }
  }

  // Match the customer in this store (customers are restaurant-scoped)
  const customers = await prisma.customer.findMany({
    where: { restaurantId: restaurant.id, email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!customers.length) {
    console.log(`\n!! No customer with email "${email}" in this store. (Check spelling / that they signed up here.)`);
    process.exit(0);
  }
  if (customers.length > 1) {
    console.log(`\n!! ${customers.length} customers share this email in this store — showing all.`);
  }

  for (const c of customers) {
    console.log(`\n--- CUSTOMER: ${c.name ?? "(no name)"} <${c.email}>  id=${c.id}  joined ${c.createdAt.toISOString().slice(0, 10)} ---`);
    const account = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: restaurant.id, customerId: c.id } },
      select: { id: true, balance: true, lifetimeEarned: true, lifetimeRedeemed: true },
    });
    if (!account) {
      console.log("  No wallet yet (no balance, no activity).");
      continue;
    }
    console.log(`  BALANCE          : ${money(account.balance)}`);
    console.log(`  lifetime earned  : ${money(account.lifetimeEarned)}`);
    console.log(`  lifetime redeemed: ${money(account.lifetimeRedeemed)}`);

    const ledger = await prisma.rewardLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
      select: { amount: true, balanceAfter: true, reason: true, status: true, orderId: true, note: true, createdAt: true },
    });
    console.log(`\n  LEDGER (${ledger.length} rows, oldest first):`);
    if (!ledger.length) console.log("    (empty)");
    for (const row of ledger) {
      console.log(
        `    ${row.createdAt.toISOString().slice(0, 19).replace("T", " ")}  ` +
        `${money(row.amount).padStart(9)}  →bal ${money(row.balanceAfter).padStart(9)}  ` +
        `${row.reason.padEnd(13)}${(row.status ?? "").padEnd(10)}` +
        `${row.orderId ? `order=${row.orderId.slice(-8)}` : ""}${row.note ? `  "${row.note}"` : ""}`,
      );
    }

    // Sanity check: ledger sum should equal current balance (minus any expired/clamped)
    const sum = ledger.reduce((s, r) => s + r.amount, 0);
    const flag = Math.abs(Math.round((sum - account.balance) * 100)) > 1 ? "  <-- MISMATCH (investigate)" : "  ✓ matches balance";
    console.log(`\n  ledger sum = ${money(sum)}${flag}`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

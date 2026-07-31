/**
 * READ-ONLY: "can this person actually spend the gift I sent them?" (2026-07-31)
 *
 * Written for Luigi's Faisal case — a $40 gift that appeared not to work. Answers
 * the whole question in one command: does a Customer row exist, is it account-grade,
 * is there a wallet, did the gift ever leave `pending`, and was the email sent.
 *
 * Writes NOTHING. Every query is a read.
 *
 * Usage (against prod — Luigi runs this himself):
 *   npx tsx scripts/run-on-prod.ts scripts/_diagnose-gift-recipient.ts <store-slug> <recipient-email>
 * e.g.
 *   npx tsx scripts/run-on-prod.ts scripts/_diagnose-gift-recipient.ts luigis-lasagna-pizzeria faisalzia@live.ca
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

const [, , slug, emailArg] = process.argv;
if (!slug || !emailArg) {
  console.error("Usage: npx tsx scripts/run-on-prod.ts scripts/_diagnose-gift-recipient.ts <store-slug> <recipient-email>");
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
const when = (d: Date | null | undefined) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "—");

async function main() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, rewardsEnabled: true, rewardLabelPlural: true, rewardLabelSingular: true },
  });
  if (!restaurant) {
    console.error(`No restaurant with slug "${slug}".`);
    process.exit(1);
  }
  const label = restaurant.rewardLabelPlural?.trim() || restaurant.rewardLabelSingular?.trim() || "Reward Dollars";

  console.log(`\n=== ${restaurant.name} — can ${email} spend their ${label}? ===`);
  console.log(`Rewards enabled: ${restaurant.rewardsEnabled}\n`);

  // ── 1. Customer rows (case-insensitive: legacy rows exist in mixed case) ──
  const customers = await prisma.customer.findMany({
    where: { restaurantId: restaurant.id, email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true, signedUpAt: true, passwordHash: true, customerAccountId: true, totalOrders: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  console.log(`--- Customer rows at this restaurant: ${customers.length} ---`);
  for (const c of customers) {
    // Mirrors isAccountCustomer() in src/lib/reward-gifts.ts.
    const accountGrade = !!(c.signedUpAt || c.passwordHash || c.customerAccountId);
    console.log(`  ${c.id}  "${c.name}"  <${c.email}>`);
    console.log(`      created ${when(c.createdAt)} | orders ${c.totalOrders}`);
    console.log(`      signedUpAt ${when(c.signedUpAt)} | password ${c.passwordHash ? "SET" : "none"} | marketplace account ${c.customerAccountId ? "linked" : "none"}`);
    console.log(`      => account-grade (can hold a wallet): ${accountGrade ? "YES" : "NO"}`);
  }
  if (!customers.length) console.log("  (none — this address has never ordered or signed up here)");

  // ── 2. Wallets ────────────────────────────────────────────────────────────
  console.log(`\n--- Wallets ---`);
  let anyWallet = false;
  for (const c of customers) {
    const acct = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: restaurant.id, customerId: c.id } },
      select: { id: true, balance: true, lifetimeEarned: true, lifetimeRedeemed: true },
    });
    if (!acct) continue;
    anyWallet = true;
    console.log(`  customer ${c.id}: balance ${money(acct.balance)} (earned ${money(acct.lifetimeEarned)}, redeemed ${money(acct.lifetimeRedeemed)})`);
  }
  if (!anyWallet) console.log("  (no wallet exists for this address at this restaurant)");

  // ── 3. Gifts ──────────────────────────────────────────────────────────────
  const gifts = await prisma.pendingRewardGrant.findMany({
    where: { restaurantId: restaurant.id, email },
    select: { id: true, name: true, amount: true, note: true, status: true, createdAt: true, claimedAt: true, emailSentAt: true, customerId: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  console.log(`\n--- Gifts sent to this address: ${gifts.length} ---`);
  for (const g of gifts) {
    console.log(`  ${money(g.amount)}  [${g.status.toUpperCase()}]  sent ${when(g.createdAt)}`);
    console.log(`      email delivered: ${g.emailSentAt ? when(g.emailSentAt) : "NO — send failed or still in flight"}`);
    console.log(`      claimed: ${when(g.claimedAt)}${g.customerId ? ` -> customer ${g.customerId}` : ""}`);
    if (g.note) console.log(`      note: "${g.note}"`);
  }
  if (!gifts.length) console.log("  (none — check the address for typos, gifts are matched on the exact lowercased email)");

  // ── 4. Verdict ────────────────────────────────────────────────────────────
  const pending = gifts.filter((g) => g.status === "pending");
  const pendingTotal = pending.reduce((s, g) => s + g.amount, 0);
  const spendable = customers.some((c) => !!(c.signedUpAt || c.passwordHash || c.customerAccountId)) && anyWallet;
  const canSignIn = customers.some((c) => !!c.passwordHash);

  console.log(`\n=== VERDICT ===`);
  if (pending.length) {
    console.log(`  ${money(pendingTotal)} across ${pending.length} gift(s) is PENDING — it is not in any wallet.`);
    console.log(`  Nothing is spendable from a pending gift: there is no balance to apply yet.`);
  }
  if (spendable) console.log(`  A wallet with a balance exists.`);
  if (!canSignIn) {
    console.log(`  This address has NO per-restaurant password, so it cannot sign in to this store.`);
    console.log(`  Spending requires the signed-in session (both the cart preview and the charge`);
    console.log(`  gate the wallet on it), so typing this email at checkout will show nothing.`);
  } else {
    console.log(`  This address CAN sign in (password set) — signing in exposes the balance at checkout.`);
  }
  if (!gifts.length && !customers.length) {
    console.log(`  Nothing at all exists for this address here. Most likely the gift went to a`);
    console.log(`  different spelling of the email, or to a different store.`);
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

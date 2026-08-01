/**
 * READ-ONLY: list a restaurant's customer accounts (name, email, wallet) plus
 * VIP-group membership, to match Skool voucher names to real accounts before
 * the credit transfer. Writes NOTHING.
 *   npx tsx scripts/run-on-prod.ts scripts/_list-customers-for-matching.ts <slug>
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL is not set."); process.exit(1); }
const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
const prisma = new PrismaClient({
  adapter: isNeon ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
} as any);

const [, , slug] = process.argv;
if (!slug) { console.error("Usage: ... _list-customers-for-matching.ts <slug>"); process.exit(1); }

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) { console.error(`No restaurant "${slug}".`); process.exit(1); }

  const customers = await prisma.customer.findMany({
    where: { restaurantId: restaurant.id },
    select: {
      id: true, name: true, email: true, createdAt: true, signedUpAt: true,
      rewardAccounts: { select: { balance: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  const members = await prisma.customerGroupMember.findMany({
    where: { restaurantId: restaurant.id },
    select: { email: true, customerId: true, group: { select: { name: true } } },
  });
  const groupsByCustomer = new Map<string, string[]>();
  const groupsByEmail = new Map<string, string[]>();
  for (const m of members) {
    if (m.customerId) {
      groupsByCustomer.set(m.customerId, [...(groupsByCustomer.get(m.customerId) ?? []), m.group.name]);
    }
    if (m.email) {
      const k = m.email.toLowerCase();
      groupsByEmail.set(k, [...(groupsByEmail.get(k) ?? []), m.group.name]);
    }
  }

  console.log(`=== ${restaurant.name}: ${customers.length} customer accounts ===\n`);
  for (const c of customers) {
    const balance = c.rewardAccounts.reduce((s, a) => s + Number(a.balance ?? 0), 0);
    const groups = [
      ...(groupsByCustomer.get(c.id) ?? []),
      ...(c.email ? groupsByEmail.get(c.email.toLowerCase()) ?? [] : []),
    ];
    const hasAccount = !!c.signedUpAt;
    console.log(
      `  ${(c.name ?? "(no name)").padEnd(28)} ${(c.email ?? "").padEnd(38)} ` +
      `bucks=$${balance.toFixed(2)}  ${hasAccount ? "ACCOUNT" : "guest  "}  since ${c.createdAt.toISOString().slice(0, 10)}` +
      (groups.length ? `  [${[...new Set(groups)].join(", ")}]` : "")
    );
  }

  // Pending (unclaimed) gifts, so we don't double-gift anyone.
  const pending = await prisma.pendingRewardGrant.findMany({
    where: { restaurantId: restaurant.id, claimedAt: null },
    select: { email: true, amount: true, createdAt: true },
  });
  console.log(`\n=== Unclaimed pending gifts (${pending.length}) ===`);
  for (const p of pending) {
    console.log(`  ${p.email.padEnd(38)} $${Number(p.amount).toFixed(2)}  sent ${p.createdAt.toISOString().slice(0, 10)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

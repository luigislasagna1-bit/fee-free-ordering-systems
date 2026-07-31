/** Read-only: which members of Luigi's VIP group are GUESTS (no account) vs
 *  account holders — so we know exactly who needs the sign-up nudge. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}
const prodUrl = urls.find((u) => /dawn-tree/.test(u)) ?? urls[0];

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(prodUrl);
  const adapter = isNeon ? new PrismaNeon({ connectionString: prodUrl }) : new PrismaPg({ connectionString: prodUrl });
  const p = new PrismaClient({ adapter } as any);
  const r = await p.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true } });
  const g = await p.customerGroup.findFirst({
    where: { restaurantId: r!.id, name: { contains: "VIP Pizza Club" } },
    select: {
      id: true, name: true,
      members: { select: { id: true, name: true, email: true, customer: { select: { name: true, email: true, passwordHash: true } } } },
    },
  });
  if (!g) throw new Error("group not found");

  const rows = g.members.map((m) => ({
    email: (m.email ?? m.customer?.email ?? "").toLowerCase(),
    name: m.name ?? m.customer?.name ?? "",
    hasAccount: !!m.customer?.passwordHash,
  })).filter((x) => x.email);

  const guests = rows.filter((x) => !x.hasAccount);
  const accounts = rows.filter((x) => x.hasAccount);
  console.log(`group: ${g.name}  (${rows.length} with an email)\n`);
  console.log(`GUESTS — no account, need the sign-up nudge (${guests.length}):`);
  for (const x of guests) console.log(`   ${x.email}${x.name ? `  (${x.name})` : ""}`);
  console.log(`\nACCOUNT HOLDERS (${accounts.length}):`);
  for (const x of accounts) console.log(`   ${x.email}`);
  await p.$disconnect();
}
main();

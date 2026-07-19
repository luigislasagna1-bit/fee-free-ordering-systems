/**
 * READ-ONLY: list Luigi's customer groups + their per-group memberLabel, to see
 * whether clearing the restaurant-wide vipMemberLabel ("Bruce Trail Staff") is
 * behavior-preserving for group emails (they use group.memberLabel override).
 * Run: npx tsx scripts/_check-vip-group-labels.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL not found");

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const groups = await p.customerGroup.findMany({
    where: { restaurantId: "cmp7xhd3900000al2jz0db5vi" },
    select: { id: true, name: true, memberLabel: true, _count: { select: { members: true, promotions: true } } },
  });
  console.log(JSON.stringify(groups, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

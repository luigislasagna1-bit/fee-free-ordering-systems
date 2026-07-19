/**
 * READ-ONLY: has Luigi clicked "Give a VIP special" for Erik yet?
 * Lists targets attached to promo cmrrdvhzb0000ukvhnqyiljnf (masked emails).
 * Run: npx tsx scripts/_check-erick-attach.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL not found");

const PROMO_ID = "cmrrdvhzb0000ukvhnqyiljnf";
const ERIK_CUSTOMER_ID = "cmrp4cvwi000009jf9up6ctgb";
const mask = (e: string | null) => (e ? e.slice(0, 3) + "***@" + e.split("@")[1] : null);

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const targets = await p.customerGroupPromotion.findMany({
    where: { promotionId: PROMO_ID },
    select: { id: true, groupId: true, customerId: true, email: true, createdAt: true },
  });
  console.log(JSON.stringify(targets.map((t) => ({
    id: t.id, groupId: t.groupId,
    isErik: t.customerId === ERIK_CUSTOMER_ID,
    email: mask(t.email), createdAt: t.createdAt,
  })), null, 2));
  const promo = await p.promotion.findUnique({
    where: { id: PROMO_ID },
    select: { isActive: true, usedCount: true, usageLimit: true },
  });
  console.log("promo state:", JSON.stringify(promo));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

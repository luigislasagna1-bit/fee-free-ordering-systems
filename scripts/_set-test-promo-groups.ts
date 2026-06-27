/** DEV: temporarily give the "10% off" promo applies-to-items groups spanning 2 categories,
 *  to verify the Get-it-Now categorized eligible-items panel. Restore with --restore.
 *    set:     npx tsx scripts/_set-test-promo-groups.ts
 *    restore: npx tsx scripts/_set-test-promo-groups.ts --restore
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const ID = "cmpr83uss000600vhayg811xq"; // "10% off 30$ or more"
const RESTORE = process.argv.includes("--restore");

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const before: any = await prisma.promotion.findUnique({ where: { id: ID }, select: { name: true, rules: true, ruleConfig: true } });
  console.log(`${before?.name}`);
  console.log(`  rules:      ${JSON.stringify(before?.rules)}`);
  console.log(`  ruleConfig: ${JSON.stringify(before?.ruleConfig)}`);
  const rules = RESTORE
    ? { discountPercent: 10, groups: [] }
    : { discountPercent: 10, groups: [{ id: "g1", label: "", categoryIds: ["cmoofqlws000g9kvh9dyj20fz", "cmoofqlws000h9kvhkk13k0fy"], itemIds: [], role: "paid" }] };
  await prisma.promotion.update({ where: { id: ID }, data: { rules: JSON.stringify(rules), ruleConfig: rules as any } });
  console.log(RESTORE ? "RESTORED (empty groups)" : "SET test groups (2 categories — Pizzas + Pasta)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

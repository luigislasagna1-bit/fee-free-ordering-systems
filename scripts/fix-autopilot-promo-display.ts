/** One-off: set Autopilot WIN/2NDOFF promos to displayMode "hidden_coupon_only"
 *  (they're emailed codes, not menu cards) so the editor shows them correctly.
 *  Leaves Kickstarter first-buy (a menu hero) alone. Both Neon branches.
 *  npx tsx scripts/fix-autopilot-promo-display.ts */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

function urls(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

async function run(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const res = await prisma.promotion.updateMany({
      where: { campaignRef: { startsWith: "autopilot_" }, displayMode: { not: "hidden_coupon_only" } },
      data: { displayMode: "hidden_coupon_only" },
    });
    console.log(`  ✅ ${masked} — updated ${res.count} promo(s)`);
  } catch (e) {
    console.error(`  ❌ ${masked}`, e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => { for (const u of urls()) await run(u); })();

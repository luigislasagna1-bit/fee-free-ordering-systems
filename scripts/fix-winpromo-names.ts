/** One-off: align each Autopilot WIN/2NDOFF promo's NAME with its actual current
 *  discount % (Luigi 2026-06-10 — titles were stale after % edits). Both Neon
 *  branches. npx tsx scripts/fix-winpromo-names.ts */
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

function nameFor(campaignRef: string, pct: number): string {
  return campaignRef === "autopilot_2nd_order"
    ? `${pct}% OFF, yours for the taking`
    : `${pct}% off your next online order`;
}

async function run(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  let fixed = 0;
  try {
    const promos = await prisma.promotion.findMany({
      where: { campaignRef: { startsWith: "autopilot_" } },
      select: { id: true, campaignRef: true, name: true, ruleConfig: true },
    });
    for (const p of promos) {
      const rc = p.ruleConfig as { discountPercent?: unknown } | null;
      const pct = rc && typeof rc === "object" && typeof rc.discountPercent === "number" ? rc.discountPercent : 0;
      const name = nameFor(p.campaignRef ?? "", pct);
      if (name !== p.name) {
        await prisma.promotion.update({ where: { id: p.id }, data: { name } });
        fixed++;
      }
    }
    console.log(`  ✅ ${masked} — renamed ${fixed} promo(s)`);
  } catch (e) {
    console.error(`  ❌ ${masked}`, e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => { for (const u of urls()) await run(u); })();

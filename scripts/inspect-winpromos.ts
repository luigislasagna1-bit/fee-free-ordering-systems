/** Read-only: dump the Autopilot WIN/2NDOFF promos (name vs actual discount) on
 *  both Neon branches. npx tsx scripts/inspect-winpromos.ts */
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
    const promos = await prisma.promotion.findMany({
      where: { campaignRef: { startsWith: "autopilot_" } },
      select: { restaurantId: true, name: true, campaignRef: true, campaignSequence: true, ruleConfig: true, isActive: true, couponCode: true },
      orderBy: [{ restaurantId: "asc" }, { campaignSequence: "asc" }],
    });
    console.log(`\n=== ${masked} — ${promos.length} autopilot promo(s) ===`);
    for (const p of promos) {
      const rc = p.ruleConfig as { discountPercent?: unknown } | null;
      const pct = rc && typeof rc === "object" ? rc.discountPercent : undefined;
      console.log(`  ${p.couponCode}  seq=${p.campaignSequence}  active=${p.isActive}  discountPercent=${JSON.stringify(pct)}  name="${p.name}"`);
    }
    const steps = await prisma.autopilotStep.findMany({ select: { campaignType: true, stepNumber: true, discountPercent: true, isEnabled: true }, orderBy: [{ campaignType: "asc" }, { stepNumber: "asc" }] });
    console.log(`  --- AutopilotStep rows: ${steps.length} ---`);
    for (const s of steps) console.log(`  ${s.campaignType} step${s.stepNumber}  ${s.discountPercent}%  enabled=${s.isEnabled}`);
  } catch (e) {
    console.error(`  ❌ ${masked}`, e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => { for (const u of urls()) await run(u); })();

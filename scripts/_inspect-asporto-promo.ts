/** READ-ONLY: inspect Fabrizio's "20% ASPORTO" promotion config on every
 *  DATABASE_URL in .env.local — chasing the 20%-of-102€-shows-1.20€ report
 *  (cmqtmfp2n follow-up, 2026-07-02). Prints ruleConfig/rules so we can see
 *  oncePerOrder / groups targeting. No writes. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const content = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of content.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

(async () => {
  for (const url of urls) {
    const masked = url.replace(/:[^:@]+@/, ":***@").slice(0, 60);
    const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);
    try {
      const promos = await prisma.promotion.findMany({
        where: { name: { contains: "ASPORTO", mode: "insensitive" } },
        select: {
          id: true, name: true, promotionType: true, isActive: true,
          ruleConfig: true, rules: true, orderType: true, customerType: true,
          minimumOrder: true, stackingRule: true, autoApply: true, couponCode: true,
          restaurant: { select: { name: true, slug: true } },
        },
      });
      console.log(`\n=== ${masked} — ${promos.length} match(es)`);
      for (const p of promos) {
        console.log(JSON.stringify({ ...p, rules: (() => { try { return JSON.parse(p.rules ?? "null"); } catch { return p.rules; } })() }, null, 2));
      }
    } catch (e) {
      console.error(`  error on ${masked}:`, e instanceof Error ? e.message : e);
    } finally {
      await prisma.$disconnect();
    }
  }
})();

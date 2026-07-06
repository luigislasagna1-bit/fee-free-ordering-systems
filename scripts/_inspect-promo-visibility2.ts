/** READ-ONLY sweep #2 (2026-07-02): displayMode/showOnBanner on Luigi's active
 *  promos (why does only 1 tile show?) + find Fabrizio's "Super 20% sconto"
 *  across his stores. No writes. */
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
    const masked = url.replace(/:[^:@]+@/, ":***@").slice(0, 55);
    const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);
    try {
      console.log(`\n════════ ${masked}`);

      const luigi = await prisma.restaurant.findUnique({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true } });
      if (luigi) {
        const promos = await prisma.promotion.findMany({
          where: { restaurantId: luigi.id, isActive: true },
          select: { name: true, channel: true, displayMode: true, showOnBanner: true, highlightThreshold: true, autoApply: true, couponCode: true, groupLinks: { select: { id: true } } },
          orderBy: { createdAt: "desc" },
        });
        console.log(`\n— Luigi ACTIVE promos (${promos.length}):`);
        for (const p of promos) {
          console.log(JSON.stringify({ name: p.name, channel: p.channel, displayMode: p.displayMode, showOnBanner: p.showOnBanner, nudgeAt: p.highlightThreshold, autoApply: p.autoApply, code: p.couponCode, vipLinks: p.groupLinks.length }));
        }
      }

      // Fabrizio's stores: anything named super/sconto, or created in the last 3 days.
      const fabStores = await prisma.restaurant.findMany({
        where: { OR: [{ slug: { contains: "test" } }, { slug: { contains: "kaori" } }, { name: { contains: "kaori", mode: "insensitive" } }] },
        select: { id: true, slug: true, name: true },
      });
      for (const r of fabStores) {
        const promos = await prisma.promotion.findMany({
          where: {
            restaurantId: r.id,
            OR: [
              { name: { contains: "super", mode: "insensitive" } },
              { name: { contains: "20", mode: "insensitive" } },
              { createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) } },
            ],
          },
          select: { id: true, name: true, isActive: true, promotionType: true, displayMode: true, showOnBanner: true, autoApply: true, couponCode: true, ruleConfig: true, orderType: true, usableHourStart: true, usableHourEnd: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        if (promos.length) {
          console.log(`\n— ${r.name} (${r.slug}): ${promos.length} match(es)`);
          for (const p of promos) console.log(JSON.stringify(p));
        }
      }
    } catch (e) {
      console.error(`  error:`, e instanceof Error ? e.message : e);
    } finally {
      await prisma.$disconnect();
    }
  }
})();

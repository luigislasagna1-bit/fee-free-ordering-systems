/** READ-ONLY: one sweep for tonight's three symptoms (2026-07-02).
 *  1. Fabrizio's "Super 20% sconto" (cmqv33v2o) — expect oncePerOrder again?
 *  2. Luigi's luigis-lasagna-pizzeria — 10+ promos enabled but ONE tile shows:
 *     dump every promo's display-relevant fields to see what gates them.
 *  Runs against the PROD DATABASE_URL(s) in .env.local. No writes. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const content = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of content.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

const brief = (p: any) => ({
  name: p.name,
  type: p.promotionType,
  isActive: p.isActive,
  autoApply: p.autoApply,
  couponCode: p.couponCode,
  channel: p.channel,
  scope: p.scope,
  orderType: p.orderType,
  daysOfWeek: p.daysOfWeek,
  usableHourStart: p.usableHourStart,
  usableHourEnd: p.usableHourEnd,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  usageLimit: p.usageLimit,
  usedCount: p.usedCount,
  onceLifetime: p.onceLifetimePerClient,
  oncePerOrder: (() => { try { const r = p.ruleConfig ?? JSON.parse(p.rules ?? "null"); return r?.oncePerOrder ?? false; } catch { return "?"; } })(),
  groupLinksCount: p.groupLinks?.length ?? 0,
});

(async () => {
  for (const url of urls) {
    const masked = url.replace(/:[^:@]+@/, ":***@").slice(0, 55);
    const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);
    try {
      console.log(`\n════════ ${masked}`);

      const sconto = await prisma.promotion.findMany({
        where: { name: { contains: "sconto", mode: "insensitive" } },
        include: { groupLinks: { select: { id: true } }, restaurant: { select: { slug: true } } },
      });
      console.log(`\n— "sconto" promos: ${sconto.length}`);
      for (const p of sconto) {
        console.log(JSON.stringify({ restaurant: (p as any).restaurant?.slug, ...brief(p), ruleConfig: (p as any).ruleConfig }, null, 2));
      }

      const luigi = await prisma.restaurant.findUnique({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true } });
      if (luigi) {
        const promos = await prisma.promotion.findMany({
          where: { restaurantId: luigi.id },
          include: { groupLinks: { select: { id: true } } },
          orderBy: { createdAt: "desc" },
        });
        console.log(`\n— ${luigi.name}: ${promos.length} promotion(s) total`);
        for (const p of promos) console.log(JSON.stringify(brief(p)));
      }
    } catch (e) {
      console.error(`  error:`, e instanceof Error ? e.message : e);
    } finally {
      await prisma.$disconnect();
    }
  }
})();

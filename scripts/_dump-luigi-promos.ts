/** Read-only: Luigi's live promotions + how each is scoped/stacked/audienced,
 *  so we can tell him exactly what to change for the VIP pricing setup. */
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

async function main() {
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const r = await p.restaurant.findFirst({
        where: { slug: "luigis-lasagna-pizzeria" },
        select: { id: true, name: true },
      });
      if (!r) continue;

      const cats = await p.menuCategory.findMany({
        where: { restaurantId: r.id },
        select: { id: true, name: true, promoExcluded: true },
      });
      const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? id.slice(0, 8);

      const promos = await p.promotion.findMany({
        where: { restaurantId: r.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, promotionType: true, stackingRule: true, isActive: true,
          displayMode: true, customerType: true, ruleConfig: true, minimumOrder: true,
          groupLinks: { select: { group: { select: { name: true } } } },
        },
      });

      const host = url.match(/@([^.]+)/)?.[1] ?? "?";
      const isProd = /dawn-tree/.test(url);
      console.log(`\n===== DB ${host} ${isProd ? "(PROD)" : "(dev)"} — ${r.name} — ${promos.filter(x => x.isActive).length} ACTIVE of ${promos.length}\n`);
      for (const pr of promos) {
        if (!pr.isActive) continue;
        const rules: any = typeof pr.ruleConfig === "string" ? JSON.parse(pr.ruleConfig || "{}") : (pr.ruleConfig ?? {});
        const groups = Array.isArray(rules.groups) ? rules.groups : [];
        const scope = groups.length === 0
          ? "WHOLE CART"
          : groups.map((g: any) =>
              `[${(g.categoryIds ?? []).map(catName).join(", ") || "-"}${(g.itemIds ?? []).length ? ` +${g.itemIds.length} item(s)` : ""}]`,
            ).join(" ");
        const vip = pr.groupLinks.map((l) => l.group?.name).filter(Boolean).join(", ") || "(not a group special)";
        console.log(`${pr.isActive ? "ACTIVE " : "off    "} "${pr.name}"`);
        console.log(`    type=${pr.promotionType}  stacking=${pr.stackingRule}  display=${pr.displayMode}  customerType=${pr.customerType}`);
        console.log(`    pct=${rules.discountPercent ?? "-"}  minOrder=${pr.minimumOrder}  appliesTo=${scope}`);
        console.log(`    VIP group link: ${vip}`);
      }

      const excluded = cats.filter((c) => c.promoExcluded).map((c) => c.name);
      console.log(`\ncategories flagged promoExcluded (blocked from ALL promos): ${excluded.join(", ") || "(none)"}`);
      const items = await p.menuItem.findMany({
        where: { category: { restaurantId: r.id }, promoExcluded: true },
        select: { name: true },
        take: 20,
      });
      console.log(`items flagged promoExcluded: ${items.map((i) => i.name).join(", ") || "(none)"}`);
    } finally { await p.$disconnect(); }
  }
}
main();

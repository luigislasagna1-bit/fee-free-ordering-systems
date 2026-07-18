/**
 * ADVERSARIAL RE-VERIFICATION (read-only, zero writes): independently re-check
 * the prod DB facts behind the FIRSTBUY root-cause claim.
 * Reads the prod connection string from the commented line in .env.local
 * (never printed). Run: npx tsx scripts/_adv-verify-firstbuy-prod.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const envText = readFileSync(".env.local", "utf8");
const m = envText.match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL line not found in .env.local");
const url = m[1];
console.log("DB host:", url.match(/@([^/]+)\//)?.[1]);

const mask = (e?: string | null) =>
  !e ? "-" : e.includes("@") ? e.slice(0, 3) + "***@" + e.split("@")[1] : "***" + e.slice(-4);

async function main() {
  const adapter = new PrismaNeon({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);

  const imp = await p.prospectImport.findFirst({
    where: { filename: { contains: "Luigi", mode: "insensitive" } },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true, filename: true, totalRows: true, successRows: true, emailsSent: true,
      uploadedAt: true, restaurantId: true,
      restaurant: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!imp) throw new Error("No Luigi prospect import on this branch");
  console.log("IMPORT:", imp.filename, "rows=" + imp.totalRows, "ok=" + imp.successRows,
    "sent=" + imp.emailsSent, "uploaded=" + imp.uploadedAt.toISOString());
  const rid = imp.restaurantId;
  console.log("RESTAURANT:", imp.restaurant.name, imp.restaurant.slug, rid);

  const ks = await p.kickstarterState.findUnique({ where: { restaurantId: rid } });
  console.log("KICKSTARTER STATE:", ks && {
    firstBuyPromoEnabled: ks.firstBuyPromoEnabled,
    inviteProspectsEnabled: ks.inviteProspectsEnabled,
    updatedAt: ks.updatedAt.toISOString(),
  });

  const promos = await p.promotion.findMany({
    where: { restaurantId: rid, campaignRef: "kickstarter_first_buy" },
    include: { _count: { select: { groupLinks: true } } },
  });
  console.log("FIRSTBUY ROWS:", promos.length);
  for (const pr of promos as any[]) {
    console.log({
      id: pr.id, isActive: pr.isActive, type: pr.promotionType, ruleConfig: pr.ruleConfig,
      autoApply: pr.autoApply, couponCode: pr.couponCode, customerType: pr.customerType,
      channel: pr.channel, orderType: pr.orderType, stackingRule: pr.stackingRule,
      minimumOrder: pr.minimumOrder, usageLimit: pr.usageLimit, usedCount: pr.usedCount,
      onceLifetime: pr.onceLifetimePerClient, startsAt: pr.startsAt, endsAt: pr.endsAt,
      daysOfWeek: pr.daysOfWeek, hourStart: pr.usableHourStart, hourEnd: pr.usableHourEnd,
      scope: pr.scope, groupLinks: pr._count.groupLinks,
      createdAt: pr.createdAt.toISOString(), updatedAt: pr.updatedAt.toISOString(),
    });
    console.log("  usage rows:", await p.promotionUsage.count({ where: { promotionId: pr.id } }));
  }

  const pool = await p.promotion.findMany({
    where: { restaurantId: rid, isActive: true },
    select: { id: true, name: true, promotionType: true, customerType: true, channel: true, campaignRef: true },
  });
  console.log("ACTIVE POOL (" + pool.length + "):", pool.map(x => x.name + "|" + x.promotionType + "|" + x.customerType + "|ch=" + x.channel).join("  ;  "));

  // The two orders named in the claim
  for (const oid of ["cmrfja03d", "cmrp4cvzz"]) {
    const o = await p.order.findFirst({
      where: { id: { startsWith: oid } },
      select: {
        id: true, restaurantId: true, createdAt: true, status: true, paymentStatus: true,
        type: true, viaMarketplace: true, total: true, promoDiscount: true, couponDiscount: true,
        appliedPromos: true, customerEmail: true, customerPhone: true, customerId: true,
      },
    });
    if (!o) { console.log("ORDER " + oid + ": NOT FOUND"); continue; }
    console.log("ORDER", o.id, o.createdAt.toISOString(), o.status + "/" + o.paymentStatus, o.type,
      "mkt=" + o.viaMarketplace, "total=" + o.total, "promoDisc=" + o.promoDiscount,
      "couponDisc=" + o.couponDiscount, mask(o.customerEmail), mask(o.customerPhone));
    console.log("  appliedPromos:", o.appliedPromos ? String(o.appliedPromos).slice(0, 200) : null);
    const idClauses: any[] = [];
    if (o.customerId) idClauses.push({ customerId: o.customerId });
    if (o.customerEmail) idClauses.push({ customerEmail: { equals: o.customerEmail, mode: "insensitive" } });
    if (o.customerPhone) idClauses.push({ customerPhone: o.customerPhone });
    const priors = idClauses.length ? await p.order.count({
      where: {
        restaurantId: o.restaurantId,
        status: { notIn: ["cancelled", "rejected"] },
        viaMarketplace: o.viaMarketplace,
        createdAt: { lt: o.createdAt },
        OR: idClauses,
      },
    }) : -1;
    console.log("  prior counting orders at charge time:", priors);
    if (o.customerEmail) {
      const prospect = await p.prospect.findFirst({
        where: { importId: imp.id, email: { equals: o.customerEmail, mode: "insensitive" } },
        select: { emailSentAt: true },
      });
      console.log("  prospect row:", prospect ? "yes, emailSentAt=" + (prospect.emailSentAt?.toISOString() ?? "null") : "no");
    }
  }

  // Orders in the campaign window with any promo discount
  const first = await p.prospect.findFirst({
    where: { importId: imp.id, emailSentAt: { not: null } },
    orderBy: { emailSentAt: "asc" }, select: { emailSentAt: true },
  });
  console.log("FIRST EMAIL SENT:", first?.emailSentAt?.toISOString());
  const since = first?.emailSentAt ?? new Date(Date.now() - 14 * 864e5);
  const counts = await p.order.groupBy({
    by: ["status"],
    where: { restaurantId: rid, createdAt: { gte: since } },
    _count: { _all: true },
  });
  console.log("ORDERS SINCE CAMPAIGN START by status:", JSON.stringify(counts));
  const discounted = await p.order.count({
    where: { restaurantId: rid, createdAt: { gte: since }, promoDiscount: { gt: 0 } },
  });
  console.log("orders since start with promoDiscount>0:", discounted);

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

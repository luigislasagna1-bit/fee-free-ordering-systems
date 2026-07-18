/**
 * READ-ONLY prod forensics: why didn't Kickstarter FIRSTBUY (10% first order)
 * apply on real customers' orders at Luigi's Lasagna & Pizzeria?
 * Zero writes. Run: DATABASE_URL=<prod> npx tsx scripts/_forensics-firstbuy-prod.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const mask = (e?: string | null) =>
  !e ? "—" : e.includes("@")
    ? e.slice(0, 3) + "***@" + e.split("@")[1]
    : "***" + e.slice(-4);

async function main() {
  const url = process.env.DATABASE_URL!;
  console.log("DB host:", url.match(/@([^/]+)\//)?.[1]);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);

  // 0. Anchor on the known CSV import → its restaurant is the live store
  const anchorImports = await p.prospectImport.findMany({
    where: { filename: { contains: "Luigi", mode: "insensitive" } },
    select: { id: true, filename: true, totalRows: true, successRows: true, emailsSent: true, uploadedAt: true, restaurantId: true, restaurant: { select: { id: true, slug: true, name: true, currency: true } } },
    orderBy: { uploadedAt: "desc" },
  });
  console.log(`=== IMPORTS MATCHING 'Luigi' (${anchorImports.length}):`);
  for (const im of anchorImports) console.log(`   ${im.filename} rows=${im.totalRows} ok=${im.successRows} sent=${im.emailsSent} uploaded=${im.uploadedAt.toISOString()} restaurant=${im.restaurant.name} (${im.restaurant.slug})`);
  if (!anchorImports.length) throw new Error("No Luigi prospect import found on this branch");
  const r = anchorImports[0].restaurant;
  console.log(`\n=== RESTAURANT ${r.name} (${r.slug}) id=${r.id} currency=${r.currency}`);

  // 2. Kickstarter toggles
  const ks = await p.kickstarterState.findUnique({ where: { restaurantId: r.id } });
  console.log("\n=== KICKSTARTER STATE:", ks ? { firstBuyPromoEnabled: ks.firstBuyPromoEnabled, inviteProspectsEnabled: ks.inviteProspectsEnabled, updatedAt: ks.updatedAt.toISOString() } : "NO ROW");

  // 3. The FIRSTBUY promotion row(s)
  const promos = await p.promotion.findMany({
    where: { restaurantId: r.id, campaignRef: "kickstarter_first_buy" },
    include: { _count: { select: { groupLinks: true } } },
  });
  console.log(`\n=== kickstarter_first_buy PROMO ROWS: ${promos.length}`);
  for (const pr of promos as any[]) {
    console.log({
      id: pr.id, name: pr.name, isActive: pr.isActive, promotionType: pr.promotionType,
      ruleConfig: pr.ruleConfig, autoApply: pr.autoApply, couponCode: pr.couponCode,
      customerType: pr.customerType, channel: pr.channel, orderType: pr.orderType,
      stackingRule: pr.stackingRule, minimumOrder: pr.minimumOrder,
      startsAt: pr.startsAt, endsAt: pr.endsAt, daysOfWeek: pr.daysOfWeek,
      usableHourStart: pr.usableHourStart, usableHourEnd: pr.usableHourEnd,
      usageLimit: pr.usageLimit, usedCount: pr.usedCount, onceLifetimePerClient: pr.onceLifetimePerClient,
      scope: pr.scope, displayMode: pr.displayMode, customerGroupId: pr.customerGroupId,
      groupLinks: pr._count.groupLinks,
      createdAt: pr.createdAt.toISOString(), updatedAt: pr.updatedAt.toISOString(),
    });
    const usages = await p.promotionUsage.count({ where: { promotionId: pr.id } });
    console.log("   PromotionUsage rows:", usages);
  }

  // 3b. Whole active pool for the store (what the engine sees)
  const pool = await p.promotion.findMany({
    where: { restaurantId: r.id, isActive: true },
    select: { id: true, name: true, promotionType: true, stackingRule: true, autoApply: true, couponCode: true, customerType: true, channel: true, campaignRef: true },
  });
  console.log(`\n=== ACTIVE PROMO POOL (${pool.length}):`);
  for (const pr of pool) console.log(`   ${pr.name} | ${pr.promotionType} | stack=${pr.stackingRule} | auto=${pr.autoApply} | code=${pr.couponCode ?? "—"} | cust=${pr.customerType} | ch=${pr.channel} | ref=${pr.campaignRef ?? "—"}`);

  // 4. All prospect imports for this restaurant + campaign start
  const imports = await p.prospectImport.findMany({
    where: { restaurantId: r.id },
    select: { id: true, filename: true, totalRows: true, successRows: true, emailsSent: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  });
  console.log(`\n=== PROSPECT IMPORTS (${imports.length}):`);
  for (const im of imports) console.log(`   ${im.filename} rows=${im.totalRows} ok=${im.successRows} sent=${im.emailsSent} uploaded=${im.uploadedAt.toISOString()}`);
  const importIds = imports.map(i => i.id);

  const firstSent = await p.prospect.findFirst({
    where: { importId: { in: importIds }, emailSentAt: { not: null } },
    orderBy: { emailSentAt: "asc" }, select: { emailSentAt: true },
  });
  const sentCount = await p.prospect.count({ where: { importId: { in: importIds }, emailSentAt: { not: null } } });
  const campaignStart = firstSent?.emailSentAt ?? new Date(Date.now() - 14 * 864e5);
  console.log(`   emails sent so far=${sentCount}, first sent=${firstSent?.emailSentAt?.toISOString() ?? "NONE"}`);

  // 5. Orders since campaign start
  const orders = await p.order.findMany({
    where: { restaurantId: r.id, createdAt: { gte: campaignStart } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, status: true, paymentStatus: true, type: true,
      viaMarketplace: true, subtotal: true, total: true, promoDiscount: true,
      couponDiscount: true, appliedPromos: true, customerEmail: true, customerPhone: true,
      customerId: true, notifiedAt: true, rejectionReason: true,
    },
    take: 300,
  });
  console.log(`\n=== ORDERS SINCE CAMPAIGN START (${orders.length}):`);
  for (const o of orders) {
    // Was this buyer an invited prospect?
    const wasProspect = o.customerEmail
      ? await p.prospect.findFirst({ where: { importId: { in: importIds }, email: { equals: o.customerEmail, mode: "insensitive" } }, select: { emailSentAt: true } })
      : null;
    // Prior orders that the isNewCustomer count would have seen at charge time
    const idClauses: any[] = [];
    if (o.customerId) idClauses.push({ customerId: o.customerId });
    if (o.customerEmail) idClauses.push({ customerEmail: { equals: o.customerEmail, mode: "insensitive" } });
    if (o.customerPhone) idClauses.push({ customerPhone: o.customerPhone });
    const priors = idClauses.length
      ? await p.order.findMany({
          where: {
            restaurantId: r.id,
            status: { notIn: ["cancelled", "rejected"] },
            viaMarketplace: o.viaMarketplace,
            createdAt: { lt: o.createdAt },
            OR: idClauses,
          },
          select: { id: true, createdAt: true, status: true, paymentStatus: true, total: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        })
      : [];
    const promoJson = o.appliedPromos ? o.appliedPromos.slice(0, 220) : null;
    console.log(
      `\n${o.createdAt.toISOString()} ${o.id} ${o.status}/${o.paymentStatus} ${o.type}${o.viaMarketplace ? " MKT" : ""} ` +
      `total=${o.total} promoDisc=${o.promoDiscount} couponDisc=${o.couponDiscount} ` +
      `${mask(o.customerEmail)} ${mask(o.customerPhone)} cust=${o.customerId ?? "—"}` +
      `${wasProspect ? ` [PROSPECT sent=${wasProspect.emailSentAt?.toISOString() ?? "not-yet"}]` : ""}`
    );
    if (promoJson) console.log(`   appliedPromos: ${promoJson}`);
    if (priors.length) {
      console.log(`   PRIOR counting orders at charge time: ${priors.length}${priors.length === 6 ? "+" : ""}`);
      for (const pr of priors) console.log(`      ${pr.createdAt.toISOString()} ${pr.id} ${pr.status}/${pr.paymentStatus} total=${pr.total}`);
    } else {
      console.log(`   PRIOR counting orders: 0 → engine saw NEW`);
    }
  }

  // 6. Prospect emails that match ANY pre-campaign order (list overlap with existing customers)
  if (importIds.length) {
    const overlap = await p.$queryRawUnsafe<any[]>(
      `SELECT COUNT(DISTINCT LOWER(pr.email)) AS n
         FROM "Prospect" pr
         JOIN "Order" o ON LOWER(o."customerEmail") = LOWER(pr.email)
        WHERE pr."importId" = ANY($1)
          AND o."restaurantId" = $2
          AND o.status NOT IN ('cancelled','rejected')`,
      importIds, r.id
    );
    console.log(`\n=== PROSPECT↔EXISTING-ORDER EMAIL OVERLAP: ${overlap[0]?.n ?? 0}`);
  }

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

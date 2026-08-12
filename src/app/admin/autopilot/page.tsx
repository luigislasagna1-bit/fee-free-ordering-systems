import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isEmailEnabled } from "@/lib/email";
import { featureGate } from "@/lib/feature-gate";
import { getStepPromos } from "@/lib/autopilot-promos";
import { AutopilotClient } from "./AutopilotClient";

export default async function AutopilotPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  // Automated campaigns are part of the Advanced Promo Marketing add-on; free
  // accounts see the locked upsell. Luigi 2026-06-11.
  if (restaurantId) {
    const gate = await featureGate(restaurantId, "automated_campaigns", "advanced_promos");
    if (gate) return gate;
  }

  const [campaigns, couponPromos, restaurant] = await Promise.all([
    prisma.autopilotCampaign.findMany({ where: { restaurantId } }),
    // The "Attach a Coupon" picker lists the restaurant's WORKING coupon-code
    // promotions (CARTBACK / WIN1-5 / 2NDOFF / first-buy / any custom), not the
    // empty Coupon table. "Add your own" = create a coupon-code promo under
    // Promotions & Coupons and it appears here. Luigi 2026-06-10.
    prisma.promotion.findMany({
      where: { restaurantId, couponCode: { not: null }, isActive: true },
      select: { id: true, couponCode: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    restaurantId
      ? prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } })
      : Promise.resolve(null),
  ]);
  const coupons = couponPromos.map((p) => ({ id: p.id, code: p.couponCode ?? "", description: p.name }));

  // ── Per-campaign results (Luigi 2026-06-09, E) ──────────────────────────────
  // Sent  = messages sent (AutopilotSend rows).
  // Sales = fulfilled order revenue in the last 30 days from CONTACTED customers
  //         (anyone this campaign emailed). A scalable EXISTS subquery against
  //         the (campaignId, customerEmail) unique index — no giant IN list.
  // Fees  = always 0: Fee Free never bills the restaurant per message (the whole
  //         point), so the card shows a proud $0.00.
  const resultsByType: Record<string, { sent: number; sales: number }> = {};
  if (restaurantId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const c of campaigns) {
      const sent = await prisma.autopilotSend.count({ where: { campaignId: c.id } });
      let sales = 0;
      if (sent > 0) {
        const rows = await prisma.$queryRaw<{ sales: number }[]>`
          SELECT COALESCE(SUM(o."total"), 0)::float8 AS sales
          FROM "Order" o
          WHERE o."restaurantId" = ${restaurantId}
            AND o."status" NOT IN ('cancelled', 'rejected')
            AND o."createdAt" >= ${thirtyDaysAgo}
            AND EXISTS (
              SELECT 1 FROM "AutopilotSend" s
              WHERE s."campaignId" = ${c.id} AND s."customerEmail" = o."customerEmail"
            )
        `;
        sales = Number(rows[0]?.sales ?? 0);
      }
      resultsByType[c.campaignType] = { sent, sales };
    }
  }

  // Reflect the ACTUAL send capability (Resend — platform key or per-restaurant
  // key), not the legacy EMAIL_SERVER/EMAIL_FROM SMTP vars the send path never
  // reads. Old check falsely warned "email not configured" on every Autopilot
  // campaign even though order emails were sending fine via Resend. Luigi 2026-06-10.
  const emailConfigured = await isEmailEnabled();

  // ── "Your code isn't live" health check (Luigi 2026-08-11, Ben's WIN1) ──────
  // A campaign can read ON while the coupon it advertises is switched off or
  // expired — that state ran for five weeks here and nothing on this page said
  // so. getStepPromos() now refuses to email a dead code, so the drip degrades
  // to a couponless "Order now"; this tells the owner it's happening. Per
  // campaign TYPE, true when the campaign owns codes but none are redeemable.
  const codeHealth: Record<string, boolean> = {};
  if (restaurantId) {
    for (const type of ["reengagement", "second_order"] as const) {
      const live = await getStepPromos(restaurantId, type);
      codeHealth[type] = live.size > 0;
    }
    const cartCode = await prisma.promotion.count({
      where: {
        restaurantId,
        campaignRef: "autopilot_cart_recovery",
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        ],
      },
    });
    codeHealth.cart_abandonment = cartCode > 0;
  }

  // ── Which groups the owner has marked "members already get club pricing" ────
  // Without this the client falls back to its `{ names: [], memberCount: 0 }`
  // default, which makes `hasClubs` false — and that hides the per-campaign
  // club-policy control ENTIRELY while the audience card cheerfully tells the
  // owner to "tick Members already get club pricing" on a group they have
  // already ticked. Meanwhile the backend honours the setting, so members were
  // silently switched to code-less emails with no way to see or change it.
  // Caught in adversarial review, 2026-08-12.
  let clubs: { names: string[]; memberCount: number } = { names: [], memberCount: 0 };
  if (restaurantId) {
    const clubGroups = await prisma.customerGroup.findMany({
      where: { restaurantId, skipAutopilotOffers: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (clubGroups.length > 0) {
      // A row count, not a distinct-people count: someone in two ticked clubs
      // (or added both by email and from the customer list) counts twice. It
      // drives one summary sentence, and an aggregate is the only shape that
      // stays cheap on a 50,000-member club.
      const memberCount = await prisma.customerGroupMember.count({
        where: { restaurantId, groupId: { in: clubGroups.map((g) => g.id) } },
      });
      clubs = { names: clubGroups.map((g) => g.name), memberCount };
    }
  }

  return (
    <AutopilotClient
      campaigns={campaigns as any}
      coupons={coupons}
      emailConfigured={emailConfigured}
      results={resultsByType}
      codeHealth={codeHealth}
      currency={restaurant?.currency ?? "usd"}
      clubs={clubs}
    />
  );
}

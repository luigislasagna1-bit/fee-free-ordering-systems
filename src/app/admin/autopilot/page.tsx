import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { AutopilotClient } from "./AutopilotClient";

export default async function AutopilotPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [campaigns, coupons, restaurant] = await Promise.all([
    prisma.autopilotCampaign.findMany({ where: { restaurantId } }),
    prisma.coupon.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, code: true, description: true },
      orderBy: { code: "asc" },
    }),
    restaurantId
      ? prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } })
      : Promise.resolve(null),
  ]);

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

  const emailConfigured = !!(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);

  return (
    <AutopilotClient
      campaigns={campaigns as any}
      coupons={coupons}
      emailConfigured={emailConfigured}
      results={resultsByType}
      currency={restaurant?.currency ?? "usd"}
    />
  );
}

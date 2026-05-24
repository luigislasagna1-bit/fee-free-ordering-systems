/**
 * Autopilot marketing campaign runner.
 *
 * For each restaurant with enabled AutopilotCampaign rows, evaluates
 * candidate customers + sends the right email. Idempotent via the
 * AutopilotSend table — once a campaign has been sent to a given email,
 * it never fires again for that email + that campaign.
 *
 * Campaigns supported at v1:
 *
 *   second_order
 *     Target: customer placed exactly 1 order more than `delayHours`
 *     ago. Nudges them back for order #2 (high LTV uplift moment).
 *
 *   reengagement
 *     Target: customer ordered 2+ times historically but hasn't
 *     ordered in `delayHours` (typically 30-90 days). "We miss you"
 *     reminder.
 *
 * Cart abandonment is a separate feature (would need cart-tracking
 * infrastructure we don't have yet). Marked Coming Soon in the
 * /admin/autopilot UI.
 *
 * Triggered by /api/cron/autopilot (hourly Vercel cron). Safe to run
 * frequently — AutopilotSend de-dup means each customer gets each
 * campaign at most once.
 */

import prisma from "@/lib/db";
import { sendAutopilotEmail, setEmailImprint } from "@/lib/email";

export type AutopilotRunSummary = {
  restaurantId: string;
  restaurantName: string;
  results: {
    campaignType: string;
    eligible: number;
    sent: number;
    errors: number;
  }[];
};

/**
 * Run all enabled autopilot campaigns for a single restaurant. Returns
 * a summary suitable for piping to the cron audit log.
 */
export async function runAutopilotForRestaurant(restaurantId: string): Promise<AutopilotRunSummary> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true, name: true, slug: true, email: true, phone: true,
      resellerProfile: { select: { status: true, companyName: true } },
    },
  });
  if (!restaurant) {
    return { restaurantId, restaurantName: "(unknown)", results: [] };
  }

  const campaigns = await prisma.autopilotCampaign.findMany({
    where: { restaurantId, isEnabled: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const restaurantOrderUrl = `${baseUrl}/order/${restaurant.slug}`;
  const unsubscribeUrl = `${baseUrl}/order/${restaurant.slug}?unsubscribe=1`;
  const imprint =
    restaurant.resellerProfile?.status === "approved" && restaurant.resellerProfile.companyName
      ? restaurant.resellerProfile.companyName
      : null;

  const summary: AutopilotRunSummary = {
    restaurantId,
    restaurantName: restaurant.name,
    results: [],
  };

  for (const campaign of campaigns) {
    if (!campaign.subject || !campaign.emailBody) {
      // No content saved yet — owner enabled the campaign but didn't
      // fill in subject/body. Skip silently.
      summary.results.push({ campaignType: campaign.campaignType, eligible: 0, sent: 0, errors: 0 });
      continue;
    }

    // Resolve the optional coupon for this campaign. Schema uses
    // discountType ("percentage" | "fixed") + discountValue (numeric).
    const coupon = campaign.couponId
      ? await prisma.coupon.findUnique({
          where: { id: campaign.couponId },
          select: { code: true, description: true, discountType: true, discountValue: true },
        })
      : null;
    const couponLabel = coupon
      ? coupon.description ||
        (coupon.discountType === "percentage"
          ? `${coupon.discountValue}% off your next order`
          : `$${coupon.discountValue.toFixed(2)} off your next order`)
      : null;
    const ctaUrl = coupon
      ? `${restaurantOrderUrl}?coupon=${encodeURIComponent(coupon.code)}`
      : restaurantOrderUrl;

    // Build candidate set based on campaign type.
    const candidates = await pickCandidates(restaurantId, campaign.campaignType, campaign.delayHours);
    let sent = 0;
    let errors = 0;

    // For each candidate, check the de-dup table first. We do this in
    // a single query (where { in: emails }) rather than per-candidate
    // round-trips for efficiency.
    const candidateEmails = candidates
      .map((c) => c.email)
      .filter((e): e is string => !!e);
    const existingSends = candidateEmails.length > 0
      ? await prisma.autopilotSend.findMany({
          where: {
            campaignId: campaign.id,
            customerEmail: { in: candidateEmails },
          },
          select: { customerEmail: true },
        })
      : [];
    const alreadySent = new Set(existingSends.map((s) => s.customerEmail));

    for (const customer of candidates) {
      if (!customer.email) continue;
      if (alreadySent.has(customer.email)) continue;

      // Per-restaurant whitelabel imprint applies to every email this
      // restaurant sends — wrap in try/finally so a partial failure
      // doesn't leak imprint state into the next restaurant's send.
      setEmailImprint(imprint);
      try {
        const res = await sendAutopilotEmail({
          to: customer.email,
          customerName: customer.name || "there",
          restaurantName: restaurant.name,
          subject: campaign.subject,
          body: campaign.emailBody,
          couponCode: coupon?.code,
          couponLabel,
          ctaUrl,
          ctaLabel: coupon ? "Order with coupon" : "Order now",
          restaurantUrl: baseUrl ? `${baseUrl}/order/${restaurant.slug}` : undefined,
          restaurantEmail: restaurant.email ?? undefined,
          restaurantPhone: restaurant.phone ?? undefined,
          unsubscribeUrl,
        });

        if (res.success) {
          // Record the send. Unique-on-(campaign, email) means concurrent
          // cron instances can both try to create — we swallow the
          // P2002 unique-constraint error since the "row exists" outcome
          // is the desired terminal state.
          try {
            await prisma.autopilotSend.create({
              data: {
                campaignId: campaign.id,
                customerEmail: customer.email,
                customerId: customer.id,
              },
            });
            sent++;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("Unique constraint")) {
              console.error("[autopilot] AutopilotSend.create failed", e);
              errors++;
            }
            // Else: double-send race — already recorded, count as sent.
          }
        } else {
          console.error("[autopilot] send failed", { campaignId: campaign.id, email: customer.email, error: res.error });
          errors++;
        }
      } finally {
        setEmailImprint(null);
      }
    }

    summary.results.push({
      campaignType: campaign.campaignType,
      eligible: candidates.length,
      sent,
      errors,
    });
  }

  return summary;
}

/**
 * Returns the candidate Customer rows for a given campaign type +
 * delay window. Pure query — no email sending.
 */
async function pickCandidates(
  restaurantId: string,
  campaignType: string,
  delayHours: number,
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  const cutoff = new Date(Date.now() - delayHours * 3600_000);

  if (campaignType === "second_order") {
    // Customer placed exactly 1 order > delayHours ago. Use Customer's
    // totalOrders counter (denormalized + atomic on every order) and
    // createdAt as a proxy for "first order placed."
    return prisma.customer.findMany({
      where: {
        restaurantId,
        totalOrders: 1,
        createdAt: { lte: cutoff },
        email: { not: null },
      },
      select: { id: true, name: true, email: true },
      take: 200, // hard cap per restaurant per run — avoids runaway sends
    });
  }

  if (campaignType === "reengagement") {
    // Customer ordered 2+ times historically but their most recent
    // order is older than `delayHours` (typical: 30/60/90 days). Pulled
    // via a subquery on the Order table since Customer doesn't carry a
    // lastOrderAt column (would need a migration to add).
    const rows = await prisma.$queryRaw<{ id: string; name: string | null; email: string | null }[]>`
      SELECT c.id, c.name, c.email
      FROM "Customer" c
      WHERE c."restaurantId" = ${restaurantId}
        AND c."totalOrders" >= 2
        AND c.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o."customerId" = c.id
            AND o."createdAt" > ${cutoff}
            AND o.status NOT IN ('rejected', 'cancelled')
        )
      LIMIT 200
    `;
    return rows;
  }

  // cart_abandonment + unknown types — not yet implemented (needs
  // cart-tracking infrastructure). Return no candidates so the campaign
  // is effectively a no-op.
  return [];
}

/**
 * Run the autopilot for ALL active restaurants. Called by the hourly
 * cron. Each restaurant's campaigns run in serial inside that
 * restaurant; restaurants themselves run in serial here to avoid
 * thrashing the email transport at scale (Resend's free tier rate-
 * limits to 2 req/s). For 10K+ restaurants this becomes a bottleneck
 * and we'd batch by chunk + use Promise.all — premature now.
 */
export async function runAutopilotForAllRestaurants(): Promise<AutopilotRunSummary[]> {
  const restaurants = await prisma.restaurant.findMany({
    where: {
      isActive: true,
      autopilotCampaigns: { some: { isEnabled: true } },
    },
    select: { id: true },
  });

  const summaries: AutopilotRunSummary[] = [];
  for (const r of restaurants) {
    try {
      summaries.push(await runAutopilotForRestaurant(r.id));
    } catch (e) {
      console.error(`[autopilot] runAutopilotForRestaurant failed for ${r.id}`, e);
    }
  }
  return summaries;
}

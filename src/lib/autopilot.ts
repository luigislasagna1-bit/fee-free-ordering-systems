/**
 * Autopilot marketing campaign runner.
 *
 * For each restaurant with enabled AutopilotCampaign rows, evaluates
 * candidate customers + sends the right email. Idempotent via the
 * AutopilotSend table — once a campaign has been sent to a given email,
 * it never fires again for that email + that campaign.
 *
 * Campaigns supported:
 *
 *   second_order
 *     Target: customer placed exactly 1 order more than `delayHours`
 *     ago. Nudges them back for order #2 (high LTV uplift moment).
 *
 *   reengagement
 *     Target: customers who ordered in the last 6 months but whose
 *     most recent order is in the bottom 60% of recency (rolling
 *     cohort). "We miss you" reminder.
 *
 *   cart_abandonment
 *     Target: CartSession rows that have been stale for >=90 minutes
 *     with an associated customerEmail, no recoveredAt, no prior
 *     emailSentAt. Wired to the public heartbeat endpoint at
 *     /api/public/cart-session.
 *
 * Triggered by /api/cron/autopilot (hourly Vercel cron). Safe to run
 * frequently — AutopilotSend de-dup + CartSession.emailSentAt mean each
 * customer gets each campaign at most once per qualifying event.
 *
 * Master gate: see src/lib/autopilot-state.ts — AutopilotState.masterEnabled
 * controls the whole pillar. Each campaign also has its own enabled
 * boolean. Cron skips cleanly when either is OFF.
 */

import prisma from "@/lib/db";
import { sendAutopilotEmail, setEmailImprint } from "@/lib/email";
import {
  isMasterEnabled,
  isCampaignEnabled,
  markCampaignRan,
  type AutopilotCampaignKind,
} from "@/lib/autopilot-state";
import { getStepPromos } from "@/lib/autopilot-promos";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

export type AutopilotRunSummary = {
  restaurantId: string;
  restaurantName: string;
  results: {
    campaignType: string;
    eligible: number;
    sent: number;
    errors: number;
    skipped?: string; // reason if the campaign was skipped (master off, toggle off, etc.)
  }[];
};

/** Default subject/body for cart_abandonment when the owner hasn't
 *  written their own copy yet. Other campaign types use defaults that
 *  live in the admin UI; cart_abandonment lives here because the
 *  server-side sweep needs to run even before the owner has visited
 *  /admin/autopilot. */
const CART_ABANDON_DEFAULT_SUBJECT = "Forgot something at {restaurant_name}?";
const CART_ABANDON_DEFAULT_BODY =
  "Hi {customer_name},\n\n" +
  "You started an order at {restaurant_name} but didn't finish checking out. " +
  "Your cart is still here — come back and pick up where you left off.\n\n" +
  "{coupon_section}\n\n" +
  "Tap below to complete your order.\n\n" +
  "— The {restaurant_name} team";

/**
 * Run all enabled autopilot campaigns for a single restaurant. Returns
 * a summary suitable for piping to the cron audit log.
 *
 * Skips the entire restaurant when the master toggle is OFF — no
 * candidate queries, no email sends. Each campaign is then gated again
 * on its own per-campaign toggle.
 */
export async function runAutopilotForRestaurant(restaurantId: string): Promise<AutopilotRunSummary> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true, name: true, slug: true, email: true, phone: true,
      subdomain: true, customDomain: true, customDomainStatus: true,
      resellerProfile: { select: { status: true, companyName: true } },
    },
  });
  if (!restaurant) {
    return { restaurantId, restaurantName: "(unknown)", results: [] };
  }

  const summary: AutopilotRunSummary = {
    restaurantId,
    restaurantName: restaurant.name,
    results: [],
  };

  // Master gate — short-circuit cleanly when off.
  if (!(await isMasterEnabled(restaurantId))) {
    summary.results.push({ campaignType: "(all)", eligible: 0, sent: 0, errors: 0, skipped: "master_off" });
    return summary;
  }

  const campaigns = await prisma.autopilotCampaign.findMany({
    where: { restaurantId, isEnabled: true },
  });

  // Most-branded customer order root (verified custom domain > subdomain > apex).
  const orderRootUrl = restaurantOrderUrl(restaurant, "");
  const unsubscribeUrl = restaurantOrderUrl(restaurant, "?unsubscribe=1");
  const imprint =
    restaurant.resellerProfile?.status === "approved" && restaurant.resellerProfile.companyName
      ? restaurant.resellerProfile.companyName
      : null;

  for (const campaign of campaigns) {
    const kind = campaign.campaignType as AutopilotCampaignKind;

    // Per-campaign master+toggle gate.
    if (!(await isCampaignEnabled(restaurantId, kind))) {
      summary.results.push({
        campaignType: campaign.campaignType,
        eligible: 0, sent: 0, errors: 0,
        skipped: "campaign_off",
      });
      continue;
    }

    // Cart abandonment is handled by a separate sweep below — skip
    // here so we don't double-run on the AutopilotCampaign loop.
    if (kind === "cart_abandonment") continue;

    // Drip sequence (Luigi 2026-06-10): when the owner has configured ordered
    // STEPS for this campaign, send the multi-email win-back ladder; otherwise
    // fall back to the legacy single-send so untouched campaigns keep working.
    const steps = await prisma.autopilotStep.findMany({
      where: { restaurantId, campaignType: campaign.campaignType, isEnabled: true },
      orderBy: { stepNumber: "asc" },
      select: { stepNumber: true, delayHours: true, discountPercent: true, subject: true, emailBody: true },
    });

    let result: { eligible: number; sent: number; errors: number };
    if (steps.length > 0) {
      result = await runSteppedCampaign({
        campaignId: campaign.id,
        campaignType: campaign.campaignType,
        restaurantId,
        restaurantName: restaurant.name,
        orderRootUrl,
        unsubscribeUrl,
        restaurantEmail: restaurant.email,
        restaurantPhone: restaurant.phone,
        imprint,
        steps,
      });
    } else {
      const subject = campaign.subject;
      const emailBody = campaign.emailBody;
      if (!subject || !emailBody) {
        // Owner enabled the campaign but didn't fill in subject/body. Skip silently.
        summary.results.push({ campaignType: campaign.campaignType, eligible: 0, sent: 0, errors: 0 });
        continue;
      }
      result = await runStandardCampaign({
        campaignId: campaign.id,
        campaignType: campaign.campaignType,
        restaurantId,
        restaurantName: restaurant.name,
        orderRootUrl,
        unsubscribeUrl,
        restaurantEmail: restaurant.email,
        restaurantPhone: restaurant.phone,
        imprint,
        delayHours: campaign.delayHours,
        couponId: campaign.couponId,
        subject,
        emailBody,
      });
    }

    summary.results.push({
      campaignType: campaign.campaignType,
      eligible: result.eligible, sent: result.sent, errors: result.errors,
    });
    await markCampaignRan(restaurantId, kind);
  }

  // Cart abandonment runs independently — even without an
  // AutopilotCampaign row (we fall back to defaults). Only gated by
  // the master + cart-abandonment toggle.
  if (await isCampaignEnabled(restaurantId, "cart_abandonment")) {
    const result = await runCartAbandonmentForRestaurant(restaurantId, {
      restaurantName: restaurant.name,
      orderRootUrl,
      unsubscribeUrl,
      restaurantEmail: restaurant.email,
      restaurantPhone: restaurant.phone,
      imprint,
    });
    summary.results.push({
      campaignType: "cart_abandonment",
      eligible: result.eligible,
      sent: result.sent,
      errors: result.errors,
    });
    await markCampaignRan(restaurantId, "cart_abandonment");
  }

  return summary;
}

/**
 * Resolve a campaign's attached coupon to { code, label } (Luigi 2026-06-10).
 * The "Attach a Coupon" picker now lists working COUPON-CODE PROMOTIONS, so we
 * resolve the id as a Promotion first; we still fall back to a legacy standalone
 * Coupon row so any old selection keeps working. The label drives the email's
 * coupon card; the code drives the ?coupon pre-apply link.
 */
async function resolveCampaignCoupon(
  restaurantId: string,
  couponId: string | null,
): Promise<{ code: string; label: string } | null> {
  if (!couponId) return null;
  const promo = await prisma.promotion.findFirst({
    where: { id: couponId, restaurantId, couponCode: { not: null } },
    select: { couponCode: true, name: true, ruleConfig: true },
  });
  if (promo?.couponCode) {
    const rc = promo.ruleConfig as { discountPercent?: unknown } | null;
    const pct = rc && typeof rc === "object" && typeof rc.discountPercent === "number" ? rc.discountPercent : null;
    return { code: promo.couponCode, label: pct != null ? `${pct}% off your next order` : promo.name };
  }
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: { code: true, description: true, discountType: true, discountValue: true },
  });
  if (coupon) {
    const label =
      coupon.description ||
      (coupon.discountType === "percentage"
        ? `${coupon.discountValue}% off your next order`
        : `$${coupon.discountValue.toFixed(2)} off your next order`);
    return { code: coupon.code, label };
  }
  return null;
}

/**
 * Standard candidate-based campaign (second_order / reengagement).
 * Pulls candidates, de-dups, sends, records.
 */
async function runStandardCampaign(opts: {
  campaignId: string;
  campaignType: string;
  restaurantId: string;
  restaurantName: string;
  orderRootUrl: string;
  unsubscribeUrl: string;
  restaurantEmail: string | null;
  restaurantPhone: string | null;
  imprint: string | null;
  delayHours: number;
  couponId: string | null;
  subject: string;
  emailBody: string;
}): Promise<{ eligible: number; sent: number; errors: number }> {
  const resolved = await resolveCampaignCoupon(opts.restaurantId, opts.couponId);
  const couponLabel = resolved?.label ?? null;
  const ctaUrl = resolved
    ? `${opts.orderRootUrl}?coupon=${encodeURIComponent(resolved.code)}`
    : opts.orderRootUrl;

  const candidates = await pickCandidates(opts.restaurantId, opts.campaignType, opts.delayHours);

  const candidateEmails = candidates.map(c => c.email).filter((e): e is string => !!e);
  const existingSends = candidateEmails.length > 0
    ? await prisma.autopilotSend.findMany({
        where: { campaignId: opts.campaignId, customerEmail: { in: candidateEmails } },
        select: { customerEmail: true },
      })
    : [];
  const alreadySent = new Set(existingSends.map(s => s.customerEmail));

  let sent = 0;
  let errors = 0;
  for (const customer of candidates) {
    if (!customer.email) continue;
    if (alreadySent.has(customer.email)) continue;

    setEmailImprint(opts.imprint);
    try {
      const res = await sendAutopilotEmail({
        to: customer.email,
        customerName: customer.name || "there",
        restaurantName: opts.restaurantName,
        subject: opts.subject,
        body: opts.emailBody,
        couponCode: resolved?.code,
        couponLabel,
        ctaUrl,
        ctaLabel: resolved ? "Order with coupon" : "Order now",
        restaurantUrl: opts.orderRootUrl,
        restaurantEmail: opts.restaurantEmail ?? undefined,
        restaurantPhone: opts.restaurantPhone ?? undefined,
        unsubscribeUrl: opts.unsubscribeUrl,
      });

      if (res.success) {
        try {
          await prisma.autopilotSend.create({
            data: {
              campaignId: opts.campaignId,
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
        }
      } else {
        console.error("[autopilot] send failed", { campaignId: opts.campaignId, email: customer.email, error: res.error });
        errors++;
      }
    } finally {
      setEmailImprint(null);
    }
  }

  return { eligible: candidates.length, sent, errors };
}

/**
 * Stepped (drip) campaign — the owner-configured multi-email win-back ladder
 * (Luigi 2026-06-10). For each candidate we send the HIGHEST step that's due
 * (so a deeply-lapsed customer who never got step 1 jumps straight to the right
 * tier instead of crawling up one cron-hour at a time), at most one email per
 * run. A re-order automatically RESTARTS the ladder: we only count sends made
 * AFTER the customer's current lastOrderAt, so a fresh order (which moves
 * lastOrderAt forward) drops every prior send and resets lastSentStep to 0.
 *
 * Query budget is flat (no N+1): one candidate query (≤200), one batched
 * AutopilotSend lookup over the (campaignId, customerEmail) index, one promo
 * map — identical shape to runStandardCampaign.
 */
async function runSteppedCampaign(opts: {
  campaignId: string;
  campaignType: string;
  restaurantId: string;
  restaurantName: string;
  orderRootUrl: string;
  unsubscribeUrl: string;
  restaurantEmail: string | null;
  restaurantPhone: string | null;
  imprint: string | null;
  steps: { stepNumber: number; delayHours: number; discountPercent: number; subject: string; emailBody: string }[];
}): Promise<{ eligible: number; sent: number; errors: number }> {
  const steps = opts.steps;
  if (steps.length === 0) return { eligible: 0, sent: 0, errors: 0 };

  // Cohort gated by the FIRST step's delay (the soonest anyone could enter).
  const candidates = await pickCandidates(opts.restaurantId, opts.campaignType, steps[0].delayHours);
  const candidateEmails = candidates.map(c => c.email).filter((e): e is string => !!e);
  if (candidateEmails.length === 0) return { eligible: 0, sent: 0, errors: 0 };

  // Batch 1 — every prior send for these emails (with step + timestamp).
  const allSends = await prisma.autopilotSend.findMany({
    where: { campaignId: opts.campaignId, customerEmail: { in: candidateEmails } },
    select: { customerEmail: true, sequence: true, sentAt: true },
  });
  const sendsByEmail = new Map<string, { sequence: number; sentAt: Date }[]>();
  for (const s of allSends) {
    const arr = sendsByEmail.get(s.customerEmail) ?? [];
    arr.push({ sequence: s.sequence, sentAt: s.sentAt });
    sendsByEmail.set(s.customerEmail, arr);
  }

  // Batch 2 — each step's coupon code + % (the email advertises it, the
  // ordering page pre-applies it via ?coupon=CODE).
  const stepPromos = await getStepPromos(opts.restaurantId, opts.campaignType);

  const now = Date.now();
  let sent = 0;
  let errors = 0;
  let eligible = 0;
  for (const customer of candidates) {
    if (!customer.email) continue;
    // Reorder-restart anchor: last order (reengagement) or signup/first-order
    // (second_order). Sends before this are from a PRIOR lapse and ignored.
    const lref = customer.lastOrderAt ?? customer.createdAt;
    const lrefMs = lref.getTime();
    const priorSends = (sendsByEmail.get(customer.email) ?? []).filter(s => s.sentAt.getTime() > lrefMs);
    const lastSentStep = priorSends.reduce((m, s) => Math.max(m, s.sequence), 0);
    const daysSince = (now - lrefMs) / 86_400_000;

    const due = steps.filter(s => s.stepNumber > lastSentStep && daysSince >= s.delayHours / 24);
    if (due.length === 0) continue;
    const target = due[due.length - 1]; // highest due step
    eligible++;

    const promo = stepPromos.get(target.stepNumber);
    const couponCode = promo?.couponCode;
    const pct = promo?.discountPercent ?? target.discountPercent;
    const couponLabel = couponCode ? `${pct}% off your next order` : null;
    const ctaUrl = couponCode
      ? `${opts.orderRootUrl}?coupon=${encodeURIComponent(couponCode)}`
      : opts.orderRootUrl;

    setEmailImprint(opts.imprint);
    try {
      const res = await sendAutopilotEmail({
        to: customer.email,
        customerName: customer.name || "there",
        restaurantName: opts.restaurantName,
        subject: target.subject,
        body: target.emailBody,
        couponCode,
        couponLabel,
        ctaUrl,
        ctaLabel: couponCode ? "Order with coupon" : "Order now",
        restaurantUrl: opts.orderRootUrl,
        restaurantEmail: opts.restaurantEmail ?? undefined,
        restaurantPhone: opts.restaurantPhone ?? undefined,
        unsubscribeUrl: opts.unsubscribeUrl,
      });

      if (res.success) {
        try {
          await prisma.autopilotSend.create({
            data: {
              campaignId: opts.campaignId,
              customerEmail: customer.email,
              customerId: customer.id,
              sequence: target.stepNumber,
            },
          });
          sent++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("Unique constraint")) {
            console.error("[autopilot] stepped AutopilotSend.create failed", e);
            errors++;
          }
        }
      } else {
        console.error("[autopilot] stepped send failed", { campaignId: opts.campaignId, email: customer.email, step: target.stepNumber, error: res.error });
        errors++;
      }
    } finally {
      setEmailImprint(null);
    }
  }

  return { eligible, sent, errors };
}

/**
 * Returns the candidate Customer rows for a given campaign type +
 * delay window. Pure query — no email sending.
 *
 * Note (E1 — basic 60%/6-month rolling cohort): the reengagement query
 * targets the bottom 60% by recency among customers active in the last
 * 6 months. This is a rough first-pass approximation.
 *
 * TODO: full progressive 5-tier WIN ladder (WIN1..WIN5 per
 * DESIGN-MARKETING-SUITE.md §5) — per-tier delay + per-tier coupon
 * value + cohort suppression so a customer in WIN3 doesn't also get
 * WIN1/WIN2 retroactively.
 */
async function pickCandidates(
  restaurantId: string,
  campaignType: string,
  delayHours: number,
): Promise<{ id: string; name: string | null; email: string | null; lastOrderAt: Date | null; createdAt: Date }[]> {
  const cutoff = new Date(Date.now() - delayHours * 3600_000);

  if (campaignType === "second_order") {
    return prisma.customer.findMany({
      where: {
        restaurantId,
        totalOrders: 1,
        createdAt: { lte: cutoff },
        email: { not: null },
        // Respect marketing consent — opted-out customers must never
        // receive these automated marketing nudges (they still get
        // transactional order emails). Luigi 2026-06-03.
        marketingConsent: true,
      },
      // lastOrderAt + createdAt feed the drip-sequence timing (Luigi 2026-06-10);
      // the legacy single-send path simply ignores them.
      select: { id: true, name: true, email: true, lastOrderAt: true, createdAt: true },
      take: 200,
    });
  }

  if (campaignType === "reengagement") {
    // Basic 60%/6-month rolling cohort:
    //  1. Pull all customers from this restaurant with lastOrderAt within
    //     the last 6 months (the active recency cohort).
    //  2. Compute the 40th-percentile cutoff of lastOrderAt — anyone
    //     OLDER than this cutoff is in the bottom 60% by recency.
    //  3. Cap at 200 per cron run (existing safety bound).
    //
    // Uses Customer.lastOrderAt (denormalized) instead of subquerying
    // Order — Customer's hot table has the index we want and avoids the
    // O(N) join.
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 3600_000);

    const cohort = await prisma.customer.findMany({
      where: {
        restaurantId,
        email: { not: null },
        lastOrderAt: { gte: sixMonthsAgo, not: null },
        totalOrders: { gte: 1 },
        // Respect marketing consent — opted-out customers are excluded
        // from re-engagement sends. Luigi 2026-06-03.
        marketingConsent: true,
      },
      select: { id: true, name: true, email: true, lastOrderAt: true, createdAt: true },
      orderBy: { lastOrderAt: "asc" },
    });

    if (cohort.length === 0) return [];

    // Find the 40th-percentile lastOrderAt — customers older than this
    // are the bottom 60% by recency. With small cohorts (<5 customers)
    // we lose meaningful tiering — fall back to "any customer older
    // than `delayHours`" using the cutoff above.
    if (cohort.length < 5) {
      return cohort.filter(c => c.lastOrderAt && c.lastOrderAt < cutoff).slice(0, 200);
    }

    const idx = Math.floor(cohort.length * 0.4);
    const percentileCutoff = cohort[idx].lastOrderAt;
    if (!percentileCutoff) return [];
    return cohort.filter(c => c.lastOrderAt && c.lastOrderAt < percentileCutoff).slice(0, 200);
  }

  // cart_abandonment is handled by runCartAbandonmentForRestaurant.
  return [];
}

/**
 * Cart abandonment sweep. Finds CartSession rows that have been
 * touched recently enough that the cart contents are still meaningful
 * (>=90 min stale) but not so recently that the customer might still
 * be filling it out. Sends a recovery email + marks the row as
 * abandoned + email-sent.
 *
 * Suppression: any order from this customerEmail at this restaurant
 * within the last 4 hours marks the row recovered instead.
 *
 * Stagger: capped at 100 per restaurant per run to keep email
 * throughput sane.
 */
const CART_STALE_MS = 90 * 60 * 1000; // 90 minutes
const CART_SUPPRESSION_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function runCartAbandonmentForRestaurant(
  restaurantId: string,
  ctx: {
    restaurantName: string;
    orderRootUrl: string;
    unsubscribeUrl: string;
    restaurantEmail: string | null;
    restaurantPhone: string | null;
    imprint: string | null;
  },
): Promise<{ eligible: number; sent: number; errors: number }> {
  // Pull the cart_abandonment campaign config (if any). Subject/body/
  // couponId come from there; we fall back to defaults if no row exists.
  const campaign = await prisma.autopilotCampaign.findUnique({
    where: {
      restaurantId_campaignType: { restaurantId, campaignType: "cart_abandonment" },
    },
  });

  const subject = (campaign?.subject && campaign.subject.length > 0)
    ? campaign.subject
    : CART_ABANDON_DEFAULT_SUBJECT;
  const emailBody = (campaign?.emailBody && campaign.emailBody.length > 0)
    ? campaign.emailBody
    : CART_ABANDON_DEFAULT_BODY;

  const resolved = await resolveCampaignCoupon(restaurantId, campaign?.couponId ?? null);
  const couponLabel = resolved?.label ?? null;
  const ctaUrl = resolved
    ? `${ctx.orderRootUrl}?coupon=${encodeURIComponent(resolved.code)}`
    : ctx.orderRootUrl;

  const staleCutoff = new Date(Date.now() - CART_STALE_MS);
  const suppressionCutoff = new Date(Date.now() - CART_SUPPRESSION_MS);

  const candidates = await prisma.cartSession.findMany({
    where: {
      restaurantId,
      abandonedAt: null,
      emailSentAt: null,
      recoveredAt: null,
      customerEmail: { not: null },
      lastTouchedAt: { lt: staleCutoff },
    },
    take: 100,
    orderBy: { lastTouchedAt: "asc" },
  });

  let sent = 0;
  let errors = 0;

  for (const session of candidates) {
    if (!session.customerEmail) continue;

    // Respect marketing consent: if this email belongs to a KNOWN customer
    // who has opted out, skip the cart-recovery nudge (it's a marketing
    // email, not a transactional one). A brand-new guest with no Customer
    // record yet hasn't opted out, so they still get the nudge — that's the
    // whole point of cart abandonment. Luigi 2026-06-03.
    const knownCustomer = await prisma.customer.findFirst({
      where: { restaurantId, email: session.customerEmail },
      select: { marketingConsent: true },
    });
    if (knownCustomer && knownCustomer.marketingConsent === false) {
      // Mark the session resolved so we don't re-evaluate it every cron run.
      await prisma.cartSession.update({
        where: { id: session.id },
        data: { abandonedAt: new Date() },
      });
      continue;
    }

    // Suppression: did this email place an order at this restaurant
    // recently? If yes, mark recovered + skip the email.
    const recentOrder = await prisma.order.findFirst({
      where: {
        restaurantId,
        customerEmail: session.customerEmail,
        createdAt: { gte: suppressionCutoff },
      },
      select: { id: true },
    });

    if (recentOrder) {
      await prisma.cartSession.update({
        where: { id: session.id },
        data: { recoveredAt: new Date(), abandonedAt: new Date() },
      });
      continue;
    }

    // Send the recovery email.
    setEmailImprint(ctx.imprint);
    try {
      const res = await sendAutopilotEmail({
        to: session.customerEmail,
        customerName: "there", // CartSession doesn't carry a name field
        restaurantName: ctx.restaurantName,
        subject,
        body: emailBody,
        couponCode: resolved?.code,
        couponLabel,
        ctaUrl,
        ctaLabel: "Complete your order",
        restaurantUrl: ctx.orderRootUrl,
        restaurantEmail: ctx.restaurantEmail ?? undefined,
        restaurantPhone: ctx.restaurantPhone ?? undefined,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });

      if (res.success) {
        await prisma.cartSession.update({
          where: { id: session.id },
          data: { abandonedAt: new Date(), emailSentAt: new Date() },
        });
        sent++;
      } else {
        console.error("[autopilot] cart-abandon send failed", {
          sessionId: session.id, email: session.customerEmail, error: res.error,
        });
        errors++;
      }
    } finally {
      setEmailImprint(null);
    }
  }

  return { eligible: candidates.length, sent, errors };
}

/**
 * Run the autopilot for ALL active restaurants. Called by the hourly
 * cron. Each restaurant's campaigns run in serial inside that
 * restaurant; restaurants themselves run in serial here to avoid
 * thrashing the email transport at scale.
 *
 * Filters on the restaurant set ONCE — we pick up restaurants that
 * have ANY autopilot-related row (AutopilotCampaign or AutopilotState
 * with masterEnabled). Cart abandonment doesn't need a campaign row,
 * so we have to include restaurants that only have AutopilotState.
 */
export async function runAutopilotForAllRestaurants(): Promise<AutopilotRunSummary[]> {
  const restaurants = await prisma.restaurant.findMany({
    where: {
      isActive: true,
      OR: [
        { autopilotCampaigns: { some: { isEnabled: true } } },
        { autopilotState: { is: { masterEnabled: true } } },
      ],
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

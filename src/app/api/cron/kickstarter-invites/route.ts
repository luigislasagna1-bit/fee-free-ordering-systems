/**
 * POST/GET /api/cron/kickstarter-invites
 *
 * Hourly cron that drips Kickstarter "Invite Prospects" emails out in
 * small batches. Why throttled?
 *   1. Resend rate-limits free-tier accounts to 10 emails/sec. A 1000-
 *      prospect CSV blasted in one shot trips the limit + half the
 *      sends fail with no good way to retry.
 *   2. Dripping signals to inbox providers (Gmail/Outlook) that this is
 *      a real restaurant, not a one-shot spam blast — much better
 *      deliverability.
 *
 * Schedule: 15 * * * * (15 past every hour). Staggered from the
 * autopilot cron at 0 * * * * so we don't pin two long-running email
 * workloads on the same minute.
 *
 * Throttle: 20 emails per ProspectImport per cron run. With hourly
 * runs this drains a 1000-prospect import in ~50 hours (~2 days), which
 * matches GloriaFood's pacing.
 *
 * Auth: same dual-mode pattern as /api/cron/autopilot — Vercel cron
 * sends `Authorization: Bearer ${CRON_SECRET}`, OR a superadmin
 * session can trigger manually for testing.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { KICKSTARTER_FIRST_BUY_REF, sendInviteEmail } from "@/lib/kickstarter";
import { monthsAgo, EBR_MONTHS, INQUIRY_MONTHS } from "@/lib/marketing-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_PER_IMPORT = 20;

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const start = Date.now();
  let restaurantsConsidered = 0;
  let restaurantsSkippedInactivePromo = 0;
  let importsConsidered = 0;
  let totalSent = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // 1. Find every restaurant with the Invite Prospects toggle on. We
  // pull the imports + the restaurant metadata in the same query so
  // the inner loop doesn't N+1 itself.
  const enabledStates = await prisma.kickstarterState.findMany({
    where: { inviteProspectsEnabled: true },
    select: {
      restaurantId: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          phone: true,
          subdomain: true,
          customDomain: true,
          customDomainStatus: true,
          defaultLanguage: true,
          resellerProfile: { select: { status: true, companyName: true } },
        },
      },
    },
  });

  for (const state of enabledStates) {
    restaurantsConsidered++;
    const restaurant = state.restaurant;
    if (!restaurant) continue;

    // FAIL-SAFE: the invite email unconditionally promises "10% off your
    // first order — it'll auto-apply". If the backing First Buy promo has
    // been paused (possible via /admin/promotions, which doesn't know about
    // KickstarterState), sending would promise a discount checkout can never
    // apply — the 2026-07 FIRSTBUY incident sent ~3,600 such emails. Skip
    // this restaurant until the promo is active again; the drip resumes
    // automatically on the next hourly run after reactivation.
    const activeFirstBuy = await prisma.promotion.findFirst({
      where: {
        restaurantId: restaurant.id,
        campaignRef: KICKSTARTER_FIRST_BUY_REF,
        isActive: true,
      },
      select: { id: true },
    });
    if (!activeFirstBuy) {
      restaurantsSkippedInactivePromo++;
      console.error(
        `[kickstarter-invites] SKIPPING restaurant ${restaurant.id} (${restaurant.slug}): ` +
          `invite emails promise the First Buy discount but no ACTIVE kickstarter_first_buy ` +
          `promotion exists — turn First Buy back on in /admin/kickstarter to resume sending`,
      );
      continue;
    }

    const imprint =
      restaurant.resellerProfile?.status === "approved" &&
      restaurant.resellerProfile.companyName
        ? restaurant.resellerProfile.companyName
        : null;

    // 2. For each restaurant: find imports that still have work to do
    // (isComplete=true AND emailsSent < successRows). We can't just
    // count pending prospects in the WHERE clause without a subquery,
    // so we filter in two steps — Prisma doesn't expose a cleaner way
    // and the cardinality (imports per restaurant) is tiny.
    const candidateImports = await prisma.prospectImport.findMany({
      where: {
        restaurantId: restaurant.id,
        isComplete: true,
        // CASL gate: never send from an import whose owner hasn't attested a
        // lawful basis. This ALSO freezes every legacy (pre-2026-08-04) import
        // — they have consentAttestedAt=null — until the owner re-attests.
        consentAttestedAt: { not: null },
      },
      orderBy: { uploadedAt: "asc" }, // oldest imports first
    });

    for (const imp of candidateImports) {
      if (imp.emailsSent >= imp.successRows) continue; // already drained
      importsConsidered++;

      // Rolling 24-month (EBR) / 6-month (inquiry) implied-consent window,
      // enforced again at SEND time (defense-in-depth over the import-time
      // exclusion) — a multi-day drip must not cross the window mid-flight.
      // Express consent doesn't expire, so no date filter for it.
      let relationshipFilter: { relationshipDate?: { gte: Date } } = {};
      if (imp.consentBasis === "existing_business_relationship") {
        relationshipFilter = { relationshipDate: { gte: monthsAgo(EBR_MONTHS) } };
      } else if (imp.consentBasis === "inquiry") {
        relationshipFilter = { relationshipDate: { gte: monthsAgo(INQUIRY_MONTHS) } };
      }

      // 3. Pull up to BATCH_PER_IMPORT prospects who haven't been sent yet AND
      // haven't bounced AND haven't unsubscribed AND weren't excluded at import
      // (stale/suppressed) AND are still inside the consent window. Index on
      // importId keeps this O(batch) regardless of file size.
      const prospects = await prisma.prospect.findMany({
        where: {
          importId: imp.id,
          emailSentAt: null,
          emailBouncedAt: null,
          unsubscribedAt: null,
          excludedAt: null,
          ...relationshipFilter,
        },
        take: BATCH_PER_IMPORT,
      });

      if (prospects.length === 0) {
        // No more sendable rows but emailsSent < successRows — owner
        // may have manually unsubscribed everyone. Mark complete so
        // we don't keep scanning this import forever.
        // (Setting emailsSent := successRows is the simplest cap.)
        // Conservatively skip rather than rewriting state — next cron
        // will hit this branch again and remain a cheap no-op.
        continue;
      }

      let sentThisBatch = 0;
      for (const p of prospects) {
        try {
          const result = await sendInviteEmail(
            p,
            {
              id: restaurant.id,
              name: restaurant.name,
              slug: restaurant.slug,
              email: restaurant.email,
              phone: restaurant.phone,
              subdomain: restaurant.subdomain,
              customDomain: restaurant.customDomain,
              customDomainStatus: restaurant.customDomainStatus,
              defaultLanguage: restaurant.defaultLanguage,
              imprint,
            },
            imp.consentBasis,
          );
          // Mark handled regardless of outcome — Resend errors on a single
          // recipient (bounced domain, malformed address), or a suppression
          // skip, should NOT cause infinite retries that re-scan everyone
          // else every hour. Set emailSentAt so we move past this prospect.
          await prisma.prospect.update({
            where: { id: p.id },
            data: { emailSentAt: new Date() },
          });
          if (result?.sent) {
            sentThisBatch++;
            totalSent++;
          } else if (result?.skipped) {
            // Suppressed / stale consent / no basis — handled, NOT an error.
            totalSkipped++;
          } else {
            totalErrors++;
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[kickstarter-invites] send failed", {
            prospectId: p.id,
            restaurantId: restaurant.id,
            err: msg,
          });
          totalErrors++;
          // Still bump emailSentAt to avoid hot-loop retries on a
          // permanently broken row.
          await prisma.prospect.update({
            where: { id: p.id },
            data: { emailSentAt: new Date() },
          });
        }
      }

      // 4. Roll up the per-import counters in one update — keeps the
      // /admin/kickstarter UI's progress bar accurate.
      await prisma.prospectImport.update({
        where: { id: imp.id },
        data: {
          emailsSent: { increment: sentThisBatch },
          emailsLastSent: new Date(),
        },
      });
    }
  }

  const elapsedMs = Date.now() - start;
  console.log(
    `[kickstarter-invites] restaurants=${restaurantsConsidered} skippedInactivePromo=${restaurantsSkippedInactivePromo} imports=${importsConsidered} sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors} elapsedMs=${elapsedMs}`,
  );

  return NextResponse.json({
    restaurantsConsidered,
    restaurantsSkippedInactivePromo,
    importsConsidered,
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
    elapsedMs,
  });
}

export const GET = handle;
export const POST = handle;

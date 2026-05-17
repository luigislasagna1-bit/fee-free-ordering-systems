/**
 * Monthly-digest handler — MANUAL TRIGGER ONLY.
 *
 * Vercel Hobby allows 2 crons total. Both slots are used by /api/cron/commissions
 * and /api/cron/daily-digest. The daily handler self-dispatches the monthly
 * digest when UTC day === 1, so this endpoint is NOT scheduled in vercel.json.
 *
 * It exists for:
 *   - One-off debug runs (curl with the bearer token)
 *   - A future upgrade to Pro plan where we'd give monthly its own slot
 *
 * Guarded against accidental mid-month runs with the UTC-day-1 check unless
 * CRON_FORCE_MONTHLY=1 is set.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildMonthlyDigest } from "@/lib/digests";
import { sendMonthlyDigestEmail, setEmailImprint, type DigestStats } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Monthly cron is scheduled for the 1st — but we guard anyway so a manual
  // hit on the 15th doesn't accidentally fire a 14-day-stale "monthly" report.
  const now = new Date();
  if (now.getUTCDate() !== 1 && process.env.CRON_FORCE_MONTHLY !== "1") {
    return NextResponse.json({
      ok: true,
      note: "Not the 1st of the month — skipping. Set CRON_FORCE_MONTHLY=1 to override.",
      day: now.getUTCDate(),
    });
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      notificationRecipients: {
        where: { isActive: true, endOfMonthReport: true },
        select: { email: true, emailLanguage: true },
      },
      resellerProfile: {
        select: { status: true, companyName: true },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of restaurants) {
    if (r.notificationRecipients.length === 0) {
      skipped++;
      continue;
    }
    let stats: DigestStats | null = null;
    try {
      stats = await buildMonthlyDigest(r.id);
    } catch (e) {
      console.error(`[monthly-digest] buildMonthlyDigest failed for ${r.id}`, e);
      errors++;
      continue;
    }
    if (!stats || (stats.orders === 0 && stats.tableReservations === 0)) {
      skipped++;
      continue;
    }

    const imprint =
      r.resellerProfile?.status === "approved" && r.resellerProfile.companyName
        ? r.resellerProfile.companyName
        : null;
    setEmailImprint(imprint);
    try {
      await Promise.all(
        r.notificationRecipients.map((recipient) =>
          sendMonthlyDigestEmail({ to: recipient.email, stats: stats!, locale: recipient.emailLanguage }).catch((err) => {
            console.error(`[monthly-digest] send to ${recipient.email} failed:`, err);
            errors++;
          })
        )
      );
      sent += r.notificationRecipients.length;
    } finally {
      setEmailImprint(null);
    }
  }

  return NextResponse.json({
    ok: true,
    restaurantsConsidered: restaurants.length,
    sent,
    skipped,
    errors,
    ranAt: new Date().toISOString(),
  });
}

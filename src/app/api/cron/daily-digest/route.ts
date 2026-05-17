/**
 * Daily-digest cron handler.
 *
 * Fires once a day (Vercel Cron in production, schedule in vercel.json). For
 * every active restaurant, computes yesterday's stats and emails a daily
 * report to each NotificationRecipient with `endOfDayReport = true`. Each
 * recipient gets the email in their preferred language.
 *
 * Vercel Hobby plan has a 24h minimum cron interval; the digest is fine on
 * that cadence since it's a once-daily summary anyway.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildDailyDigest, buildMonthlyDigest } from "@/lib/digests";
import { sendDailyDigestEmail, sendMonthlyDigestEmail, setEmailImprint, type DigestStats } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Optional bearer-token gate so randoms can't trigger digests at scale.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // On the 1st of each month, also dispatch the monthly digest (Vercel Hobby
  // plan caps us at 2 cron jobs total, so we piggy-back monthly here instead
  // of having a separate /api/cron/monthly-digest schedule).
  const now = new Date();
  const isFirstOfMonth = now.getUTCDate() === 1;

  // Pull every active restaurant with both recipient sets (daily and monthly)
  // plus reseller imprint in one shot. The recipient lists are filtered by
  // the matching toggle so we skip restaurants whose owners opted everyone out.
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      notificationRecipients: {
        where: { isActive: true },
        select: { email: true, emailLanguage: true, endOfDayReport: true, endOfMonthReport: true },
      },
      resellerProfile: {
        select: { status: true, companyName: true },
      },
    },
  });

  let dailySent = 0, monthlySent = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of restaurants) {
    const dailyRecipients = r.notificationRecipients.filter((rec) => rec.endOfDayReport);
    const monthlyRecipients = isFirstOfMonth
      ? r.notificationRecipients.filter((rec) => rec.endOfMonthReport)
      : [];
    if (dailyRecipients.length === 0 && monthlyRecipients.length === 0) {
      skipped++;
      continue;
    }

    const imprint =
      r.resellerProfile?.status === "approved" && r.resellerProfile.companyName
        ? r.resellerProfile.companyName
        : null;

    // Daily digest
    if (dailyRecipients.length > 0) {
      let stats: DigestStats | null = null;
      try {
        stats = await buildDailyDigest(r.id, now);
      } catch (e) {
        console.error(`[daily-digest] buildDailyDigest failed for ${r.id}`, e);
        errors++;
      }
      // Skip dispatch on zero-activity days — owners don't need a "0 orders" report.
      if (stats && (stats.orders > 0 || stats.tableReservations > 0)) {
        setEmailImprint(imprint);
        try {
          await Promise.all(
            dailyRecipients.map((recipient) =>
              sendDailyDigestEmail({ to: recipient.email, stats: stats!, locale: recipient.emailLanguage }).catch((err) => {
                console.error(`[daily-digest] send to ${recipient.email} failed:`, err);
                errors++;
              })
            )
          );
          dailySent += dailyRecipients.length;
        } finally {
          setEmailImprint(null);
        }
      }
    }

    // Monthly digest (only on the 1st)
    if (monthlyRecipients.length > 0) {
      let stats: DigestStats | null = null;
      try {
        stats = await buildMonthlyDigest(r.id, now);
      } catch (e) {
        console.error(`[daily-digest] buildMonthlyDigest failed for ${r.id}`, e);
        errors++;
      }
      if (stats && (stats.orders > 0 || stats.tableReservations > 0)) {
        setEmailImprint(imprint);
        try {
          await Promise.all(
            monthlyRecipients.map((recipient) =>
              sendMonthlyDigestEmail({ to: recipient.email, stats: stats!, locale: recipient.emailLanguage }).catch((err) => {
                console.error(`[daily-digest] monthly send to ${recipient.email} failed:`, err);
                errors++;
              })
            )
          );
          monthlySent += monthlyRecipients.length;
        } finally {
          setEmailImprint(null);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    restaurantsConsidered: restaurants.length,
    dailySent,
    monthlySent,
    skipped,
    errors,
    isFirstOfMonth,
    ranAt: now.toISOString(),
  });
}

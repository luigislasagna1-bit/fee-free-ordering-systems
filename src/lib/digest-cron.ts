/**
 * End-of-day / monthly digest sweep — shared by two crons (reseller report
 * cmq8gfpxn, Luigi 2026-06-11):
 *
 *   "closing" — every minute. Sends a restaurant's end-of-day report ~5 min
 *               AFTER its closing time, in its own timezone ("open 10:00–23:00
 *               → report ~23:05"), covering the business day that just ended.
 *               Since cms0gyexp #13 (2026-07-31) the business day runs
 *               CLOSE-TO-CLOSE (see src/lib/digests.ts), so the report window
 *               ends at the exact instant that triggers the send — activity
 *               after close belongs to the NEXT day's report, never to a
 *               morning-catch-up resend of a day the owner thought was over.
 *               Overnight rows (close past midnight) report the PREVIOUS
 *               local day when they close in the early hours; closed days end
 *               at midnight and send ~00:05 (skipped when there was zero
 *               activity, like every digest).
 *
 *   "morning" — the legacy daily schedule (08:00 UTC). Now a CATCH-UP: it
 *               sends yesterday's report only when the closing-time sweep
 *               didn't (cron jitter, restaurant added mid-day, deploy gap),
 *               and still carries the monthly digest on the 1st.
 *
 * Idempotency: Restaurant.lastEodDigestDate stores the LOCAL day key the
 * digest was last actually SENT for — both sweeps check it before sending, so
 * the same day can never be reported twice.
 */
import prisma from "@/lib/db";
import {
  buildDailyDigest,
  buildMonthlyDigest,
  buildTodaySnapshot,
  operationalDayEnd,
  type DigestHoursRow,
} from "@/lib/digests";
import {
  sendDailyDigestEmail,
  sendMonthlyDigestEmail,
  setEmailImprint,
  type DigestStats,
} from "@/lib/email";
import { dateKeyInTimezone } from "@/lib/restaurant-hours";

export type DigestSweepMode = "morning" | "closing";

// Send the end-of-day report ~5 minutes after close (Luigi 2026-06-13: "exactly
// 5 minutes after closing, not within 30"). The cron runs EVERY MINUTE, so the
// first run at/after the 5-minute mark fires it; idempotency (lastEodDigestDate)
// prevents a resend. CATCHUP_WINDOW_MIN is slack so a missed minute still sends.
const TARGET_DELAY_MIN = 5;
const CATCHUP_WINDOW_MIN = 30;
/** Is `deltaMin` (minutes since close) inside the send window [5, 5+30)? */
function inSendWindow(deltaMin: number): boolean {
  return deltaMin >= TARGET_DELAY_MIN && deltaMin < TARGET_DELAY_MIN + CATCHUP_WINDOW_MIN;
}

/** Anything worth reporting? Earned activity, or cancelled/rejected/refund
 *  events that now have their own lines in the report. */
function hasReportableActivity(stats: DigestStats): boolean {
  return (
    stats.orders > 0 ||
    stats.tableReservations > 0 ||
    (stats.cancelledOrders ?? 0) > 0 ||
    (stats.cancelledReservations ?? 0) > 0 ||
    (stats.refundsAmount ?? 0) > 0
  );
}

/** Shift a "YYYY-MM-DD" key by N days (noon-UTC anchor dodges DST edges). */
function addDaysToKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * If this restaurant's business day ended within the send window just now,
 * return the LOCAL day key that ended; else null. Delegates the "when does day
 * N end" question to digests.operationalDayEnd — the SAME split-hours-aware
 * instant that bounds the report window, so the email always fires ~5 min
 * after the exact moment its own reporting window closes (Fabrizio cms0gyexp
 * #13). Covers every legacy case: a normal 22:00 close sends 22:05 (todayKey);
 * an overnight 02:00 close sends 02:05 (yesterdayKey); a 23:58 close spilling
 * past midnight sends 00:03 (yesterdayKey); a closed day ends at midnight and
 * sends 00:05 (yesterdayKey) — zero-activity days are skipped by the caller.
 */
function dayThatJustEnded(rows: DigestHoursRow[], tz: string, now: Date): string | null {
  const todayKey = dateKeyInTimezone(now, tz);
  for (const key of [todayKey, addDaysToKey(todayKey, -1)]) {
    const end = operationalDayEnd(rows, key, tz);
    if (inSendWindow((now.getTime() - end.getTime()) / 60_000)) return key;
  }
  return null;
}

export async function runDigestSweep(mode: DigestSweepMode, now: Date = new Date()) {
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      timezone: true,
      // Render the report in the restaurant's currency + language (Fabrizio
      // report: the email was hardcoded $ + English).
      currency: true,
      defaultLanguage: true,
      lastEodDigestDate: true,
      // Full weekly rows (incl. split-hours intervals) drive the closing-time
      // detection — operationalDayEnd picks the default (service-null) row per
      // day itself, falling back to service rows exactly like the report
      // window does, so send time and window end can never disagree.
      openingHours: {
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, closesNextDay: true, service: true, intervals: true },
      },
      notificationRecipients: {
        where: { isActive: true },
        select: { email: true, emailLanguage: true, endOfDayReport: true, endOfMonthReport: true },
      },
      resellerProfile: { select: { status: true, companyName: true } },
    },
  });

  let dailySent = 0, monthlySent = 0, skipped = 0, errors = 0;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const dashboardUrl = `${baseUrl}/admin`;
  const unsubscribeUrl = `${baseUrl}/admin/notifications`;

  for (const r of restaurants) {
    const tz = r.timezone ?? "UTC";
    const dailyRecipients = r.notificationRecipients.filter((rec) => rec.endOfDayReport);
    const lastSentKey = r.lastEodDigestDate ? r.lastEodDigestDate.toISOString().slice(0, 10) : null;

    // ── Daily report ──────────────────────────────────────────────────────
    // Which local day should this sweep report on (if any)?
    //   closing → the day that just ended at this restaurant's closing time
    //   morning → yesterday (catch-up only if the closing sweep didn't send)
    let reportDayKey: string | null = null;
    let stats: DigestStats | null = null;
    if (dailyRecipients.length > 0) {
      if (mode === "closing") {
        reportDayKey = dayThatJustEnded(r.openingHours, tz, now);
        if (reportDayKey && reportDayKey !== lastSentKey) {
          try {
            // The day that ended is either today (normal close → full-day
            // snapshot) or yesterday (overnight close → yesterday's window).
            stats =
              reportDayKey === dateKeyInTimezone(now, tz)
                ? await buildTodaySnapshot(r.id, now)
                : await buildDailyDigest(r.id, now);
          } catch (e) {
            console.error(`[digest-sweep] closing build failed for ${r.id}`, e);
            errors++;
          }
        }
      } else {
        const yesterdayKey = addDaysToKey(dateKeyInTimezone(now, tz), -1);
        if (lastSentKey !== yesterdayKey) {
          reportDayKey = yesterdayKey;
          try {
            stats = await buildDailyDigest(r.id, now);
          } catch (e) {
            console.error(`[digest-sweep] morning build failed for ${r.id}`, e);
            errors++;
          }
        }
      }
    }

    const imprint =
      r.resellerProfile?.status === "approved" && r.resellerProfile.companyName
        ? r.resellerProfile.companyName
        : null;

    // Skip dispatch on zero-activity days — owners don't need a "0 orders"
    // report. (We deliberately do NOT stamp the marker on a zero-skip: if
    // late activity lands after closing, the morning catch-up still reports.)
    // Cancelled/rejected activity and refunds DO count as activity — a day
    // whose only event was a rejected booking or a refund still gets its
    // report (Fabrizio cms0gyexp #14: those now render as their own lines).
    if (stats && reportDayKey && hasReportableActivity(stats)) {
      setEmailImprint(imprint);
      try {
        await Promise.all(
          dailyRecipients.map((recipient) =>
            sendDailyDigestEmail({
              to: recipient.email,
              stats: stats!,
              dashboardUrl,
              unsubscribeUrl,
              // Recipient's chosen language wins; else the restaurant's default.
              locale: recipient.emailLanguage || r.defaultLanguage || undefined,
              currency: r.currency,
            }).catch((err) => {
              console.error(`[digest-sweep] send to ${recipient.email} failed:`, err);
              errors++;
            }),
          ),
        );
        dailySent += dailyRecipients.length;
        await prisma.restaurant.update({
          where: { id: r.id },
          data: { lastEodDigestDate: new Date(`${reportDayKey}T00:00:00.000Z`) },
        });
      } finally {
        setEmailImprint(null);
      }
    }

    // ── Monthly digest — morning sweep only, on the local 1st ─────────────
    if (mode === "morning") {
      const isFirstOfMonth = dateKeyInTimezone(now, tz).slice(8, 10) === "01";
      const monthlyRecipients = isFirstOfMonth
        ? r.notificationRecipients.filter((rec) => rec.endOfMonthReport)
        : [];
      if (monthlyRecipients.length > 0) {
        let mStats: DigestStats | null = null;
        try {
          mStats = await buildMonthlyDigest(r.id, now);
        } catch (e) {
          console.error(`[digest-sweep] buildMonthlyDigest failed for ${r.id}`, e);
          errors++;
        }
        if (mStats && hasReportableActivity(mStats)) {
          setEmailImprint(imprint);
          try {
            await Promise.all(
              monthlyRecipients.map((recipient) =>
                sendMonthlyDigestEmail({
                  to: recipient.email,
                  stats: mStats!,
                  dashboardUrl,
                  unsubscribeUrl,
                  locale: recipient.emailLanguage || r.defaultLanguage || undefined,
                  currency: r.currency,
                }).catch((err) => {
                  console.error(`[digest-sweep] monthly send to ${recipient.email} failed:`, err);
                  errors++;
                }),
              ),
            );
            monthlySent += monthlyRecipients.length;
          } finally {
            setEmailImprint(null);
          }
        }
      }
    }

    if (!stats) skipped++;
  }

  return {
    ok: true,
    mode,
    restaurantsConsidered: restaurants.length,
    dailySent,
    monthlySent,
    skipped,
    errors,
    ranAt: now.toISOString(),
  };
}

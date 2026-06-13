/**
 * End-of-day / monthly digest sweep — shared by two crons (reseller report
 * cmq8gfpxn, Luigi 2026-06-11):
 *
 *   "closing" — every 30 min. Sends a restaurant's end-of-day report shortly
 *               AFTER its closing time, in its own timezone ("open 10:00–23:00
 *               → report ~23:00–23:30"), covering the local day that just
 *               ended. Overnight rows (close past midnight) report the
 *               PREVIOUS local day when they close in the early hours. Closed
 *               days fall back to a 23:30-local send (skipped when there was
 *               zero activity, like every digest).
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
import { buildDailyDigest, buildMonthlyDigest, buildTodaySnapshot } from "@/lib/digests";
import {
  sendDailyDigestEmail,
  sendMonthlyDigestEmail,
  setEmailImprint,
  type DigestStats,
} from "@/lib/email";
import { dateKeyInTimezone, localDowAndHHMM } from "@/lib/restaurant-hours";

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

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Shift a "YYYY-MM-DD" key by N days (noon-UTC anchor dodges DST edges). */
function addDaysToKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

type HoursRow = { dayOfWeek: number; isOpen: boolean; closeTime: string | null; closesNextDay: boolean };

/**
 * If this restaurant's business day ended within the last CLOSING_WINDOW_MIN
 * minutes (local clock), return the LOCAL day key that ended; else null.
 */
function dayThatJustEnded(rows: HoursRow[], tz: string, now: Date): string | null {
  const { dow, hhmm } = localDowAndHHMM(now, tz);
  const nowMin = toMin(hhmm);
  const todayKey = dateKeyInTimezone(now, tz);
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const yesterdayDow = (dow + 6) % 7;
  const todayRow = rows.find((r) => r.dayOfWeek === dow);
  const yesterdayRow = rows.find((r) => r.dayOfWeek === yesterdayDow);

  // 1. Yesterday's OVERNIGHT row closing in this morning's early hours
  //    (e.g. open 10:00 → 02:00: at 02:05 the previous day ended). This is the
  //    common late-night case — a 2 AM close sends at 2:05 AM.
  if (yesterdayRow?.isOpen && yesterdayRow.closesNextDay && yesterdayRow.closeTime) {
    if (inSendWindow(nowMin - toMin(yesterdayRow.closeTime))) return yesterdayKey;
  }
  // 2. Yesterday's late close (≥23:25) whose 5-min send mark spills past midnight
  //    (e.g. close 23:58 → send at 00:03). delta is measured across midnight.
  if (yesterdayRow?.isOpen && !yesterdayRow.closesNextDay && yesterdayRow.closeTime) {
    if (inSendWindow(nowMin - toMin(yesterdayRow.closeTime) + 24 * 60)) return yesterdayKey;
  }
  // 3. Today's normal close (e.g. close 22:00 → send at 22:05).
  if (todayRow?.isOpen && !todayRow.closesNextDay && todayRow.closeTime) {
    if (inSendWindow(nowMin - toMin(todayRow.closeTime))) return todayKey;
  }
  // 4. Closed (or hour-less) today → fall back to a 23:35-local send so any
  //    activity on a "closed" day (scheduled orders, reservations) still
  //    reports. Zero-activity days are skipped by the caller anyway.
  if (!todayRow?.isOpen || !todayRow.closeTime) {
    if (inSendWindow(nowMin - toMin("23:30"))) return todayKey;
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
      lastEodDigestDate: true,
      // Default (service-null) weekly rows drive the closing-time detection.
      openingHours: {
        where: { service: null },
        select: { dayOfWeek: true, isOpen: true, closeTime: true, closesNextDay: true },
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
    if (stats && reportDayKey && (stats.orders > 0 || stats.tableReservations > 0)) {
      setEmailImprint(imprint);
      try {
        await Promise.all(
          dailyRecipients.map((recipient) =>
            sendDailyDigestEmail({
              to: recipient.email,
              stats: stats!,
              dashboardUrl,
              unsubscribeUrl,
              locale: recipient.emailLanguage,
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
        if (mStats && (mStats.orders > 0 || mStats.tableReservations > 0)) {
          setEmailImprint(imprint);
          try {
            await Promise.all(
              monthlyRecipients.map((recipient) =>
                sendMonthlyDigestEmail({
                  to: recipient.email,
                  stats: mStats!,
                  dashboardUrl,
                  unsubscribeUrl,
                  locale: recipient.emailLanguage,
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

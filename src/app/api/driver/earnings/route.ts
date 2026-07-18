import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";
import { LATE_GRACE_MS } from "@/lib/driver-assignment";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/earnings — the driver Earnings tab's aggregate read
 * (v1.1 plan §3.4 / §5.5).
 *
 * ONE aggregate query (COUNT / SUM(tip) / SUM(deliveredAt−acceptedAt) /
 * late-case), grouped by LOCAL day + currency, over the session driver's
 * DELIVERED assignments. NOT a poll — one fetch per tab activation / pill
 * switch; the app's only intervals remain DriverQueue's 8s poll + 30s
 * heartbeat (plan §8).
 *
 * Params:
 *   - `from` / `to` — LOCAL calendar dates "YYYY-MM-DD", inclusive. The span
 *     is clamped: anything over MAX_RANGE_DAYS (35) days → 400. Week views
 *     send ≤7 days; the clamp is the abuse guard, not a UI limit.
 *   - `tz` — the device's RAW `new Date().getTimezoneOffset()` value, in
 *     MINUTES. JS sign convention (documented here because it trips everyone):
 *     getTimezoneOffset() = (UTC − local), POSITIVE west of UTC — Toronto EDT
 *     is +240, Tokyo is −540. The client sends it as-is and this route uses
 *     it as-is; nothing is negated in transit. So:
 *       local wall time = UTC deliveredAt − tz minutes   (the GROUP BY day)
 *       UTC window start = local midnight + tz minutes   (the WHERE range)
 *     Validation (plan §5.5, non-negotiable): must be an INTEGER within
 *     [−MAX_TZ_OFFSET_MINUTES, +MAX_TZ_OFFSET_MINUTES] = [−840, 840]
 *     (UTC±14h envelope), otherwise 400 — and it is a BOUND $queryRaw
 *     parameter (tagged template), NEVER string-interpolated into SQL.
 *
 * DOCUMENTED LIMITATION (plan §5.5): the offset is FIXED for the whole
 * requested range. If a DST transition falls inside a week view, deliveries
 * within ±1h of local midnight around the switch can bucket into the
 * neighbouring day (the device's CURRENT offset is applied to days that had
 * the other offset). Accepted trade-off — stated here rather than silently
 * wrong; exact bucketing would need IANA zone math in SQL.
 *
 * Late rule: the SQL CASE mirrors isDeliveryLate() in
 * src/lib/driver-assignment.ts EXACTLY — promised time =
 * COALESCE(scheduledFor, estimatedReady) (customer slot, else kitchen
 * estimate); LATE when the delivery landed STRICTLY more than the grace
 * window after it; no promised time → never late. The grace interval is
 * bound from the same LATE_GRACE_MS constant the TS helper uses, so the two
 * can never drift. We compare against deliveredAt: for delivered rows the
 * status route stamps completedAt := the same instant as deliveredAt, and
 * completedAt is exactly what the TS helper receives in /api/driver/history —
 * same rule, same clock.
 *
 * Index honesty (plan §5.5 — EXPLAIN (ANALYZE, BUFFERS) run on the dev
 * branch, 2026-07-17, read-only): at current dev volume DeliveryAssignment
 * is a single page, so the planner correctly SEQ-SCANS it (cost 1.02 —
 * cheaper than any index) and joins via Order_pkey / Restaurant_pkey; index
 * choice is cost-degenerate at that size. With enable_seqscan=off the
 * planner forms `Index Cond: driverId = $1` on a driverId-leading index and
 * filters status + the deliveredAt range — it picked [driverId, completedAt]
 * in an exact cost TIE with [driverId, status], which dev row counts cannot
 * break. Conclusion: once the table outgrows a page this is a driverId-
 * leading index scan; the plan's expected winner [driverId, status] (both
 * columns equality-matched) is the natural stats-driven pick at scale but is
 * NOT empirically distinguishable on dev data — re-EXPLAIN against prod
 * volume if this query ever surfaces in slow-query logs. Either way no new
 * index is warranted: per-driver row counts stay small and every candidate
 * is already driverId-prefixed.
 *
 * Money: `tips` is SUM(Order.tip) — dollars in the RESTAURANT's currency,
 * grouped per currency so multi-store drivers see one line per currency,
 * NEVER summed across currencies (client renders formatCurrency(amount,
 * currency) per group — the Fabrizio euro/$ bug class). hourlyRateCents is
 * not read here and is never multiplied into anything (plan §9: no fake
 * payroll); activeSeconds is honest "accepted → delivered" time, not shift
 * hours.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** Reject from→to spans longer than this (inclusive days). */
const MAX_RANGE_DAYS = 35;
/** UTC±14h envelope for the raw getTimezoneOffset() minutes value. */
const MAX_TZ_OFFSET_MINUTES = 840;

type AggRow = {
  day: string;
  currency: string;
  deliveries: number;
  tips: number;
  active_seconds: number;
  late: number;
};

export async function GET(req: NextRequest) {
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single-active-session: a superseded device gets 401 so it redirects to
  // login (same rule as every other driver endpoint).
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const tzRaw = params.get("tz");

  if (!fromRaw || !toRaw || !DATE_RE.test(fromRaw) || !DATE_RE.test(toRaw)) {
    return NextResponse.json({ error: "bad_range" }, { status: 400 });
  }
  // Parsed at UTC midnight purely as calendar-day arithmetic anchors; the tz
  // shift below turns them into the real UTC scan window. Impossible calendar
  // dates ("2026-02-31") parse to NaN and 400 here.
  const fromMs = Date.parse(`${fromRaw}T00:00:00.000Z`);
  const toMs = Date.parse(`${toRaw}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return NextResponse.json({ error: "bad_range" }, { status: 400 });
  }
  if ((toMs - fromMs) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "range_too_wide" }, { status: 400 });
  }

  // Number(null) and Number("") are BOTH 0 — check emptiness before coercing,
  // or a missing tz would silently mean UTC.
  if (tzRaw === null || tzRaw.trim() === "") {
    return NextResponse.json({ error: "bad_tz" }, { status: 400 });
  }
  const tz = Number(tzRaw);
  if (!Number.isInteger(tz) || tz < -MAX_TZ_OFFSET_MINUTES || tz > MAX_TZ_OFFSET_MINUTES) {
    return NextResponse.json({ error: "bad_tz" }, { status: 400 });
  }

  // UTC scan window for the local [from .. to] day range (see the sign-
  // convention note above): UTC = local + tz minutes, end exclusive.
  const utcFrom = new Date(fromMs + tz * 60_000);
  const utcTo = new Date(toMs + DAY_MS + tz * 60_000);

  // The one aggregate (plan §5.5). Tagged-template $queryRaw: every ${} below
  // — INCLUDING the tz offset and the grace seconds — is a bound parameter;
  // no request value is ever string-interpolated into the SQL text. Casts
  // (::int / ::float8) pin the aggregate output types so the driver returns
  // plain JS numbers (COUNT/SUM(int) are bigint, EXTRACT is numeric —
  // both would otherwise serialize as BigInt/Decimal).
  const rows = await prisma.$queryRaw<AggRow[]>`
    SELECT
      to_char((a."deliveredAt" - make_interval(mins => ${tz}::int))::date, 'YYYY-MM-DD') AS day,
      r."currency" AS currency,
      COUNT(*)::int AS deliveries,
      COALESCE(SUM(o."tip"), 0)::float8 AS tips,
      COALESCE(SUM(
        CASE WHEN a."acceptedAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a."deliveredAt" - a."acceptedAt"))
          ELSE 0 END
      ), 0)::float8 AS active_seconds,
      COALESCE(SUM(
        -- isDeliveryLate() mirrored in SQL (see header): promised =
        -- COALESCE(scheduledFor, estimatedReady); strictly-greater than
        -- promised + grace; NULL promised time never counts late. Grace is
        -- bound from the SAME LATE_GRACE_MS the TS helper uses.
        CASE WHEN COALESCE(o."scheduledFor", o."estimatedReady") IS NOT NULL
               AND a."deliveredAt" >
                   COALESCE(o."scheduledFor", o."estimatedReady")
                   + make_interval(secs => ${LATE_GRACE_MS / 1000}::float8)
          THEN 1 ELSE 0 END
      ), 0)::int AS late
    FROM "DeliveryAssignment" a
    JOIN "Order" o ON o."id" = a."orderId"
    JOIN "Restaurant" r ON r."id" = a."restaurantId"
    WHERE a."driverId" = ${driver.driverId}
      AND a."status" = 'delivered'
      AND a."deliveredAt" >= ${utcFrom}
      AND a."deliveredAt" < ${utcTo}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `;

  return NextResponse.json({
    rows: rows.map((r) => ({
      /** Local day "YYYY-MM-DD" (per the bound tz offset). */
      day: r.day,
      /** Restaurant order-money currency for this group — render per group, never sum across. */
      currency: r.currency,
      deliveries: r.deliveries,
      /** SUM(Order.tip) in `currency` dollars — what customers added at checkout. */
      tips: r.tips,
      /** SUM(deliveredAt − acceptedAt) in seconds — active time, not shift hours. */
      activeSeconds: r.active_seconds,
      late: r.late,
    })),
  });
}

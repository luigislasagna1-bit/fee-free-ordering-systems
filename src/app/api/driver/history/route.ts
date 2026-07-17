import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";
import { isDeliveryLate } from "@/lib/driver-assignment";
import { haversineKm } from "@/lib/geocode";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/history — the driver History tab's read (v1.1 plan §3.3/§5.4).
 *
 * Keyset-paginated on (completedAt DESC, id DESC) with `completedAt: { not:
 * null }`, served by the Phase 2 [driverId, completedAt] index. Select-only,
 * take-capped, no offset pagination. NOT a poll — one fetch per tab
 * activation + explicit "Load more"; the hot paths stay the 8s queue poll +
 * 30s heartbeat, untouched.
 *
 * The DRIVER list shows delivered | failed | returned ONLY. Cancelled rows
 * are deliberately excluded (plan §3.3, a stated product decision): a "can't
 * complete" either recycles the assignment to the pool (driverId nulled on
 * reoffer — no row to show) or closes it as cancelled on a dead order;
 * per-event release history needs an event log (deferred). Profile's
 * "Released" counter is the aggregate trace.
 *
 * List rows carry FULL detail (timeline stamps, money, feedback) — the
 * detail overlay renders from the already-fetched row and NO detail endpoint
 * exists (plan §5.4).
 *
 * Privacy: the customer's CITY only, never the street address post-delivery —
 * deliveryAddress is not even selected, so a future edit can't accidentally
 * leak it (plan §3.3). `deliveryCity` is nullable → null means the UI renders
 * nothing.
 *
 * Money: per-row currency (the restaurant's) rides along so the client
 * renders formatCurrency(amount, row.currency) — never a hardcoded usd()
 * (the Fabrizio euro/$ bug class). platformFeeCents is the FROZEN
 * restaurant-billing fee (PLATFORM_CURRENCY on render); it is never driver
 * compensation and the UI copy never implies payout (plan §9).
 */

/** Driver-visible terminal statuses (plan §3.3 — cancelled excluded). */
const DRIVER_HISTORY_STATUSES = ["delivered", "failed", "returned"];

const DEFAULT_TAKE = 30;
const MAX_TAKE = 50;

type Cursor = { completedAt: Date; id: string };

/**
 * Parse the composite keyset cursor "<completedAtEpochMs>_<assignmentId>"
 * (the values echoed back as `nextCursor`). Returns null when absent and
 * "malformed" for anything that doesn't parse — the route maps that to a
 * 400, never a 500. The ms epoch round-trips exactly: completedAt values
 * are JS-written (ms precision), so Date.getTime() equality is lossless.
 */
function parseCursor(raw: string | null): Cursor | null | "malformed" {
  if (!raw) return null;
  const sep = raw.indexOf("_");
  if (sep <= 0 || sep === raw.length - 1) return "malformed";
  const msPart = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!/^\d{1,15}$/.test(msPart)) return "malformed";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return "malformed";
  const ms = Number(msPart);
  if (!Number.isSafeInteger(ms)) return "malformed";
  const completedAt = new Date(ms);
  if (Number.isNaN(completedAt.getTime())) return "malformed";
  return { completedAt, id };
}

export async function GET(req: NextRequest) {
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single-active-session: a superseded device gets 401 so it redirects to
  // login (same rule as every other driver endpoint).
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const cursor = parseCursor(params.get("cursor"));
  if (cursor === "malformed") {
    return NextResponse.json({ error: "bad_cursor" }, { status: 400 });
  }
  // Clamped page size — a garbage `take` falls back to the default rather
  // than erroring (only a malformed cursor is contract-worthy of a 400).
  const takeRaw = Number.parseInt(params.get("take") ?? "", 10);
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), MAX_TAKE) : DEFAULT_TAKE;

  // take+1 so hasMore falls out of the same query (no COUNT).
  const rows = await prisma.deliveryAssignment.findMany({
    where: {
      driverId: driver.driverId,
      status: { in: DRIVER_HISTORY_STATUSES },
      // Keyset guard — old pre-backfill rows without a stamp never paginate
      // (v1.1 §5.1/§5.3 rule: all new reads guard not-null).
      completedAt: { not: null },
      ...(cursor
        ? {
            OR: [
              { completedAt: { lt: cursor.completedAt } },
              { completedAt: cursor.completedAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      startedAt: true,
      pickedUpAt: true,
      deliveredAt: true,
      failedAt: true,
      returnedAt: true,
      completedAt: true,
      platformFeeCents: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          total: true,
          tip: true,
          deliveryCity: true,
          deliveryLat: true,
          deliveryLng: true,
          scheduledFor: true,
          estimatedReady: true,
        },
      },
      restaurant: { select: { name: true, lat: true, lng: true, currency: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  // Feedback for the whole page via ONE batched IN query (no N+1) — served
  // by DriverFeedback @@index([orderId]); the IN list is take-capped (≤50).
  // driverId-scoped so only ratings ABOUT this driver ride along.
  const orderIds = page.map((r) => r.order.id);
  const feedbackRows = orderIds.length
    ? await prisma.driverFeedback.findMany({
        where: { orderId: { in: orderIds }, driverId: driver.driverId },
        select: { orderId: true, source: true, stars: true, comment: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const feedbackByOrder = new Map<string, { source: string; stars: number; comment: string | null; createdAt: Date }[]>();
  for (const f of feedbackRows) {
    if (!f.orderId) continue;
    const list = feedbackByOrder.get(f.orderId) ?? [];
    list.push({ source: f.source, stars: f.stars, comment: f.comment, createdAt: f.createdAt });
    feedbackByOrder.set(f.orderId, list);
  }

  const out = page.map((r) => {
    // Non-null by the where guard; Prisma types it nullable regardless.
    const completedAt = r.completedAt as Date;
    // Store-to-customer straight-line distance (restaurant → geocoded
    // drop-off), null-safe on both ends — the SAME number JobCard shows
    // pre-accept, labeled with the common.kmFromStore convention, never
    // "trip distance" (plan §3.3).
    const km =
      r.restaurant.lat != null && r.restaurant.lng != null && r.order.deliveryLat != null && r.order.deliveryLng != null
        ? Math.round(haversineKm(r.restaurant.lat, r.restaurant.lng, r.order.deliveryLat, r.order.deliveryLng) * 10) / 10
        : null;
    return {
      id: r.id,
      status: r.status,
      orderNumber: r.order.orderNumber,
      restaurantName: r.restaurant.name,
      /** Per-row order money currency (the restaurant's) — render via formatCurrency(amount, currency). */
      currency: r.restaurant.currency,
      total: r.order.total,
      tip: r.order.tip,
      /** Frozen restaurant-billing fee in cents (PLATFORM_CURRENCY); null until delivered froze it. */
      platformFeeCents: r.platformFeeCents,
      /** Customer CITY only — null renders nothing; never the street address. */
      city: r.order.deliveryCity ?? null,
      km,
      // Shared late rule (extracted in Phase 2 so this flag and the
      // lateCount bump can never drift) against the terminal stamp.
      late: isDeliveryLate(r.order, completedAt.getTime()),
      completedAt,
      acceptedAt: r.acceptedAt,
      startedAt: r.startedAt,
      pickedUpAt: r.pickedUpAt,
      deliveredAt: r.deliveredAt,
      failedAt: r.failedAt,
      returnedAt: r.returnedAt,
      feedback: feedbackByOrder.get(r.order.id) ?? [],
    };
  });

  const last = hasMore && page.length > 0 ? page[page.length - 1] : null;
  return NextResponse.json({
    rows: out,
    nextCursor: last ? `${(last.completedAt as Date).getTime()}_${last.id}` : null,
  });
}

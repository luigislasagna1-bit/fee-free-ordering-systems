import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ASSIGNMENT_TERMINAL } from "@/lib/driver-assignment";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feefree-delivery/deliveries
 *
 * Keyset-paginated list of TERMINAL delivery assignments for the calling
 * restaurant (v1.1 Phase 7, plan §4.3 / §5.4).
 *
 * Auth: getSessionUser() first; restaurantId ALWAYS from the session —
 * never from the client (AGENTS.md). 401 when absent.
 *
 * Keyset on (completedAt DESC, id DESC) with `completedAt: { not: null }`.
 * TERMINAL = delivered | failed | returned | cancelled. Cancelled rows
 * carry their stamp in `completedAt` (written by Phase 2 status route).
 *
 * Optional ?driverId= filter — used by the Phase 8 Drivers tab detail
 * sheet. Wired now so the route accepts it without error; the current UI
 * never sends it.
 *
 * Optional ?cursor=<base64url JSON {completedAt,id}> — 400 on malformed,
 * never 500.
 *
 * No N+1: the driver join is handled by Prisma's batched IN select;
 * the restaurant join (for per-row order currency) is a direct relation on
 * DeliveryAssignment so it too is a single IN pass.
 *
 * Scale: take=25, index-backed ([restaurantId, completedAt]), select-only.
 * The [restaurantId, completedAt] index from Phase 2 serves this query.
 * SEAM: a per-restaurant ~5 s micro-cache would further cut load at 10k
 * restaurants × keyset refreshes — same insertion point as the /ops cache.
 */

/** Shared terminal set (driver-assignment.ts) — never a local copy, so the
 *  route and the status-write path can't drift (Phase 7 review finding K1). */
const TERMINAL_STATUSES = [...ASSIGNMENT_TERMINAL];
const TAKE = 25;

type Cursor = { completedAt: string; id: string };

/**
 * Parse the base64url-encoded JSON cursor `{completedAt, id}`.
 * Returns null when absent, "malformed" on anything unparseable — the
 * route maps that to 400, never 500.
 */
function parseCursor(raw: string | null): Cursor | null | "malformed" {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    const obj = JSON.parse(decoded) as unknown;
    if (
      typeof obj !== "object" ||
      obj === null ||
      typeof (obj as Record<string, unknown>).completedAt !== "string" ||
      typeof (obj as Record<string, unknown>).id !== "string"
    ) {
      return "malformed";
    }
    const { completedAt, id } = obj as { completedAt: string; id: string };
    const d = new Date(completedAt);
    if (Number.isNaN(d.getTime())) return "malformed";
    // Sanity-check the id shape (cuid: ~25 chars, base58-ish alphanum+hyphen).
    if (id.length < 1 || id.length > 64) return "malformed";
    return { completedAt, id };
  } catch {
    return "malformed";
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate: getSessionUser() FALLS BACK to the kitchen session (path=/
  // cookie), and a kitchen login is designed not to grant the dispatch
  // surface (same rule as admin/layout.tsx). Gate on `role` — NOT
  // effectiveRole — so impersonating superadmins/resellers still pass.
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  const cursor = parseCursor(params.get("cursor"));
  if (cursor === "malformed") {
    return NextResponse.json({ error: "bad_cursor" }, { status: 400 });
  }

  // Optional driverId filter — Phase 8 Drivers tab detail sheet will send
  // this. Wired now so the route accepts it; current callers never send it.
  //
  // Client-supplied, so NEVER trusted (AGENTS.md): it is only ever ANDed with
  // the session-derived restaurantId below, so a foreign driver's id can only
  // intersect to an empty page — it can never widen the query across
  // restaurants. Obviously-invalid shapes (empty, oversized, non-cuid
  // characters) are rejected outright instead of being sent to the DB.
  const rawDriverId = params.get("driverId");
  if (rawDriverId !== null && !/^[a-zA-Z0-9_-]{1,64}$/.test(rawDriverId)) {
    return NextResponse.json({ error: "bad_driver_id" }, { status: 400 });
  }
  const driverIdFilter = rawDriverId ?? undefined;

  const cursorDate = cursor ? new Date(cursor.completedAt) : null;

  // take+1 so hasMore falls out of the same query (no COUNT).
  const rows = await prisma.deliveryAssignment.findMany({
    where: {
      restaurantId,
      status: { in: TERMINAL_STATUSES },
      // Keyset guard — pre-backfill rows without a stamp never paginate
      // (v1.1 §5.1/§5.3 rule: all new reads guard not-null).
      completedAt: { not: null },
      ...(driverIdFilter ? { driverId: driverIdFilter } : {}),
      ...(cursorDate
        ? {
            OR: [
              { completedAt: { lt: cursorDate } },
              { completedAt: cursorDate, id: { lt: cursor!.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: TAKE + 1,
    select: {
      id: true,
      status: true,
      completedAt: true,
      // Order fields needed by the list row and detail overlay.
      // currency comes via the restaurant relation (Order has no own
      // currency column — it lives on Restaurant).
      order: {
        select: {
          orderNumber: true,
          customerName: true,
          deliveryAddress: true,
          deliveryCity: true,
          total: true,
          tip: true,
        },
      },
      // Restaurant currency for formatCurrency(amount, row.currency) —
      // the Fabrizio euro/$ rule: never hardcode usd(), always per-row.
      // DeliveryAssignment has a direct restaurant relation so Prisma
      // handles this as a single batched IN pass alongside the order join.
      restaurant: {
        select: { currency: true },
      },
      // Driver name + ratingPct for the list row; phone excluded (Phase 8).
      // Prisma batches this as a single IN query — no N+1.
      driver: {
        select: { name: true, ratingPct: true },
      },
    },
  });

  const hasMore = rows.length > TAKE;
  const page = hasMore ? rows.slice(0, TAKE) : rows;

  const last = hasMore && page.length > 0 ? page[page.length - 1] : null;
  const nextCursor = last
    ? Buffer.from(
        JSON.stringify({
          completedAt: (last.completedAt as Date).toISOString(),
          id: last.id,
        }),
      ).toString("base64url")
    : null;

  return NextResponse.json({
    rows: page.map((r) => ({
      id: r.id,
      status: r.status,
      completedAt: (r.completedAt as Date).toISOString(),
      order: {
        orderNumber: r.order.orderNumber,
        customerName: r.order.customerName,
        deliveryStreet: r.order.deliveryAddress ?? null,
        deliveryCity: r.order.deliveryCity ?? null,
        total: r.order.total,
        tip: r.order.tip,
        /** Restaurant's own currency — render with formatCurrency(amount, currency). */
        currency: r.restaurant.currency,
      },
      driver: r.driver
        ? { name: r.driver.name, ratingPct: r.driver.ratingPct }
        : null,
    })),
    nextCursor,
  });
}

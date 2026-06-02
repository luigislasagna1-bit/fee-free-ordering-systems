/**
 * POST /api/kitchen/orders/clear
 *
 * Server-side equivalent of the kitchen tablet's "Clear orders" /
 * "Clear complete" buttons. Marks every order matching the chosen
 * scope as dismissed from the kitchen display, so every device that
 * polls the orders list sees the same shrunken result.
 *
 * Body:
 *   { scope: "orders" | "complete" }
 *
 *   "orders"   — sweep the All tab: everything in the standard
 *                kitchen feed except pending (we never silently lose
 *                a pending order — those need an explicit
 *                accept/reject decision before they can be cleared).
 *   "complete" — sweep the Complete tab: completed / rejected /
 *                cancelled rows.
 *
 * Returns: { ok: true, cleared: <count> }
 *
 * Background: previously each kitchen device kept its own
 * `kds-cleared-orders` Set in localStorage. Different tablets ended
 * up with different visible lists. Luigi 2026-06-02 asked for a
 * single-active-session model AND identical state on every login —
 * this endpoint is the server-truth side of that.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, checkKitchenSessionFresh } from "@/lib/session";
import prisma from "@/lib/db";

const COMPLETE_STATUSES = ["completed", "rejected", "cancelled"];

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser({ preferKitchen: true });
    const role = user?.role;
    if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const restaurantId = user.restaurantId;
    if (!restaurantId) {
      return NextResponse.json({ error: "no_restaurant" }, { status: 400 });
    }

    // Single-active-kitchen-session enforcement. A stale tablet
    // shouldn't be able to mass-dismiss the active device's orders.
    const freshness = await checkKitchenSessionFresh();
    if (freshness === "stale") {
      return NextResponse.json(
        { error: "session_superseded", code: "session_superseded" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const scope: "orders" | "complete" =
      body?.scope === "complete" ? "complete" : "orders";

    const now = new Date();
    const baseWhere = {
      restaurantId,
      clearedFromKitchenAt: null as Date | null,
    };

    const where =
      scope === "complete"
        ? { ...baseWhere, status: { in: COMPLETE_STATUSES } }
        : // "orders" sweeps everything that's currently visible on the All
          // tab. We explicitly exclude pending so an unanswered customer
          // order can't be hidden without a real accept/reject decision.
          { ...baseWhere, status: { not: "pending" } };

    const res = await prisma.order.updateMany({
      where,
      data: { clearedFromKitchenAt: now },
    });

    return NextResponse.json({ ok: true, cleared: res.count });
  } catch (err: any) {
    console.error("[kitchen/orders/clear POST]", err);
    return NextResponse.json(
      { error: err.message ?? "clear_failed" },
      { status: 500 },
    );
  }
}

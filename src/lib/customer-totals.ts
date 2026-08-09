/**
 * Customer lifetime counters (Customer.totalOrders / totalSpent /
 * totalCreditSpent) — the SELF-HEALING sync.
 *
 * Why (Luigi 2026-08-09, "collected amounts seem inaccurate"): the counters
 * are incremented at ORDER CREATE (api/orders/route.ts) and were never
 * adjusted when an order was later rejected or cancelled, so they drift high
 * forever — a customer's $176.46 cancelled order stayed in their "Order
 * value" and "Collected" for life. The customer DETAIL page and the Clients
 * report both already recompute live with the canonical report predicate
 * (drops rejected/cancelled + TEST-) precisely because of this drift; the
 * Customers LIST, the clients-CSV fallback, and autopilot's
 * `totalOrders >= 1` segments still trust the stored counters.
 *
 * Fix strategy: RECOMPUTE, never decrement. A decrement fires once per
 * transition and double-fires on a repeated/raced transition; a recompute is
 * idempotent — any number of calls converge on the truth. It runs only on the
 * kill transitions (rare), one indexed aggregate (@@index([customerId])), so
 * the hot paths never pay for it.
 *
 * Callers (every place an ORDER becomes rejected/cancelled):
 *   - api/orders/[id]/route.ts        (central staff/kitchen PATCH kill flow)
 *   - api/public/orders/[id]/cancel   (guest self-cancel)
 *   - lib/auto-reject-orders.ts       (auto-reject + abandoned-payment sweeps)
 * A NEW kill path must call syncCustomerTotalsForOrder(orderId) too.
 *
 * Deliberately NOT synced: lastOrderAt — that's marketing recency (autopilot
 * win-back timing), and a cancelled order is still real "last activity".
 *
 * Backfill for pre-existing drift: scripts/backfill-customer-lifetime-totals.ts.
 */
import prisma from "@/lib/db";
import { REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { MONEY_SUM } from "@/lib/reports/collected";

/** Recompute the three lifetime counters for one customer from the order
 *  table, using the same canonical predicate every report uses. Best-effort:
 *  logs and swallows errors so a kill flow never fails on bookkeeping. */
export async function syncCustomerLifetimeTotals(customerId: string): Promise<void> {
  try {
    const agg = await prisma.order.aggregate({
      where: { customerId, ...REPORT_ORDER_STATUS_WHERE },
      _count: true,
      _sum: MONEY_SUM,
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        totalOrders: agg._count,
        totalSpent: agg._sum.total ?? 0,
        totalCreditSpent: agg._sum.creditApplied ?? 0,
      },
    });
  } catch (e) {
    console.error(`[customer-totals] sync failed for customer ${customerId}:`, e);
  }
}

/** Convenience for kill flows that only hold the order id. No-ops for guest
 *  orders with no customer row. Never throws. */
export async function syncCustomerTotalsForOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    if (!order?.customerId) return;
    await syncCustomerLifetimeTotals(order.customerId);
  } catch (e) {
    console.error(`[customer-totals] order lookup failed for ${orderId}:`, e);
  }
}

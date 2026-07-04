import "server-only";
import prisma from "@/lib/db";
import { reportOrderWhere } from "@/lib/reports/order-filter";

/**
 * Promotions Stats row-builder — shared by the /admin/reports/online-ordering/
 * promotions page and its CSV/XLS export so they can never disagree.
 *
 * Groups by the PROMOTION actually applied (each order's `appliedPromos` JSON
 * snapshot — name + optional coupon code + per-promo discount), NOT the legacy
 * `Order.couponId` column. Coupons were retired into hidden promos (Program 1,
 * 2026-06-26): grouping by couponId showed ONLY legacy coupon redemptions and
 * silently omitted every modern promotion. Orders from before the snapshot
 * existed (couponId set, appliedPromos empty) still roll up as a legacy-coupon
 * row, so history doesn't vanish.
 *
 * Semantics: `redemptions` = orders the promo applied to; `revenue` = the sum
 * of those orders' totals (an order with two promos counts toward BOTH rows —
 * per-promo revenue attribution, GloriaFood-style); `discount` = that promo's
 * own discount only, so the discount column always sums to the real total
 * discount given.
 *
 * Scale note (per AGENTS.md): fetches the range's promo-bearing orders into
 * Node because the snapshot is JSON (no SQL groupBy). Admin-only, bounded by
 * the date range, small select — same trade-off as summary-rows.ts.
 */

export type PromoStatRow = {
  /** Coupon/redeem code when the promo has one, else "" (visible promo). */
  code: string;
  /** Promotion name (or the legacy coupon's description). */
  name: string;
  redemptions: number;
  discount: number;
  revenue: number;
};

export async function buildPromoStatRows(
  restaurant: string | string[],
  range: { from: Date; to: Date },
): Promise<{ rows: PromoStatRow[]; totalRedemptions: number; totalDiscount: number; totalRevenue: number }> {
  const orders = await prisma.order.findMany({
    where: {
      ...reportOrderWhere(restaurant, range),
      OR: [
        { appliedPromos: { not: null } },
        { couponId: { not: null } },
      ],
    },
    select: { appliedPromos: true, couponId: true, couponDiscount: true, total: true },
  });

  type Acc = PromoStatRow & { legacyCouponId?: string };
  const map = new Map<string, Acc>();
  const bump = (key: string, seed: Omit<Acc, "redemptions" | "discount" | "revenue">, discount: number, revenue: number) => {
    let row = map.get(key);
    if (!row) { row = { ...seed, redemptions: 0, discount: 0, revenue: 0 }; map.set(key, row); }
    row.redemptions += 1;
    row.discount += discount;
    row.revenue += revenue;
  };

  const legacyIds = new Set<string>();
  for (const o of orders) {
    let promos: Array<{ name?: string; type?: string; discount?: number; couponCode?: string }> = [];
    const raw: unknown = (o as any).appliedPromos;
    if (Array.isArray(raw)) promos = raw as any[];
    else if (typeof raw === "string" && raw.trim()) {
      try { const p = JSON.parse(raw); if (Array.isArray(p)) promos = p; } catch { /* skip */ }
    }
    if (promos.length > 0) {
      for (const p of promos) {
        if (!p) continue;
        const name = (p.name ?? "").trim() || "—";
        const code = (p.couponCode ?? "").trim();
        bump(`p:${name}|${code}`, { code, name }, Number(p.discount ?? 0) || 0, o.total);
      }
    } else if (o.couponId) {
      // Pre-snapshot legacy order — attribute to its coupon.
      legacyIds.add(o.couponId);
      bump(`c:${o.couponId}`, { code: "", name: "", legacyCouponId: o.couponId }, o.couponDiscount ?? 0, o.total);
    }
  }

  // Resolve legacy coupon codes/descriptions in one small query.
  if (legacyIds.size > 0) {
    const coupons = await prisma.coupon.findMany({
      where: { id: { in: [...legacyIds] } },
      select: { id: true, code: true, description: true },
    });
    const byId = new Map(coupons.map((c) => [c.id, c]));
    for (const row of map.values()) {
      if (!row.legacyCouponId) continue;
      const c = byId.get(row.legacyCouponId);
      row.code = c?.code ?? "—";
      row.name = c?.description ?? "—";
    }
  }

  const rows = [...map.values()]
    .map(({ legacyCouponId: _drop, ...r }) => ({ ...r, discount: round2(r.discount), revenue: round2(r.revenue) }))
    .sort((a, b) => b.redemptions - a.redemptions || b.discount - a.discount);
  return {
    rows,
    totalRedemptions: rows.reduce((s, r) => s + r.redemptions, 0),
    totalDiscount: round2(rows.reduce((s, r) => s + r.discount, 0)),
    totalRevenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
  };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

import "server-only";
import prisma from "@/lib/db";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { dateKeyInTimezone } from "@/lib/restaurant-hours";
import { toISODate } from "@/lib/reports/date-range";

/**
 * Sales Summary row-builder — the GloriaFood "Summary" table.
 *
 * Returns one row per group with the SAME money breakdown the End-of-Day report
 * shows (subtotal / tax / delivery fee / tips / other fees / total), so the
 * Summary reconciles with EOD. `otherFees` is summed from each order's
 * `appliedServiceFees` JSON exactly like `digests.ts` — not a residual — so a
 * discount never shows up as a negative "fee".
 *
 * Grouping dimensions: Day / Week / Month (bucketed in the restaurant's
 * timezone) + Payment method / Order type.
 *
 * Scale note (per AGENTS.md): this fetches the range's orders into Node and
 * buckets in JS, because Prisma `groupBy` can't date_trunc and can't sum the
 * service-fee JSON — and a `take` cap would silently undercount (an accuracy
 * bug, the opposite of the goal here). It's an ADMIN-only, low-concurrency
 * report and the row set is bounded by the chosen range (thousands of orders,
 * a handful of small columns). If a restaurant ever pulls multi-year ranges at
 * volume, the seam to move to a `date_trunc` raw-SQL aggregate is right here.
 */

export type SummaryDim = "day" | "week" | "month" | "paymentMethod" | "type";

export type SummaryRow = {
  /** Raw bucket key (date key / monday key / "YYYY-MM" / payment / type). */
  key: string;
  /** Sort key (chronological for time dims; the page sorts $ dims by total). */
  sortKey: string;
  orders: number;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  tips: number;
  otherFees: number;
  total: number;
};

const DIMS: SummaryDim[] = ["day", "week", "month", "paymentMethod", "type"];

export function isSummaryDim(v: unknown): v is SummaryDim {
  return typeof v === "string" && (DIMS as string[]).includes(v);
}

/** Sum an order's appliedServiceFees JSON → the "Other fees" line (digests.ts). */
function parseServiceFees(raw: unknown): number {
  let fees: any[] = Array.isArray(raw) ? (raw as any[]) : [];
  if (!fees.length && typeof raw === "string") {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) fees = p; } catch {}
  }
  let sum = 0;
  for (const f of fees) { const a = Number(f?.amount); if (Number.isFinite(a)) sum += a; }
  return sum;
}

/** Monday-of-week key for a tz-resolved YYYY-MM-DD day key (week starts Monday). */
function mondayKeyOf(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  const deltaToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - deltaToMonday);
  return d.toISOString().slice(0, 10);
}

function bucketKey(createdAt: Date, type: string | null, paymentMethod: string | null, dim: SummaryDim, tz?: string): string {
  if (dim === "paymentMethod") return paymentMethod || "—";
  if (dim === "type") return type || "—";
  const dayKey = tz ? dateKeyInTimezone(createdAt, tz) : toISODate(createdAt);
  if (dim === "day") return dayKey;
  if (dim === "week") return mondayKeyOf(dayKey);
  return dayKey.slice(0, 7); // month → "YYYY-MM"
}

export async function buildSummaryRows(
  restaurant: string | string[],
  range: { from: Date; to: Date },
  dim: SummaryDim,
  tz?: string,
): Promise<{ rows: SummaryRow[]; totals: SummaryRow }> {
  const orders = await prisma.order.findMany({
    where: reportOrderWhere(restaurant, range),
    select: {
      createdAt: true, type: true, paymentMethod: true,
      subtotal: true, taxAmount: true, deliveryFee: true, tip: true,
      appliedServiceFees: true, total: true,
    },
  });

  const blank = (key: string): SummaryRow => ({
    key, sortKey: key, orders: 0, subtotal: 0, tax: 0, deliveryFee: 0, tips: 0, otherFees: 0, total: 0,
  });
  const totals = blank("__total__");
  const map = new Map<string, SummaryRow>();

  for (const o of orders) {
    const key = bucketKey(o.createdAt, o.type, o.paymentMethod, dim, tz);
    let row = map.get(key);
    if (!row) { row = blank(key); map.set(key, row); }
    const fees = parseServiceFees((o as any).appliedServiceFees);
    row.orders += 1;          totals.orders += 1;
    row.subtotal += o.subtotal;        totals.subtotal += o.subtotal;
    row.tax += o.taxAmount ?? 0;       totals.tax += o.taxAmount ?? 0;
    row.deliveryFee += o.deliveryFee ?? 0; totals.deliveryFee += o.deliveryFee ?? 0;
    row.tips += o.tip ?? 0;            totals.tips += o.tip ?? 0;
    row.otherFees += fees;             totals.otherFees += fees;
    row.total += o.total;             totals.total += o.total;
  }

  const timeDim = dim === "day" || dim === "week" || dim === "month";
  const rows = Array.from(map.values()).sort((a, b) =>
    timeDim ? a.sortKey.localeCompare(b.sortKey) : b.total - a.total,
  );
  return { rows, totals };
}

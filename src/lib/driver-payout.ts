/**
 * B5 — driver weekly payout ledger engine + refund reconciliation.
 *
 * Fee Free pays drivers MANUALLY (Luigi 2026-07-24), HOURLY (Driver.hourlyRateCents)
 * for ALL clocked time (Q4) + 100% of their frozen tips. One DriverPayout row per
 * (driverId, weekStart) — the Saturday→Friday America/Toronto week (shared with the
 * restaurant settlement). The `paid` flag is the only guard against paying twice, so
 * a paid row is IMMUTABLE: the build never overwrites it.
 *
 * All money is derived from FROZEN per-delivery values (driverTipCents) + shift
 * durations, so a rebuild is deterministic and idempotent.
 */
import prisma from "@/lib/db";
import { deliveryWeekStart, deliveryWeekEnd } from "@/lib/feefree-delivery";

const clamp0 = (n: number) => (n < 0 ? 0 : n);

export type DriverPayoutBuildRow = {
  driverId: string;
  driverName: string;
  weekStart: Date;
  deliveries: number;
  workedSeconds: number;
  hourlyRateCents: number;
  hourlyPayCents: number;
  tipsCents: number;
  adjustmentCents: number;
  totalCents: number;
  currency: string | null;
  status: "pending" | "paid" | "skipped-paid";
  currencyConflict?: string[]; // present when a driver-week spans >1 tip currency (N6)
};

/** Seconds of a closed shift [in,out] that fall inside [weekStart, weekEnd). Splits a
 *  shift that straddles the Saturday boundary so neither week over-pays (critique F1). */
function shiftOverlapSeconds(clockInAt: Date, clockOutAt: Date, weekStart: Date, weekEnd: Date): number {
  const start = Math.max(clockInAt.getTime(), weekStart.getTime());
  const end = Math.min(clockOutAt.getTime(), weekEnd.getTime());
  return end > start ? Math.round((end - start) / 1000) : 0;
}

/**
 * Build/refresh the pending DriverPayout rows for the Sat→Fri week containing
 * `weekStart` (snapped). Idempotent on (driverId, weekStart): a `paid` row is left
 * untouched (immutable); a pending row is recomputed but its `adjustmentCents`
 * (clawback carry-in) is PRESERVED. Only drivers with a delivery or a shift in the
 * week get a row. Returns what it built (for the superadmin response).
 */
export async function buildDriverPayoutsForWeek(opts: { weekStart: Date }): Promise<DriverPayoutBuildRow[]> {
  const weekStart = deliveryWeekStart(opts.weekStart);
  const weekEnd = deliveryWeekEnd(weekStart);

  // Deliveries + frozen tips per (driver, currency) — one grouped scan on the
  // [driverId, status, deliveredAt] index. Currency split surfaces N6 conflicts.
  const tipGroups = await prisma.deliveryAssignment.groupBy({
    by: ["driverId", "tipCurrency"],
    where: { status: "delivered", driverId: { not: null }, deliveredAt: { gte: weekStart, lt: weekEnd } },
    _count: { _all: true },
    _sum: { driverTipCents: true },
  });

  // Closed shifts overlapping the week — summed with boundary-splitting in JS.
  const shifts = await prisma.driverShift.findMany({
    where: { clockOutAt: { not: null }, clockInAt: { lt: weekEnd }, AND: [{ clockOutAt: { gt: weekStart } }] },
    select: { driverId: true, clockInAt: true, clockOutAt: true },
  });

  // Assemble per-driver aggregates.
  type Agg = { deliveries: number; tipsCents: number; currencies: Map<string, number>; workedSeconds: number };
  const byDriver = new Map<string, Agg>();
  const ensure = (id: string): Agg => {
    let a = byDriver.get(id);
    if (!a) { a = { deliveries: 0, tipsCents: 0, currencies: new Map(), workedSeconds: 0 }; byDriver.set(id, a); }
    return a;
  };
  for (const g of tipGroups) {
    if (!g.driverId) continue;
    const a = ensure(g.driverId);
    a.deliveries += g._count._all;
    const cents = g._sum.driverTipCents ?? 0;
    a.tipsCents += cents;
    if (g.tipCurrency) a.currencies.set(g.tipCurrency, (a.currencies.get(g.tipCurrency) ?? 0) + cents);
  }
  for (const s of shifts) {
    if (!s.clockOutAt) continue;
    ensure(s.driverId).workedSeconds += shiftOverlapSeconds(s.clockInAt, s.clockOutAt, weekStart, weekEnd);
  }

  if (byDriver.size === 0) return [];

  const drivers = await prisma.driver.findMany({
    where: { id: { in: [...byDriver.keys()] } },
    select: { id: true, name: true, hourlyRateCents: true },
  });
  const driverMeta = new Map(drivers.map((d) => [d.id, d]));

  const results: DriverPayoutBuildRow[] = [];
  for (const [driverId, agg] of byDriver) {
    const meta = driverMeta.get(driverId);
    if (!meta) continue; // driver deleted mid-week — skip

    const currencies = [...agg.currencies.keys()];
    const currency = currencies[0] ?? null;
    const currencyConflict = currencies.length > 1 ? currencies : undefined;

    const hourlyRateCents = meta.hourlyRateCents ?? 0;
    const hourlyPayCents = Math.round((agg.workedSeconds / 3600) * hourlyRateCents);

    // Read-then-conditional-write (critique F2 — NOT an upsert: an upsert would
    // overwrite a paid row's frozen snapshot). Preserve a pending row's adjustment.
    const existing = await prisma.driverPayout.findUnique({
      where: { driverId_weekStart: { driverId, weekStart } },
      select: { id: true, status: true, adjustmentCents: true },
    });
    if (existing?.status === "paid") {
      results.push({
        driverId, driverName: meta.name, weekStart, deliveries: agg.deliveries,
        workedSeconds: agg.workedSeconds, hourlyRateCents, hourlyPayCents,
        tipsCents: agg.tipsCents, adjustmentCents: 0, currency,
        totalCents: hourlyPayCents + agg.tipsCents, status: "skipped-paid", currencyConflict,
      });
      continue;
    }
    const adjustmentCents = existing?.adjustmentCents ?? 0;
    const totalCents = hourlyPayCents + agg.tipsCents + adjustmentCents;
    const rowData = {
      deliveries: agg.deliveries, workedSeconds: agg.workedSeconds, hourlyRateCents,
      hourlyPayCents, tipsCents: agg.tipsCents, adjustmentCents, totalCents, currency,
    };
    if (existing) {
      await prisma.driverPayout.update({ where: { id: existing.id }, data: rowData });
    } else {
      await prisma.driverPayout.create({ data: { driverId, weekStart, status: "pending", ...rowData } });
    }
    results.push({
      driverId, driverName: meta.name, weekStart, ...rowData, status: "pending", currencyConflict,
    });
  }
  return results;
}

/**
 * Recompute a delivery's frozen tip after the customer is refunded, and reconcile
 * the driver's payout (critique Blocker B2 — idempotent, cumulative-based, runs on
 * partial AND full). The frozen tip is set to its ABSOLUTE new value from the
 * IMMUTABLE original + cumulative refund, so double-firing is safe:
 *   newTip = clamp0(round(originalTipCents × (1 − refundedTotal/chargedTotal)))
 * If the delivery's payout week is already PAID, the reduction is carried as a
 * NEGATIVE adjustmentCents onto the CURRENT week's pending payout (Q6 clawback);
 * if still pending/unbuilt, updating the frozen tip is enough — the next build
 * recomputes tipsCents from it.
 */
export async function reconcileTipRefund(opts: {
  assignmentId: string;
  driverId: string | null;
  deliveredAt: Date | null;
  originalTipCents: number;
  chargedTotal: number;
  refundedTotal: number;
  now: Date;
}): Promise<void> {
  const { assignmentId, driverId, deliveredAt, originalTipCents, chargedTotal, refundedTotal, now } = opts;
  const fraction = chargedTotal > 0 ? refundedTotal / chargedTotal : 1;
  const newTipCents = clamp0(Math.round(originalTipCents * (1 - fraction)));

  const current = await prisma.deliveryAssignment.findUnique({
    where: { id: assignmentId },
    select: { driverTipCents: true },
  });
  const oldTipCents = current?.driverTipCents ?? originalTipCents;
  if (newTipCents === oldTipCents) return; // idempotent no-op on a repeated refund

  await prisma.deliveryAssignment.update({
    where: { id: assignmentId },
    data: { driverTipCents: newTipCents },
  });

  const delta = newTipCents - oldTipCents; // negative on a refund
  if (delta >= 0 || !driverId || !deliveredAt) return;

  const deliveredWeek = deliveryWeekStart(deliveredAt);
  const paidRow = await prisma.driverPayout.findUnique({
    where: { driverId_weekStart: { driverId, weekStart: deliveredWeek } },
    select: { status: true },
  });
  if (paidRow?.status !== "paid") return; // pending/unbuilt → next build corrects it

  // Already paid → carry the clawback into THIS week as a negative adjustment.
  const carryWeek = deliveryWeekStart(now);
  const existing = await prisma.driverPayout.findUnique({
    where: { driverId_weekStart: { driverId, weekStart: carryWeek } },
    select: { id: true, status: true, adjustmentCents: true, hourlyPayCents: true, tipsCents: true },
  });
  if (existing && existing.status !== "paid") {
    const adjustmentCents = existing.adjustmentCents + delta;
    await prisma.driverPayout.update({
      where: { id: existing.id },
      data: { adjustmentCents, totalCents: existing.hourlyPayCents + existing.tipsCents + adjustmentCents },
    });
  } else if (!existing) {
    await prisma.driverPayout.create({
      data: { driverId, weekStart: carryWeek, status: "pending", adjustmentCents: delta, totalCents: delta },
    });
  }
  // If the carry week is ALSO already paid, the next build re-adds the adjustment
  // (preserved), and a superadmin resolves the residue manually — logged, not lost.
}

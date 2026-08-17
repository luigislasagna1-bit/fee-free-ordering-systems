/**
 * Nabil AI overage cron engine — one invoice item per restaurant per closed
 * month, on the PLATFORM Stripe customer, guarded three ways against a double
 * bill (ledger row unique on restaurant+period, deterministic Stripe
 * idempotency key, adopt-existing on retry). Comp rows are metered, never billed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, stripeMock, stripeReadyMock, usageMock } = vi.hoisted(() => ({
  prismaMock: {
    restaurantAddOn: { findMany: vi.fn() },
    nabilUsageCharge: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
  stripeMock: {
    invoiceItems: { create: vi.fn(), list: vi.fn() },
  },
  stripeReadyMock: vi.fn(),
  usageMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => Promise.resolve(stripeMock), stripeReady: stripeReadyMock }));
vi.mock("@/lib/marketplace", () => ({ PLATFORM_CURRENCY: "usd" }));
vi.mock("@/lib/voice/nabil-usage", () => ({ fetchNabilUsageByRestaurant: usageMock }));

import { runNabilUsageBilling, nabilUsageIdempotencyKey, nabilUsageDescription } from "./nabil-usage-billing";

const NOW = new Date("2026-08-01T00:15:00.000Z"); // the cron tick — bills July 2026
const JULY = new Date("2026-07-01T00:00:00.000Z");
const AUG = new Date("2026-08-01T00:00:00.000Z");

const paidRow = (id: string, name = "Pizzeria") => ({
  restaurantId: id,
  stripeSubscriptionId: `sub_${id}`,
  restaurant: { name, stripeCustomerId: `cus_${id}` },
});
const compRow = (id: string) => ({
  restaurantId: id,
  stripeSubscriptionId: null,
  restaurant: { name: "Luigi's", stripeCustomerId: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  stripeReadyMock.mockResolvedValue(true);
  prismaMock.nabilUsageCharge.findUnique.mockResolvedValue(null);
  prismaMock.nabilUsageCharge.upsert.mockImplementation(async (args: any) => ({ id: `chg_${args.create.restaurantId}`, ...args.create }));
  prismaMock.nabilUsageCharge.update.mockResolvedValue({});
  stripeMock.invoiceItems.create.mockResolvedValue({ id: "ii_1" });
  stripeMock.invoiceItems.list.mockResolvedValue({ data: [] });
  usageMock.mockResolvedValue(new Map());
});

describe("nabilUsageIdempotencyKey / nabilUsageDescription", () => {
  it("key is deterministic per restaurant + month", () => {
    expect(nabilUsageIdempotencyKey("r1", "2026-07")).toBe("nabil-usage-r1-2026-07");
  });
  it("description names the month, minutes, allowance and extra minutes", () => {
    expect(nabilUsageDescription(JULY, 512)).toBe("Nabil AI call minutes — July 2026: 512 min (416 included) · 96 extra × US$0.60");
    expect(nabilUsageDescription(JULY, 100)).toBe("Nabil AI call minutes — July 2026: 100 min (416 included) · 0 extra × US$0.60");
  });
});

describe("runNabilUsageBilling — the closed month", () => {
  it("bills July when run on Aug 1: ONE invoice item, platform customer, idempotency key, ledger row invoiced", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }]]));

    const out = await runNabilUsageBilling({ now: NOW });

    expect(out.period).toBe("2026-07");
    expect(out.monthStart.toISOString()).toBe(JULY.toISOString());
    // The usage aggregate ran ONCE for the whole set, over [Jul 1, Aug 1).
    expect(usageMock).toHaveBeenCalledTimes(1);
    expect(usageMock).toHaveBeenCalledWith(["r1"], JULY, AUG);
    // 512 min → 30720¢ − 24999¢ = 5721¢ overage.
    expect(out.results).toEqual([
      expect.objectContaining({ restaurantId: "r1", period: "2026-07", calls: 40, minutes: 512, overageCents: 5721, status: "invoiced", stripeInvoiceItemId: "ii_1" }),
    ]);
    expect(stripeMock.invoiceItems.create).toHaveBeenCalledTimes(1);
    const [params, opts] = stripeMock.invoiceItems.create.mock.calls[0];
    expect(params).toMatchObject({
      customer: "cus_r1",
      amount: 5721,
      currency: "usd",
      description: "Nabil AI call minutes — July 2026: 512 min (416 included) · 96 extra × US$0.60",
      period: { start: Math.floor(JULY.getTime() / 1000), end: Math.floor(AUG.getTime() / 1000) },
      metadata: expect.objectContaining({ type: "nabil_usage", restaurantId: "r1", period: "2026-07", minutes: "512", calls: "40" }),
    });
    // Customer-level item: NOT pinned to a subscription (rides the next invoice).
    expect(params.subscription).toBeUndefined();
    expect(opts).toEqual({ idempotencyKey: "nabil-usage-r1-2026-07" });
    // Ledger: pending first, then stamped invoiced with the item id.
    expect(prismaMock.nabilUsageCharge.upsert.mock.calls[0][0].create).toMatchObject({ restaurantId: "r1", period: "2026-07", minutes: 512, overageCents: 5721, status: "pending" });
    expect(prismaMock.nabilUsageCharge.update).toHaveBeenCalledWith({
      where: { id: "chg_r1" },
      data: { status: "invoiced", stripeInvoiceItemId: "ii_1", failureReason: null },
    });
  });

  it("≤ 416 minutes → no Stripe call, ledger row 'none' (0 min and exactly 416 min alike)", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r0"), paidRow("r416")]);
    usageMock.mockResolvedValue(new Map([["r416", { calls: 30, minutes: 416 }]])); // r0 absent = no calls

    const out = await runNabilUsageBilling({ now: NOW });

    expect(stripeMock.invoiceItems.create).not.toHaveBeenCalled();
    expect(out.results.map((r) => [r.restaurantId, r.minutes, r.overageCents, r.status])).toEqual([
      ["r0", 0, 0, "none"],
      ["r416", 416, 0, "none"],
    ]);
    // Both months are still written to the ledger (audit trail).
    expect(prismaMock.nabilUsageCharge.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.nabilUsageCharge.upsert.mock.calls[1][0].create).toMatchObject({ restaurantId: "r416", minutes: 416, overageCents: 0, status: "none" });
  });

  it("417 minutes → 21¢ overage invoice item", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 1, minutes: 417 }]]));
    const out = await runNabilUsageBilling({ now: NOW });
    expect(out.results[0]).toMatchObject({ overageCents: 21, status: "invoiced" });
    expect(stripeMock.invoiceItems.create.mock.calls[0][0].amount).toBe(21);
  });

  it("complimentary row (no Stripe sub/customer) with overage is METERED but never billed", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([compRow("luigi")]);
    usageMock.mockResolvedValue(new Map([["luigi", { calls: 90, minutes: 900 }]]));
    const out = await runNabilUsageBilling({ now: NOW });
    expect(stripeMock.invoiceItems.create).not.toHaveBeenCalled();
    expect(out.results[0]).toMatchObject({ minutes: 900, overageCents: 29001, status: "none", reason: expect.stringContaining("not billable") });
    expect(prismaMock.nabilUsageCharge.upsert.mock.calls[0][0].create).toMatchObject({ minutes: 900, overageCents: 29001, status: "none" });
  });

  it("only phone_ordering rows in billable statuses are candidates", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([]);
    await runNabilUsageBilling({ now: NOW });
    const where = prismaMock.restaurantAddOn.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ addOn: { slug: "phone_ordering" }, status: { in: ["active", "past_due", "trialing"] } });
    expect(usageMock).not.toHaveBeenCalled();
  });

  it("refuses to bill the CURRENT (unclosed) month", async () => {
    await expect(runNabilUsageBilling({ now: NOW, monthStart: AUG })).rejects.toThrow(/not closed/);
    expect(prismaMock.restaurantAddOn.findMany).not.toHaveBeenCalled();
  });

  it("explicit monthStart re-runs a specific past month", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([]);
    const out = await runNabilUsageBilling({ now: NOW, monthStart: new Date("2026-05-01T00:00:00.000Z") });
    expect(out.period).toBe("2026-05");
  });
});

describe("runNabilUsageBilling — idempotency guards", () => {
  it("a re-run skips a restaurant whose ledger row already holds an invoice item id (no second Stripe call)", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }]]));
    prismaMock.nabilUsageCharge.findUnique.mockResolvedValue({ id: "chg_r1", status: "invoiced", stripeInvoiceItemId: "ii_old", calls: 40, minutes: 512, overageCents: 5721 });

    const out = await runNabilUsageBilling({ now: NOW });

    expect(stripeMock.invoiceItems.create).not.toHaveBeenCalled();
    expect(prismaMock.nabilUsageCharge.upsert).not.toHaveBeenCalled();
    expect(out.results[0]).toMatchObject({ status: "skipped", stripeInvoiceItemId: "ii_old", reason: "already billed" });
  });

  it("a re-run skips a restaurant whose ledger row is 'none' (nothing was owed)", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    prismaMock.nabilUsageCharge.findUnique.mockResolvedValue({ id: "chg_r1", status: "none", stripeInvoiceItemId: null, calls: 3, minutes: 12, overageCents: 0 });
    const out = await runNabilUsageBilling({ now: NOW });
    expect(out.results[0]).toMatchObject({ status: "skipped", minutes: 12 });
    expect(prismaMock.nabilUsageCharge.upsert).not.toHaveBeenCalled();
  });

  it("retry of a PENDING row (crashed after Stripe succeeded) ADOPTS the existing invoice item instead of creating a second one", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }]]));
    prismaMock.nabilUsageCharge.findUnique.mockResolvedValue({ id: "chg_r1", status: "pending", stripeInvoiceItemId: null, calls: 40, minutes: 512, overageCents: 5721 });
    stripeMock.invoiceItems.list.mockResolvedValue({
      data: [
        { id: "ii_other", metadata: { type: "marketplace_settlement" } },
        { id: "ii_july", metadata: { type: "nabil_usage", restaurantId: "r1", period: "2026-07" } },
        { id: "ii_june", metadata: { type: "nabil_usage", restaurantId: "r1", period: "2026-06" } },
      ],
    });

    const out = await runNabilUsageBilling({ now: NOW });

    expect(stripeMock.invoiceItems.list).toHaveBeenCalledWith({ customer: "cus_r1", limit: 100, created: { gte: Math.floor(AUG.getTime() / 1000) } });
    expect(stripeMock.invoiceItems.create).not.toHaveBeenCalled();
    expect(out.results[0]).toMatchObject({ status: "invoiced", stripeInvoiceItemId: "ii_july" });
    expect(prismaMock.nabilUsageCharge.update).toHaveBeenCalledWith({
      where: { id: "chg_r1" },
      data: { status: "invoiced", stripeInvoiceItemId: "ii_july", failureReason: null },
    });
  });

  it("retry of a FAILED row with nothing on Stripe creates the item (same idempotency key)", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }]]));
    prismaMock.nabilUsageCharge.findUnique.mockResolvedValue({ id: "chg_r1", status: "failed", stripeInvoiceItemId: null, calls: 40, minutes: 512, overageCents: 5721 });
    const out = await runNabilUsageBilling({ now: NOW });
    expect(stripeMock.invoiceItems.list).toHaveBeenCalledTimes(1);
    expect(stripeMock.invoiceItems.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.invoiceItems.create.mock.calls[0][1]).toEqual({ idempotencyKey: "nabil-usage-r1-2026-07" });
    expect(out.results[0].status).toBe("invoiced");
  });

  it("a fresh row does NOT pay for the Stripe list round-trip", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }]]));
    await runNabilUsageBilling({ now: NOW });
    expect(stripeMock.invoiceItems.list).not.toHaveBeenCalled();
  });

  it("Stripe failure → row 'failed' with the reason; other restaurants still processed", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1"), paidRow("r2")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }], ["r2", { calls: 50, minutes: 600 }]]));
    stripeMock.invoiceItems.create.mockRejectedValueOnce(new Error("card_declined-ish outage")).mockResolvedValueOnce({ id: "ii_2" });

    const out = await runNabilUsageBilling({ now: NOW });

    expect(out.results[0]).toMatchObject({ restaurantId: "r1", status: "failed", reason: "card_declined-ish outage" });
    expect(out.results[1]).toMatchObject({ restaurantId: "r2", status: "invoiced", stripeInvoiceItemId: "ii_2", overageCents: 11001 });
    expect(prismaMock.nabilUsageCharge.update).toHaveBeenCalledWith({ where: { id: "chg_r1" }, data: { status: "failed", failureReason: "card_declined-ish outage" } });
  });

  it("Stripe not configured → rows 'failed' (never a silent skip)", async () => {
    stripeReadyMock.mockResolvedValue(false);
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1")]);
    usageMock.mockResolvedValue(new Map([["r1", { calls: 40, minutes: 512 }]]));
    const out = await runNabilUsageBilling({ now: NOW });
    expect(out.results[0]).toMatchObject({ status: "failed", reason: "Stripe not configured on platform" });
  });

  it("time budget: stops starting new restaurants and reports the remainder as deferred", async () => {
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([paidRow("r1"), paidRow("r2"), paidRow("r3")]);
    const out = await runNabilUsageBilling({ now: NOW, timeBudgetMs: -1 });
    expect(out.results).toHaveLength(0);
    expect(out.deferred).toBe(3);
  });
});

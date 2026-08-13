/**
 * recomputeCustomerSpend() — the shared engine behind
 * scripts/backfill-customer-spend.ts and /api/cron/customer-spend-recompute.
 *
 * The fake Prisma below is deliberately hostile in one specific way: touching
 * `rewardAccount` or `rewardLedger` THROWS. That's the hard constraint under
 * test — no accounting sweep may ever read or write a customer's store credit
 * ("Luigi Bucks"). If someone later adds a "while we're here, fix the wallet
 * balance too" line, this suite fails loudly rather than quietly draining
 * somebody's credit.
 */
import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { recomputeCustomerSpend } from "./customer-spend-recompute";

type OrderRow = {
  customerId: string | null;
  restaurantId: string;
  status: string;
  orderNumber: string;
  total: number;
  creditApplied: number;
};

type CustomerRow = {
  id: string;
  restaurantId: string;
  name: string | null;
  email: string | null;
  totalOrders: number;
  totalSpent: number;
  totalCreditSpent: number;
};

/** Applies the same predicate Prisma would for the lib's groupBy `where`. */
function counts(orders: OrderRow[], restaurantId?: string) {
  return orders.filter(
    (o) =>
      o.customerId !== null &&
      !["rejected", "cancelled"].includes(o.status) &&
      !o.orderNumber.startsWith("TEST-") &&
      (!restaurantId || o.restaurantId === restaurantId),
  );
}

function makeFakePrisma(orders: OrderRow[], customers: CustomerRow[]) {
  const updates: { id: string; data: Record<string, number> }[] = [];
  const findManyCalls: { take: number; cursor: string | undefined }[] = [];
  const failIds = new Set<string>();

  const walletTrap = (model: string) =>
    new Proxy(
      {},
      {
        get() {
          throw new Error(`FORBIDDEN: recomputeCustomerSpend touched ${model}`);
        },
      },
    );

  const client = {
    rewardAccount: walletTrap("RewardAccount"),
    rewardLedger: walletTrap("RewardLedger"),
    order: {
      async groupBy(args: { where: { restaurantId?: string } }) {
        const scoped = counts(orders, args.where.restaurantId);
        const byCustomer = new Map<string, OrderRow[]>();
        for (const o of scoped) {
          const list = byCustomer.get(o.customerId!) ?? [];
          list.push(o);
          byCustomer.set(o.customerId!, list);
        }
        return [...byCustomer].map(([customerId, rows]) => ({
          customerId,
          _count: { _all: rows.length },
          _sum: {
            total: rows.reduce((s, r) => s + r.total, 0),
            creditApplied: rows.reduce((s, r) => s + r.creditApplied, 0),
          },
        }));
      },
    },
    customer: {
      async findMany(args: {
        where: { restaurantId?: string; id?: { gt: string } };
        take: number;
      }) {
        findManyCalls.push({ take: args.take, cursor: args.where.id?.gt });
        return customers
          .filter((c) => !args.where.restaurantId || c.restaurantId === args.where.restaurantId)
          .filter((c) => !args.where.id?.gt || c.id > args.where.id.gt)
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, args.take)
          .map((c) => ({ ...c }));
      },
      async update(args: { where: { id: string }; data: Record<string, number> }) {
        if (failIds.has(args.where.id)) throw new Error("simulated write failure");
        const row = customers.find((c) => c.id === args.where.id);
        if (!row) throw new Error(`no such customer ${args.where.id}`);
        Object.assign(row, args.data);
        updates.push({ id: args.where.id, data: args.data });
        return row;
      },
    },
  };

  return { prisma: client as unknown as PrismaClient, updates, findManyCalls, failIds };
}

const customer = (id: string, over: Partial<CustomerRow> = {}): CustomerRow => ({
  id,
  restaurantId: "r1",
  name: `Cust ${id}`,
  email: `${id}@example.com`,
  totalOrders: 0,
  totalSpent: 0,
  totalCreditSpent: 0,
  ...over,
});

const order = (customerId: string, over: Partial<OrderRow> = {}): OrderRow => ({
  customerId,
  restaurantId: "r1",
  status: "completed",
  orderNumber: "1001",
  total: 0,
  creditApplied: 0,
  ...over,
});

describe("recomputeCustomerSpend", () => {
  it("corrects counters left high by a later-rejected order", async () => {
    // Stored values reflect BOTH orders (the create path bumped them); the
    // second was rejected afterwards and nothing decremented it.
    const customers = [customer("c1", { totalOrders: 2, totalSpent: 50, totalCreditSpent: 10 })];
    const orders = [
      order("c1", { total: 30, creditApplied: 10 }),
      order("c1", { total: 20, creditApplied: 0, status: "rejected" }),
    ];
    const { prisma, updates } = makeFakePrisma(orders, customers);

    const result = await recomputeCustomerSpend(prisma, { apply: true });

    expect(result.drifted).toBe(1);
    expect(result.written).toBe(1);
    expect(result.failed).toBe(0);
    expect(updates[0].data).toEqual({ totalOrders: 1, totalSpent: 30, totalCreditSpent: 10 });
  });

  it("is idempotent — a second run writes nothing", async () => {
    const customers = [customer("c1", { totalOrders: 2, totalSpent: 50, totalCreditSpent: 10 })];
    const orders = [order("c1", { total: 30, creditApplied: 10 })];
    const { prisma, updates } = makeFakePrisma(orders, customers);

    await recomputeCustomerSpend(prisma, { apply: true });
    const second = await recomputeCustomerSpend(prisma, { apply: true });

    expect(second.drifted).toBe(0);
    expect(second.written).toBe(0);
    expect(updates).toHaveLength(1); // only the first run wrote
  });

  it("dry run reports drift but writes nothing", async () => {
    const customers = [customer("c1", { totalOrders: 9, totalSpent: 900, totalCreditSpent: 0 })];
    const { prisma, updates } = makeFakePrisma([order("c1", { total: 30 })], customers);

    const result = await recomputeCustomerSpend(prisma, { apply: false });

    expect(result.applied).toBe(false);
    expect(result.drifted).toBe(1);
    expect(result.written).toBe(0);
    expect(updates).toHaveLength(0);
    expect(customers[0].totalOrders).toBe(9); // untouched
  });

  it("zeroes a customer whose only orders were cancelled or TEST-", async () => {
    const customers = [customer("c1", { totalOrders: 3, totalSpent: 75, totalCreditSpent: 5 })];
    const orders = [
      order("c1", { total: 25, status: "cancelled" }),
      order("c1", { total: 25, orderNumber: "TEST-1" }),
      order("c1", { total: 25, creditApplied: 5, status: "rejected" }),
    ];
    const { prisma, updates } = makeFakePrisma(orders, customers);

    await recomputeCustomerSpend(prisma, { apply: true });

    expect(updates[0].data).toEqual({ totalOrders: 0, totalSpent: 0, totalCreditSpent: 0 });
  });

  it("does not rewrite a row that only differs by float noise", async () => {
    const customers = [customer("c1", { totalOrders: 3, totalSpent: 30.000000004, totalCreditSpent: 10 })];
    const orders = [
      order("c1", { total: 10.1, creditApplied: 3.3 }),
      order("c1", { total: 10.2, creditApplied: 3.3 }),
      order("c1", { total: 9.7, creditApplied: 3.4 }),
    ];
    const { prisma, updates } = makeFakePrisma(orders, customers);

    const result = await recomputeCustomerSpend(prisma, { apply: true });

    expect(result.drifted).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("pages with a cursor and covers every customer", async () => {
    const customers = Array.from({ length: 25 }, (_, i) =>
      customer(`c${String(i).padStart(2, "0")}`, { totalOrders: 1, totalSpent: 5, totalCreditSpent: 0 }),
    );
    const { prisma, findManyCalls } = makeFakePrisma([], customers);

    const result = await recomputeCustomerSpend(prisma, { apply: true, batchSize: 10 });

    expect(result.scanned).toBe(25);
    expect(result.drifted).toBe(25);
    expect(result.written).toBe(25);
    expect(result.nextCursor).toBeNull();
    expect(findManyCalls).toHaveLength(3);
    expect(findManyCalls[0].cursor).toBeUndefined();
    expect(findManyCalls[1].cursor).toBe("c09");
    expect(customers.every((c) => c.totalOrders === 0 && c.totalSpent === 0)).toBe(true);
  });

  it("resumes from a supplied cursor", async () => {
    const customers = [
      customer("c1", { totalOrders: 5 }),
      customer("c2", { totalOrders: 5 }),
      customer("c3", { totalOrders: 5 }),
    ];
    const { prisma } = makeFakePrisma([], customers);

    const result = await recomputeCustomerSpend(prisma, { apply: true, cursor: "c1" });

    expect(result.scanned).toBe(2);
    expect(customers[0].totalOrders).toBe(5); // before the cursor — skipped
    expect(customers[1].totalOrders).toBe(0);
  });

  it("reports nextCursor instead of silently truncating when the budget runs out", async () => {
    const customers = Array.from({ length: 30 }, (_, i) =>
      customer(`c${String(i).padStart(2, "0")}`, { totalOrders: 1 }),
    );
    const { prisma } = makeFakePrisma([], customers);

    const result = await recomputeCustomerSpend(prisma, { apply: true, batchSize: 10, timeBudgetMs: -1 });

    expect(result.scanned).toBe(10); // stopped after the first page
    expect(result.nextCursor).toBe("c09");
  });

  it("scopes both the aggregate and the paging to one restaurant", async () => {
    const customers = [
      customer("c1", { restaurantId: "r1", totalOrders: 9 }),
      customer("c2", { restaurantId: "r2", totalOrders: 9 }),
    ];
    const orders = [
      order("c1", { restaurantId: "r1", total: 10 }),
      order("c2", { restaurantId: "r2", total: 10 }),
    ];
    const { prisma } = makeFakePrisma(orders, customers);

    const result = await recomputeCustomerSpend(prisma, { apply: true, restaurantId: "r1" });

    expect(result.scanned).toBe(1);
    expect(customers[0].totalOrders).toBe(1);
    expect(customers[1].totalOrders).toBe(9); // other restaurant untouched
  });

  it("counts a failed row and keeps sweeping the rest", async () => {
    const customers = [
      customer("c1", { totalOrders: 9 }),
      customer("c2", { totalOrders: 9 }),
      customer("c3", { totalOrders: 9 }),
    ];
    const { prisma, failIds } = makeFakePrisma([], customers);
    failIds.add("c2");

    const result = await recomputeCustomerSpend(prisma, { apply: true });

    expect(result.drifted).toBe(3);
    expect(result.written).toBe(2);
    expect(result.failed).toBe(1);
    expect(customers[2].totalOrders).toBe(0); // c3 still processed after c2 failed
  });

  it("caps the sample list without losing the drift count", async () => {
    const customers = Array.from({ length: 10 }, (_, i) => customer(`c${i}`, { totalOrders: 4 }));
    const { prisma } = makeFakePrisma([], customers);

    const result = await recomputeCustomerSpend(prisma, { apply: false, maxSamples: 3 });

    expect(result.drifted).toBe(10);
    expect(result.samples).toHaveLength(3);
    expect(result.samples[0]).toMatchObject({ id: "c0", from: { orders: 4 }, to: { orders: 0 } });
  });

  it("NEVER reads or writes RewardAccount / RewardLedger", async () => {
    // The fake throws on any access to either model. Luigi's hard constraint:
    // customers can never lose store credit as a side effect of accounting.
    const customers = [customer("c1", { totalOrders: 7, totalSpent: 99, totalCreditSpent: 42 })];
    const { prisma } = makeFakePrisma([order("c1", { total: 10, creditApplied: 2 })], customers);

    await expect(recomputeCustomerSpend(prisma, { apply: true })).resolves.toBeTruthy();
    expect(customers[0].totalCreditSpent).toBe(2); // display column only
  });
});

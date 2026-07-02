/**
 * Blocker #7 — cart PREVIEW must equal CHARGE to the cent.
 *
 * Both checkout routes now build their promo pool + customer identity through
 * ONE shared builder (`buildPromoOrderContext`) and run the same engine, so
 * the previewed discount can no longer drift from the charged one. These tests
 * drive the builder exactly the way each route does — the preview's call shape
 * (optimistic pre-identity flag) vs the charge's — over an in-memory prisma,
 * and assert the two evaluations agree for every divergence we shipped with:
 *
 *   1. member signal      — signed-in restaurant customer previews a
 *                           member-only discount → the charge must apply it
 *                           too (was: charged FULL price — charge-more bug)
 *   2. brand scope        — a franchise child previews the parent's brand
 *                           promo (was: preview omitted it)
 *   3. lifetime identity  — a session customer's own order history blocks a
 *                           once-per-lifetime promo in the preview too
 *   4. new/returning keys — a phone-only returning guest is "returning" for
 *                           BOTH routes (same identity keys)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const db = {
    promotions: [] as any[],
    customers: [] as any[],
    customerAccounts: [] as any[],
    orders: [] as any[],
    cookies: {} as Record<string, string>,
  };
  return { db };
});

// In-memory prisma understanding exactly the where-shapes the shared builder
// (and the libs it calls) issue. Anything unknown returns empty — scenarios
// with no grants / VIP groups / ledger rows exercise those paths as no-ops.
vi.mock("@/lib/db", () => {
  const matchPromo = (p: any, where: any): boolean => {
    if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
    if (where.id?.in && !where.id.in.includes(p.id)) return false;
    if (where.OR) {
      return where.OR.some((c: any) =>
        typeof c.restaurantId === "string"
          ? p.restaurantId === c.restaurantId && (c.scope === undefined || p.scope === c.scope)
          : c.restaurantId?.in
            ? c.restaurantId.in.includes(p.restaurantId) && (c.scope === undefined || p.scope === c.scope)
            : false,
      );
    }
    if (typeof where.restaurantId === "string" && p.restaurantId !== where.restaurantId) return false;
    return true;
  };
  const matchOrderIdentity = (o: any, or: any[]): boolean =>
    or.some((c: any) =>
      c.customerId !== undefined ? o.customerId === c.customerId
      : c.customerEmail !== undefined ? (
          typeof c.customerEmail === "string"
            ? o.customerEmail === c.customerEmail
            : (o.customerEmail ?? "").toLowerCase() === (c.customerEmail.equals ?? "").toLowerCase()
        )
      : c.customerPhone !== undefined ? o.customerPhone === c.customerPhone
      : false,
    );
  const matchOrder = (o: any, where: any): boolean => {
    if (where.restaurantId && o.restaurantId !== where.restaurantId) return false;
    if (where.status?.notIn && where.status.notIn.includes(o.status)) return false;
    if (where.viaMarketplace !== undefined && !!o.viaMarketplace !== where.viaMarketplace) return false;
    if (where.promoDiscount?.gt !== undefined && !(o.promoDiscount > where.promoDiscount.gt)) return false;
    if (where.OR && !matchOrderIdentity(o, where.OR)) return false;
    return true;
  };
  return {
    default: {
      promotion: {
        findMany: async ({ where }: any) =>
          h.db.promotions.filter((p) => matchPromo(p, where)).map((p) => ({ groupLinks: [], ...p })),
      },
      customer: {
        findFirst: async ({ where }: any) =>
          h.db.customers.find(
            (c) => c.restaurantId === where.restaurantId && (c.email ?? "").toLowerCase() === where.email,
          ) ?? null,
        findUnique: async ({ where }: any) => h.db.customers.find((c) => c.id === where.id) ?? null,
        findMany: async ({ where }: any) =>
          h.db.customers.filter(
            (c) =>
              c.restaurantId === where.restaurantId &&
              (c.email ?? "").toLowerCase() === (where.email?.equals ?? "").toLowerCase(),
          ),
      },
      customerAccount: {
        findUnique: async ({ where }: any) =>
          h.db.customerAccounts.find((a) => a.email === where.email) ?? null,
      },
      order: {
        count: async ({ where }: any) => h.db.orders.filter((o) => matchOrder(o, where)).length,
        findMany: async ({ where }: any) => h.db.orders.filter((o) => matchOrder(o, where)),
      },
      customerGroupMember: { findMany: async () => [] },
      customerCoupon: { findMany: async () => [], findFirst: async () => null },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.db.cookies[name] ? { value: h.db.cookies[name] } : undefined),
  }),
}));

import { buildPromoOrderContext } from "./promo-order-context";
import { resolvePromotions, applyPromotions, totalPromoDiscount, type ApplyContext } from "./promo-engine";
import { signRestaurantCustomerToken } from "./restaurant-customer-session";

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-promo-parity";

const R1 = "rest_1";
const PARENT = "rest_parent";
const CHILD = "rest_child";

const basePromo = (over: Partial<any>) => ({
  id: "promo_x",
  restaurantId: R1,
  scope: "own",
  name: "10% off",
  promotionType: "percentage_off",
  isActive: true,
  stackingRule: "standard",
  orderType: "both",
  customerType: "any",
  minimumOrder: 0,
  rules: "{}",
  ruleConfig: { discountPercent: 10 },
  autoApply: true,
  couponCode: null,
  usedCount: 0,
  usageLimit: null,
  channel: "both",
  campaignRef: null,
  onceLifetimePerClient: false,
  groupLinks: [],
  ...over,
});

const cartItems = [{ menuItemId: "m1", categoryId: "c1", price: 20, quantity: 1, subtotal: 20 }];
const SUBTOTAL = 20;

/** Run the engine exactly like /api/public/apply-promos does with a builder result. */
async function previewDiscount(restaurant: any, args: { email?: string | null; phone?: string | null; optimisticIsNewCustomer?: boolean }) {
  const promoCtx = await buildPromoOrderContext({
    restaurant,
    channel: "website",
    email: args.email ?? null,
    phone: args.phone ?? null,
    suppressedPromoIds: undefined,
    grantId: null,
    optimisticIsNewCustomer: args.optimisticIsNewCustomer ?? false,
  });
  const ctx: ApplyContext = {
    orderType: "pickup",
    isNewCustomer: promoCtx.isNewCustomer,
    isMember: promoCtx.isMember,
    hasUsedLifetime: promoCtx.hasUsedLifetime,
    subtotal: SUBTOTAL,
    items: cartItems,
  };
  const { results } = resolvePromotions(promoCtx.activePromos as any, ctx);
  return { cents: Math.round(totalPromoDiscount(results, SUBTOTAL) * 100), promoCtx };
}

/** Run the engine exactly like /api/orders does with a builder result. */
async function chargeDiscount(restaurant: any, args: { email?: string | null; phone?: string | null }) {
  const promoCtx = await buildPromoOrderContext({
    restaurant,
    channel: "website",
    email: args.email ?? null,
    phone: args.phone ?? null,
    suppressedPromoIds: undefined,
    grantId: null,
    // charge passes no optimistic override (defaults to new) — same as the route
  });
  const results = applyPromotions(promoCtx.activePromos as any, {
    orderType: "pickup",
    isNewCustomer: promoCtx.isNewCustomer,
    isMember: promoCtx.isMember,
    hasUsedLifetime: promoCtx.hasUsedLifetime,
    subtotal: SUBTOTAL,
    items: cartItems,
  });
  return { cents: Math.round(totalPromoDiscount(results, SUBTOTAL) * 100), promoCtx };
}

function signIn(customerId: string, restaurantId: string) {
  h.db.cookies["ff_rest_account"] = signRestaurantCustomerToken({ customerId, restaurantId });
}

beforeEach(() => {
  h.db.promotions = [];
  h.db.customers = [];
  h.db.customerAccounts = [];
  h.db.orders = [];
  h.db.cookies = {};
});

describe("preview == charge (Blocker #7)", () => {
  it("member-only promo: signed-in restaurant customer (no CustomerAccount) gets it in BOTH preview and charge", async () => {
    const restaurant = { id: R1, parentRestaurantId: null };
    h.db.promotions = [basePromo({ id: "member10", customerType: "member" })];
    h.db.customers = [{ id: "cust1", restaurantId: R1, email: "vip@example.com", phone: "9051112222", name: "Vip" }];
    signIn("cust1", R1);

    // Cart stage: nothing typed yet — identity comes from the session alone.
    const preview = await previewDiscount(restaurant, {});
    // Charge stage: checkout form carries the typed email + phone.
    const charge = await chargeDiscount(restaurant, { email: "vip@example.com", phone: "9051112222" });

    expect(preview.promoCtx.isMember).toBe(true);
    expect(charge.promoCtx.isMember).toBe(true);
    expect(preview.cents).toBe(200); // 10% of $20
    expect(charge.cents).toBe(preview.cents);
  });

  it("member-only promo stays OFF for a guest in both routes", async () => {
    const restaurant = { id: R1, parentRestaurantId: null };
    h.db.promotions = [basePromo({ id: "member10", customerType: "member" })];

    const preview = await previewDiscount(restaurant, { email: "guest@example.com" });
    const charge = await chargeDiscount(restaurant, { email: "guest@example.com" });

    expect(preview.promoCtx.isMember).toBe(false);
    expect(preview.cents).toBe(0);
    expect(charge.cents).toBe(preview.cents);
  });

  it("child-of-brand cart: the parent's brand-scoped promo applies in BOTH preview and charge; the parent's own promos never leak", async () => {
    const restaurant = { id: CHILD, parentRestaurantId: PARENT };
    h.db.promotions = [
      basePromo({ id: "brand10", restaurantId: PARENT, scope: "brand" }),
      basePromo({ id: "parent_own", restaurantId: PARENT, scope: "own", ruleConfig: { discountPercent: 50 } }),
    ];

    const preview = await previewDiscount(restaurant, { email: "someone@example.com" });
    const charge = await chargeDiscount(restaurant, { email: "someone@example.com" });

    const previewIds = preview.promoCtx.activePromos.map((p: any) => p.id);
    expect(previewIds).toContain("brand10");
    expect(previewIds).not.toContain("parent_own");
    expect(preview.cents).toBe(200); // 10%, not the parent's own 50%
    expect(charge.cents).toBe(preview.cents);
  });

  it("once-per-lifetime: a redemption visible only via the session customer's order history blocks BOTH routes", async () => {
    const restaurant = { id: R1, parentRestaurantId: null };
    h.db.promotions = [basePromo({ id: "life10", onceLifetimePerClient: true })];
    h.db.customers = [{ id: "cust1", restaurantId: R1, email: "vip@example.com", phone: null, name: "Vip" }];
    // Historical redemption stamped on the order by customerId ONLY (no
    // email/phone on the row) — the old preview couldn't see this.
    h.db.orders = [{
      restaurantId: R1, customerId: "cust1", customerEmail: null, customerPhone: null,
      status: "completed", viaMarketplace: false, promoDiscount: 2, appliedPromos: [{ promoId: "life10" }],
    }];
    signIn("cust1", R1);

    const preview = await previewDiscount(restaurant, {});
    const charge = await chargeDiscount(restaurant, { email: "vip@example.com" });

    expect(preview.promoCtx.hasUsedLifetime["life10"]).toBe(true);
    expect(charge.promoCtx.hasUsedLifetime["life10"]).toBe(true);
    expect(preview.cents).toBe(0);
    expect(charge.cents).toBe(preview.cents);
  });

  it("new-customer promo: a phone-only returning guest is 'returning' for BOTH routes", async () => {
    const restaurant = { id: R1, parentRestaurantId: null };
    h.db.promotions = [basePromo({ id: "new10", customerType: "new" })];
    h.db.orders = [{
      restaurantId: R1, customerId: "someone_else_row", customerEmail: "old@example.com",
      customerPhone: "9053854444", status: "completed", viaMarketplace: false, promoDiscount: 0, appliedPromos: [],
    }];

    // Guest typed ONLY their phone at checkout.
    const preview = await previewDiscount(restaurant, { phone: "9053854444", optimisticIsNewCustomer: true });
    const charge = await chargeDiscount(restaurant, { phone: "9053854444" });

    expect(preview.promoCtx.isNewCustomer).toBe(false);
    expect(charge.promoCtx.isNewCustomer).toBe(false);
    expect(preview.cents).toBe(0);
    expect(charge.cents).toBe(preview.cents);

    // Control: a genuinely fresh phone gets the discount in BOTH routes.
    const preview2 = await previewDiscount(restaurant, { phone: "4165550000", optimisticIsNewCustomer: true });
    const charge2 = await chargeDiscount(restaurant, { phone: "4165550000" });
    expect(preview2.cents).toBe(200);
    expect(charge2.cents).toBe(preview2.cents);
  });

  it("failed prior orders never flip a customer to returning (missed first order keeps the first-buy)", async () => {
    const restaurant = { id: R1, parentRestaurantId: null };
    h.db.promotions = [basePromo({ id: "new10", customerType: "new" })];
    h.db.orders = [
      { restaurantId: R1, customerEmail: "retry@example.com", customerPhone: null, status: "rejected", viaMarketplace: false, promoDiscount: 0, appliedPromos: [] },
      { restaurantId: R1, customerEmail: "retry@example.com", customerPhone: null, status: "cancelled", viaMarketplace: false, promoDiscount: 0, appliedPromos: [] },
    ];

    const preview = await previewDiscount(restaurant, { email: "retry@example.com" });
    const charge = await chargeDiscount(restaurant, { email: "retry@example.com" });

    expect(preview.promoCtx.isNewCustomer).toBe(true);
    expect(preview.cents).toBe(200);
    expect(charge.cents).toBe(preview.cents);
  });
});

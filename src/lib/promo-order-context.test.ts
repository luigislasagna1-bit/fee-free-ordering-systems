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
    /** Granted CustomerCoupon rows (findActiveGrants add-backs). */
    customerCoupons: [] as any[],
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
  // The channel predicate the split "first order" count adds:
  //   AND: [{ OR: [{ channel: null }, { channel: { not: "voice" } }] }]
  const matchOrderChannel = (o: any, c: any): boolean =>
    "channel" in c
      ? c.channel === null
        ? o.channel == null
        : c.channel?.not !== undefined
          ? o.channel != null && o.channel !== c.channel.not
          : o.channel === c.channel
      : true;
  const matchOrder = (o: any, where: any): boolean => {
    if (where.restaurantId && o.restaurantId !== where.restaurantId) return false;
    if (where.status?.notIn && where.status.notIn.includes(o.status)) return false;
    if (where.viaMarketplace !== undefined && !!o.viaMarketplace !== where.viaMarketplace) return false;
    if (where.promoDiscount?.gt !== undefined && !(o.promoDiscount > where.promoDiscount.gt)) return false;
    if (where.OR && !matchOrderIdentity(o, where.OR)) return false;
    if (where.AND && !where.AND.every((a: any) => (a.OR ? a.OR.some((c: any) => matchOrderChannel(o, c)) : true))) return false;
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
      customerCoupon: {
        // Only findActiveGrants' shape (status:"granted") is answered; the
        // lifetime-ledger scans keep returning nothing.
        findMany: async ({ where }: any) =>
          where?.status === "granted"
            ? h.db.customerCoupons.filter((c) => c.restaurantId === where.restaurantId && c.status === "granted")
            : [],
        findFirst: async () => null,
      },
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
    isNewCustomerExcludingPhoneOrders: promoCtx.isNewCustomerExcludingPhoneOrders,
    orderSource: promoCtx.orderSource,
    isMember: promoCtx.isMember,
    hasUsedLifetime: promoCtx.hasUsedLifetime,
    subtotal: SUBTOTAL,
    items: cartItems,
  };
  const { results } = resolvePromotions(promoCtx.activePromos as any, ctx);
  return { cents: Math.round(totalPromoDiscount(results, SUBTOTAL) * 100), promoCtx };
}

/** Run the engine exactly like /api/orders does with a builder result. */
async function chargeDiscount(
  restaurant: any,
  args: {
    email?: string | null;
    phone?: string | null;
    orderSource?: "web" | "voice";
    /** Delivery order with this fee (free_delivery scenarios); pickup otherwise. */
    deliveryFee?: number;
  },
) {
  const promoCtx = await buildPromoOrderContext({
    restaurant,
    channel: "website",
    ...(args.orderSource ? { orderSource: args.orderSource } : {}),
    email: args.email ?? null,
    phone: args.phone ?? null,
    suppressedPromoIds: undefined,
    grantId: null,
    // charge passes no optimistic override (defaults to new) — same as the route
  });
  const results = applyPromotions(promoCtx.activePromos as any, {
    orderType: args.deliveryFee !== undefined ? "delivery" : "pickup",
    deliveryFee: args.deliveryFee ?? 0,
    isNewCustomer: promoCtx.isNewCustomer,
    // Same two fields the route threads — the phone gate + the per-promo
    // "first order" view live in the shared engine.
    isNewCustomerExcludingPhoneOrders: promoCtx.isNewCustomerExcludingPhoneOrders,
    orderSource: promoCtx.orderSource,
    isMember: promoCtx.isMember,
    hasUsedLifetime: promoCtx.hasUsedLifetime,
    subtotal: SUBTOTAL,
    items: cartItems,
  });
  return {
    cents: Math.round(totalPromoDiscount(results, SUBTOTAL) * 100),
    hasFreeDelivery: results.some((r) => r.type === "free_delivery"),
    promoCtx,
  };
}

function signIn(customerId: string, restaurantId: string) {
  h.db.cookies["ff_rest_account"] = signRestaurantCustomerToken({ customerId, restaurantId });
}

beforeEach(() => {
  h.db.promotions = [];
  h.db.customers = [];
  h.db.customerAccounts = [];
  h.db.orders = [];
  h.db.customerCoupons = [];
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

/**
 * "Available by phone (Nabil AI)" — Promotion.phoneOrders (Luigi A64(a),
 * 2026-08-17). A promo the owner keeps off the phone must never reach a Nabil
 * phone order (orderSource:"voice") — not in the public pool, not through a
 * granted add-back, not through the engine — while phone-available promos keep
 * applying by phone and web behaviour is byte-identical. The rows below carry
 * the state the day-one backfill leaves: Kickstarter / Autopilot campaign
 * promos at phoneOrders=false (the old hardcoded rule; live defect
 * ORD-971682861 — a first-time caller was given the FIRSTBUY 10%), owner-made
 * promos at the default true.
 */
describe("promos not available by phone never reach a phone order", () => {
  const restaurant = { id: R1, parentRestaurantId: null };
  // The exact row shape Kickstarter creates (kickstarter.ts) after the
  // backfill: new-customer, auto-apply, channel both, phoneOrders false.
  const firstBuy = () =>
    basePromo({
      id: "firstbuy",
      name: "First-time customer special",
      customerType: "new",
      couponCode: "FIRSTBUY",
      campaignRef: "kickstarter_first_buy",
      stackingRule: "master",
      phoneOrders: false,
    });
  const ownerTenOff = () =>
    basePromo({ id: "owner10", name: "Owner-made 10% off", campaignRef: null, phoneOrders: true });

  it("voice: the (phone-excluded) Kickstarter first-buy is dropped from the pool; web keeps it (same new caller)", async () => {
    h.db.promotions = [firstBuy()];

    const web = await chargeDiscount(restaurant, { phone: "9055559470" });
    const voice = await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice" });

    expect(web.promoCtx.isNewCustomer).toBe(true);
    expect(web.cents).toBe(200);
    expect(voice.promoCtx.orderSource).toBe("voice");
    expect(voice.promoCtx.isNewCustomer).toBe(true); // identity is unchanged — only the pool is
    expect(voice.promoCtx.activePromos.map((p: any) => p.id)).not.toContain("firstbuy");
    expect(voice.cents).toBe(0);
  });

  it("voice: a phone-available owner-made promo still applies by phone", async () => {
    h.db.promotions = [firstBuy(), ownerTenOff()];

    const voice = await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice" });
    const ids = voice.promoCtx.activePromos.map((p: any) => p.id);

    expect(ids).toContain("owner10");
    expect(ids).not.toContain("firstbuy");
    expect(voice.cents).toBe(200); // the owner's 10%, not 10% + first-buy
  });

  it("voice: a phone-excluded promo GRANTED to the caller's phone is not added back (web is)", async () => {
    // Autopilot rows are autoApply:false + hidden; a granted CustomerCoupon
    // normally forces them on for that identity — including via the
    // "not in the filtered pool" re-fetch. On a phone order neither path may fire.
    h.db.promotions = [
      basePromo({ id: "win3", name: "15% off your next online order", autoApply: false, couponCode: "WIN3", campaignRef: "autopilot_reengage_win3", customerType: "any", displayMode: "hidden_coupon_only", ruleConfig: { discountPercent: 15 }, phoneOrders: false }),
    ];
    h.db.customerCoupons = [
      { id: "grant1", restaurantId: R1, promotionId: "win3", code: "WIN3", autoApply: true, campaignRef: "autopilot_reengage_win3", status: "granted", phone: "9055559470", email: null, expiresAt: null },
    ];

    const web = await chargeDiscount(restaurant, { phone: "9055559470" });
    const voice = await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice" });

    expect(web.promoCtx.activePromos.find((p: any) => p.id === "win3")?.autoApply).toBe(true);
    expect(web.cents).toBe(300); // 15% of $20 — the grant works online
    expect(voice.promoCtx.activePromos.map((p: any) => p.id)).not.toContain("win3");
    expect(voice.cents).toBe(0);
  });

  it("the switch is per-promo, not per-campaign: a Kickstarter first-buy the owner turned back ON applies by phone", async () => {
    h.db.promotions = [{ ...firstBuy(), phoneOrders: true }];
    const voice = await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice" });
    expect(voice.promoCtx.activePromos.map((p: any) => p.id)).toContain("firstbuy");
    expect(voice.cents).toBe(200);
  });

  // Standing rule: a promo change applies to ALL promo types through the
  // shared isEligible() — the OWNER-MADE variants below have no campaignRef,
  // so only the switch keeps them off the phone.
  it("owner-made percentage_off with phoneOrders=false: refused by phone, applied on the web", async () => {
    h.db.promotions = [basePromo({ id: "pct", promotionType: "percentage_off", ruleConfig: { discountPercent: 10 }, phoneOrders: false })];
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice" })).cents).toBe(0);
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "web" })).cents).toBe(200);
  });

  it("owner-made fixed_cart with phoneOrders=false: refused by phone, applied on the web", async () => {
    h.db.promotions = [basePromo({ id: "fixed", promotionType: "fixed_cart", ruleConfig: { discountAmount: 5 }, phoneOrders: false })];
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice" })).cents).toBe(0);
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "web" })).cents).toBe(500);
  });

  it("owner-made free_delivery with phoneOrders=false: no fee waiver by phone, waived on the web (and by phone once switched on)", async () => {
    const freeDel = (phoneOrders: boolean) =>
      basePromo({ id: "freedel", name: "Free delivery over $0", promotionType: "free_delivery", orderType: "delivery", ruleConfig: {}, phoneOrders });
    h.db.promotions = [freeDel(false)];
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice", deliveryFee: 7.99 })).hasFreeDelivery).toBe(false);
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "web", deliveryFee: 7.99 })).hasFreeDelivery).toBe(true);
    h.db.promotions = [freeDel(true)];
    expect((await chargeDiscount(restaurant, { phone: "9055559470", orderSource: "voice", deliveryFee: 7.99 })).hasFreeDelivery).toBe(true);
  });

  it("web default: omitting orderSource behaves exactly like today (kickstarter applies to a new web customer)", async () => {
    h.db.promotions = [firstBuy()];
    const explicitWeb = await chargeDiscount(restaurant, { email: "new@example.com", orderSource: "web" });
    const implicitWeb = await chargeDiscount(restaurant, { email: "new@example.com" });
    expect(explicitWeb.promoCtx.orderSource).toBe("web");
    expect(implicitWeb.promoCtx.orderSource).toBe("web");
    expect(explicitWeb.cents).toBe(200);
    expect(implicitWeb.cents).toBe(explicitWeb.cents);
  });
});

/**
 * "First order" is judged among the orders on the channels the promo applies
 * to (Luigi A64(a)): a phone-excluded promo does not count Nabil phone orders
 * (Order.channel "voice"), a phone-available promo counts everything. Both
 * verdicts come from the same builder for both routes (preview == charge).
 */
describe("first-time counting follows the promo's channels", () => {
  const restaurant = { id: R1, parentRestaurantId: null };
  const PHONE = "9055559470";
  const phoneFirstBuy = () =>
    basePromo({ id: "firstbuy", customerType: "new", couponCode: "FIRSTBUY", campaignRef: "kickstarter_first_buy", stackingRule: "master", phoneOrders: false });
  const anyChannelNewOnly = () =>
    basePromo({ id: "new_any", name: "New customers, any channel", customerType: "new", ruleConfig: { discountPercent: 20 }, phoneOrders: true });
  const priorPhoneOrder = () => ({
    restaurantId: R1, customerId: null, customerEmail: null, customerPhone: PHONE,
    status: "completed", viaMarketplace: false, channel: "voice", promoDiscount: 0, appliedPromos: [],
  });
  const priorWebOrder = () => ({ ...priorPhoneOrder(), channel: null });

  it("a customer whose only earlier order was BY PHONE is still a first-timer for the phone-excluded first-buy on the web…", async () => {
    h.db.promotions = [phoneFirstBuy()];
    h.db.orders = [priorPhoneOrder()];

    const preview = await previewDiscount(restaurant, { phone: PHONE, optimisticIsNewCustomer: true });
    const charge = await chargeDiscount(restaurant, { phone: PHONE });

    expect(charge.promoCtx.isNewCustomer).toBe(false); // returning overall
    expect(charge.promoCtx.isNewCustomerExcludingPhoneOrders).toBe(true); // new online
    expect(charge.promoCtx.newCustomerOfferUnavailable).toBe(false); // the offer IS available to them
    expect(charge.cents).toBe(200);
    expect(preview.cents).toBe(charge.cents);
  });

  it("…while a phone-AVAILABLE 'new customers only' promo counts that phone order (returning — no discount)", async () => {
    h.db.promotions = [anyChannelNewOnly()];
    h.db.orders = [priorPhoneOrder()];

    const charge = await chargeDiscount(restaurant, { phone: PHONE });
    expect(charge.promoCtx.isNewCustomer).toBe(false);
    expect(charge.cents).toBe(0);
    // No phone-excluded promo at this store ⇒ the split flag simply mirrors
    // the all-channel verdict (no second count).
    expect(charge.promoCtx.isNewCustomerExcludingPhoneOrders).toBe(false);
  });

  it("a prior WEB order makes the customer returning on BOTH counts (first-buy refused, 'new customers only' note shown)", async () => {
    h.db.promotions = [phoneFirstBuy()];
    h.db.orders = [priorWebOrder()];

    const charge = await chargeDiscount(restaurant, { phone: PHONE });
    expect(charge.promoCtx.isNewCustomer).toBe(false);
    expect(charge.promoCtx.isNewCustomerExcludingPhoneOrders).toBe(false);
    expect(charge.promoCtx.newCustomerOfferUnavailable).toBe(true);
    expect(charge.cents).toBe(0);
  });

  it("a genuinely new customer is new on both counts (no second query needed)", async () => {
    h.db.promotions = [phoneFirstBuy()];
    h.db.orders = [];
    const charge = await chargeDiscount(restaurant, { phone: "4165550000" });
    expect(charge.promoCtx.isNewCustomer).toBe(true);
    expect(charge.promoCtx.isNewCustomerExcludingPhoneOrders).toBe(true);
    expect(charge.cents).toBe(200);
  });

  it("failed phone orders never count either way", async () => {
    h.db.promotions = [phoneFirstBuy(), anyChannelNewOnly()];
    h.db.orders = [{ ...priorPhoneOrder(), status: "rejected" }];
    const charge = await chargeDiscount(restaurant, { phone: PHONE });
    expect(charge.promoCtx.isNewCustomer).toBe(true);
    expect(charge.promoCtx.isNewCustomerExcludingPhoneOrders).toBe(true);
    // Both "new only" promos fire (10% master + 20% standard stack) → 30% of $20.
    expect(charge.cents).toBe(600);
  });
});

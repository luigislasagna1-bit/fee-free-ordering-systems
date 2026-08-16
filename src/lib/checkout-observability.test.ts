import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const reportErrorMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError: reportErrorMock }));

import { logCheckoutRejection, rejectionContextFromBody } from "./checkout-observability";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

/** The single logged line, parsed back out. */
const logged = () => JSON.parse((errSpy.mock.calls[0] as any[])[1]);

const REAL_BODY = {
  restaurantSlug: "luigis-lasagna",
  type: "delivery",
  couponCode: "FIRSTBUY",
  items: [{ menuItemId: "a" }, { menuItemId: "b" }],
  customerName: "Jane Roe",
  customerEmail: "jane.roe@example.com",
  customerPhone: "+19053854444",
  deliveryAddress: "12 Elm St",
  deliveryZip: "L8P 1A1",
};

describe("rejectionContextFromBody", () => {
  it("keeps the diagnostic fields", () => {
    expect(rejectionContextFromBody(REAL_BODY)).toMatchObject({
      restaurantSlug: "luigis-lasagna",
      orderType: "delivery",
      couponCode: "FIRSTBUY",
      itemCount: 2,
      hadEmail: true,
      hadPhone: true,
    });
  });

  it("reports identity as presence, not value", () => {
    const ctx = rejectionContextFromBody({ customerEmail: "  ", customerPhone: undefined });
    expect(ctx.hadEmail).toBe(false);
    expect(ctx.hadPhone).toBe(false);
  });

  it("survives a malformed / absent body", () => {
    for (const bad of [null, undefined, "not json", 42, []]) {
      expect(() => rejectionContextFromBody(bad)).not.toThrow();
    }
    expect(rejectionContextFromBody(null).itemCount).toBeNull();
  });
});

describe("logCheckoutRejection", () => {
  it("🔒 never writes name, email, phone or address into the log", () => {
    logCheckoutRejection({
      status: 400,
      code: "promo_email_mismatch",
      error: "This code is registered to a different email address.",
      ...rejectionContextFromBody(REAL_BODY),
    });
    const line = (errSpy.mock.calls[0] as any[]).join(" ");
    for (const pii of ["Jane Roe", "jane.roe@example.com", "9053854444", "12 Elm St", "L8P 1A1"]) {
      expect(line).not.toContain(pii);
    }
  });

  it("records the reason with enough context to act on", () => {
    logCheckoutRejection({
      status: 400,
      code: "promo_email_mismatch",
      error: "This code is registered to a different email address.",
      ...rejectionContextFromBody(REAL_BODY),
    });
    expect((errSpy.mock.calls[0] as any[])[0]).toBe("[checkout-rejected]");
    expect(logged()).toMatchObject({
      event: "checkout_rejected",
      status: 400,
      code: "promo_email_mismatch",
      restaurantSlug: "luigis-lasagna",
      couponCode: "FIRSTBUY",
      itemCount: 2,
    });
  });

  it("escalates promo-integrity refusals to Sentry", () => {
    logCheckoutRejection({ status: 400, code: "promo_email_mismatch" });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT escalate ordinary business rejections", () => {
    for (const code of ["item_sold_out", "holiday_closed", "scheduled_in_past", null]) {
      logCheckoutRejection({ status: 400, code });
    }
    expect(reportErrorMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(4); // still logged, just not alerted
  });

  it("never throws, even on hostile input", () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => logCheckoutRejection({ status: 400, ...(circular as any) })).not.toThrow();
  });
});

/**
 * The /api/orders wrapper reads the request body TWICE — once in placeOrder, once
 * on the rejection path — via req.clone(). If that ever stopped working, every
 * order would fail, so the assumption is pinned here rather than left implicit.
 */
describe("NextRequest clone (the wrapper's load-bearing assumption)", () => {
  it("lets the handler and the logger each read the body", async () => {
    const req = new NextRequest("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantSlug: "demo", items: [{ a: 1 }] }),
    });
    const forLog = req.clone();
    const inner = await req.json(); // placeOrder reads the original first
    expect(inner.restaurantSlug).toBe("demo");
    const outer = await forLog.json(); // wrapper reads the clone afterwards
    expect(outer).toMatchObject({ restaurantSlug: "demo" });
    expect(outer.items).toHaveLength(1);
  });
});

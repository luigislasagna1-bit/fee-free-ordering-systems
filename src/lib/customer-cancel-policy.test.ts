import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cancelEmailScope, shouldOfferEmailCancel } from "./customer-cancel-policy";

let saved: string | undefined;
beforeEach(() => { saved = process.env.CUSTOMER_CANCEL_EMAIL_SCOPE; });
afterEach(() => {
  if (saved === undefined) delete process.env.CUSTOMER_CANCEL_EMAIL_SCOPE;
  else process.env.CUSTOMER_CANCEL_EMAIL_SCOPE = saved;
});

describe("customer-cancel email policy", () => {
  it("defaults to closed_only (strict Fabrizio scope)", () => {
    delete process.env.CUSTOMER_CANCEL_EMAIL_SCOPE;
    expect(cancelEmailScope()).toBe("closed_only");
    expect(shouldOfferEmailCancel({ placedWhileClosed: true })).toBe(true);
    expect(shouldOfferEmailCancel({ placedWhileClosed: false })).toBe(false);
  });

  it("all_pending offers the link on every order", () => {
    process.env.CUSTOMER_CANCEL_EMAIL_SCOPE = "all_pending";
    expect(shouldOfferEmailCancel({ placedWhileClosed: false })).toBe(true);
    expect(shouldOfferEmailCancel({ placedWhileClosed: true })).toBe(true);
  });

  it("an unknown env value falls back to closed_only (fail closed)", () => {
    process.env.CUSTOMER_CANCEL_EMAIL_SCOPE = "everything";
    expect(cancelEmailScope()).toBe("closed_only");
    expect(shouldOfferEmailCancel({ placedWhileClosed: false })).toBe(false);
  });
});

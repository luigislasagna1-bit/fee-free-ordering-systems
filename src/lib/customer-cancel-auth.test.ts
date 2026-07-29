import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isCancelAuthorized } from "./customer-cancel-auth";
import { signActionToken } from "./order-status-token";

const ORDER = "cmorderaaa111";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.ORDER_STATUS_SIGNING_KEY;
  process.env.ORDER_STATUS_SIGNING_KEY = "test-secret-key-for-auth";
});
afterEach(() => {
  if (saved === undefined) delete process.env.ORDER_STATUS_SIGNING_KEY;
  else process.env.ORDER_STATUS_SIGNING_KEY = saved;
});

describe("isCancelAuthorized — the full matrix", () => {
  it("session owner, no token → allowed (existing signed-in behavior)", () => {
    expect(isCancelAuthorized({ owned: true, purpose: "order-cancel", subjectId: ORDER, token: undefined })).toBe(true);
  });

  it("guest with a VALID cancel token → allowed (the emailed link)", () => {
    const token = signActionToken("order-cancel", ORDER);
    expect(isCancelAuthorized({ owned: false, purpose: "order-cancel", subjectId: ORDER, token })).toBe(true);
  });

  it("guest with a STATUS-purpose token → denied (scoping)", () => {
    const token = signActionToken("order-status", ORDER);
    expect(isCancelAuthorized({ owned: false, purpose: "order-cancel", subjectId: ORDER, token })).toBe(false);
  });

  it("guest with ANOTHER order's cancel token → denied", () => {
    const token = signActionToken("order-cancel", "cmorderbbb222");
    expect(isCancelAuthorized({ owned: false, purpose: "order-cancel", subjectId: ORDER, token })).toBe(false);
  });

  it("guest with nothing → denied", () => {
    expect(isCancelAuthorized({ owned: false, purpose: "order-cancel", subjectId: ORDER, token: undefined })).toBe(false);
    expect(isCancelAuthorized({ owned: false, purpose: "order-cancel", subjectId: ORDER, token: null })).toBe(false);
  });

  it("reservation purpose is its own scope", () => {
    const resvToken = signActionToken("reservation-cancel", "cmresv1");
    expect(isCancelAuthorized({ owned: false, purpose: "reservation-cancel", subjectId: "cmresv1", token: resvToken })).toBe(true);
    expect(isCancelAuthorized({ owned: false, purpose: "order-cancel", subjectId: "cmresv1", token: resvToken })).toBe(false);
  });
});

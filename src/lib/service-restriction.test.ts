import { describe, it, expect } from "vitest";
import {
  serviceRestrictionKind,
  serviceAllows,
  blockingServiceKind,
  normalizedServiceWrite,
} from "./service-restriction";

const BOTH_TRUE = { forPickup: true, forDelivery: true };
const BOTH_FALSE = { forPickup: false, forDelivery: false };
const PICKUP_ONLY = { forPickup: true, forDelivery: false };
const DELIVERY_ONLY = { forPickup: false, forDelivery: true };

describe("serviceRestrictionKind", () => {
  it("both true = unrestricted", () => {
    expect(serviceRestrictionKind(BOTH_TRUE)).toBeNull();
  });

  it("BOTH FALSE = unrestricted (unchecking both boxes never means blocked — Fabrizio 2026-07-11)", () => {
    expect(serviceRestrictionKind(BOTH_FALSE)).toBeNull();
  });

  it("exactly one false = restricted to the other service", () => {
    expect(serviceRestrictionKind(PICKUP_ONLY)).toBe("pickupOnly");
    expect(serviceRestrictionKind(DELIVERY_ONLY)).toBe("deliveryOnly");
  });

  it("missing/null flags default to unrestricted (Prisma default true)", () => {
    expect(serviceRestrictionKind({})).toBeNull();
    expect(serviceRestrictionKind(null)).toBeNull();
    expect(serviceRestrictionKind(undefined)).toBeNull();
    expect(serviceRestrictionKind({ forPickup: null, forDelivery: null })).toBeNull();
    // null (unset) is NOT false — only an explicit false restricts.
    expect(serviceRestrictionKind({ forPickup: null, forDelivery: false })).toBe("pickupOnly");
  });
});

describe("serviceAllows — full flag-combo × service matrix", () => {
  it("both true: allowed everywhere", () => {
    expect(serviceAllows(BOTH_TRUE, "pickup")).toBe(true);
    expect(serviceAllows(BOTH_TRUE, "delivery")).toBe(true);
  });
  it("both false: allowed everywhere (the semantics fix)", () => {
    expect(serviceAllows(BOTH_FALSE, "pickup")).toBe(true);
    expect(serviceAllows(BOTH_FALSE, "delivery")).toBe(true);
  });
  it("pickup-only: pickup yes, delivery no", () => {
    expect(serviceAllows(PICKUP_ONLY, "pickup")).toBe(true);
    expect(serviceAllows(PICKUP_ONLY, "delivery")).toBe(false);
  });
  it("delivery-only: delivery yes, pickup no", () => {
    expect(serviceAllows(DELIVERY_ONLY, "delivery")).toBe(true);
    expect(serviceAllows(DELIVERY_ONLY, "pickup")).toBe(false);
  });
  it("missing entity is permissive", () => {
    expect(serviceAllows({}, "pickup")).toBe(true);
    expect(serviceAllows(undefined, "delivery")).toBe(true);
  });
});

describe("blockingServiceKind (item ∧ category)", () => {
  it("item blocks: returns the ITEM's kind", () => {
    expect(blockingServiceKind(PICKUP_ONLY, BOTH_TRUE, "delivery")).toBe("pickupOnly");
  });

  it("category blocks: returns the CATEGORY's kind", () => {
    expect(blockingServiceKind(BOTH_TRUE, DELIVERY_ONLY, "pickup")).toBe("deliveryOnly");
  });

  it("both allow: null (orderable)", () => {
    expect(blockingServiceKind(BOTH_TRUE, BOTH_TRUE, "pickup")).toBeNull();
    expect(blockingServiceKind(PICKUP_ONLY, PICKUP_ONLY, "pickup")).toBeNull();
  });

  it("contradictory pair (cat pickup-only + item delivery-only): each service names ITS blocker", () => {
    expect(blockingServiceKind(DELIVERY_ONLY, PICKUP_ONLY, "pickup")).toBe("deliveryOnly"); // item blocks pickup
    expect(blockingServiceKind(DELIVERY_ONLY, PICKUP_ONLY, "delivery")).toBe("pickupOnly"); // cat blocks delivery
  });

  it("both-false on either side never blocks", () => {
    expect(blockingServiceKind(BOTH_FALSE, BOTH_TRUE, "pickup")).toBeNull();
    expect(blockingServiceKind(BOTH_FALSE, BOTH_TRUE, "delivery")).toBeNull();
    expect(blockingServiceKind(BOTH_TRUE, BOTH_FALSE, "delivery")).toBeNull();
  });

  it("missing category stays permissive (orders-route ?? {} path)", () => {
    expect(blockingServiceKind(BOTH_TRUE, {}, "delivery")).toBeNull();
    expect(blockingServiceKind(PICKUP_ONLY, {}, "delivery")).toBe("pickupOnly");
  });
});

describe("normalizedServiceWrite (save-side canonical form)", () => {
  it("explicit both-false becomes both-true", () => {
    expect(normalizedServiceWrite(false, false)).toEqual({ forPickup: true, forDelivery: true });
  });

  it("single-flag updates pass through and omit the absent key", () => {
    expect(normalizedServiceWrite(false, undefined)).toEqual({ forPickup: false });
    expect(normalizedServiceWrite(undefined, false)).toEqual({ forDelivery: false });
    expect(normalizedServiceWrite(true, undefined)).toEqual({ forPickup: true });
  });

  it("no flags in the request → empty object (PATCH leaves fields untouched)", () => {
    expect(normalizedServiceWrite(undefined, undefined)).toEqual({});
  });

  it("coerces truthy/falsy request values to booleans", () => {
    expect(normalizedServiceWrite(1 as any, 0 as any)).toEqual({ forPickup: true, forDelivery: false });
  });
});

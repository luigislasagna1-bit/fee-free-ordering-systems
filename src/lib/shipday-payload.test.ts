import { describe, it, expect } from "vitest";
import { buildShipdayOrderBody, translateShipdayEvent, type DispatchInput } from "@/lib/shipday-payload";

// Locks the ShipDay insert-delivery-order CONTRACT
// (docs.shipday.com/reference/insert-delivery-order). Both regressions these
// tests pin were found live on Luigi's store 2026-07-12: a full-ISO
// expectedPickupTime and a bare 10-digit phone made ShipDay silently reject
// (HTTP 200 + success:false).

const NOW = new Date("2026-07-12T06:00:00.000Z");

function mkInput(o: Partial<DispatchInput> = {}): DispatchInput {
  return {
    orderId: "ord_abc123",
    orderNumber: "ORD-983622869",
    customerName: "Sameem Nabil",
    customerEmail: "customer@example.com",
    customerPhone: "6476690808",
    customerAddress: "933 maple ave, milton, L9T2H6",
    customerLat: 43.51,
    customerLng: -79.88,
    restaurantName: "Luigi's Lasagna & Pizzeria",
    restaurantAddress: "506 Collis Court, Milton, ON, L9T5M7",
    restaurantPhone: "(905) 555-1234",
    restaurantLat: 43.52,
    restaurantLng: -79.87,
    subtotal: 1.79,
    taxAmount: 1.27,
    deliveryFee: 7.99,
    tip: 0.27,
    total: 11.32,
    creditApplied: 0,
    preparationMinutes: 30,
    deliveryInstruction: "ring twice",
    items: [{ name: "Doritos Chips", quantity: 1, unitPrice: 1.79 }],
    ...o,
  };
}

describe("buildShipdayOrderBody — ShipDay insert-order contract", () => {
  it("times are TIME-ONLY hh:mm:ss and the date is yyyy-mm-dd (the silent-rejection regression)", () => {
    const b = buildShipdayOrderBody(mkInput(), NOW);
    // prep 30min → pickup 06:30:00; +25min drive → delivery 06:55:00
    expect(b.expectedPickupTime).toBe("06:30:00");
    expect(b.expectedDeliveryTime).toBe("06:55:00");
    expect(b.expectedDeliveryDate).toBe("2026-07-12");
    // NEVER a full ISO datetime:
    expect(String(b.expectedPickupTime)).not.toContain("T");
    expect(String(b.expectedDeliveryTime)).not.toContain("T");
  });

  it("delivery date rolls over midnight correctly", () => {
    const b = buildShipdayOrderBody(mkInput({ preparationMinutes: 45 }), new Date("2026-07-12T23:30:00.000Z"));
    expect(b.expectedPickupTime).toBe("00:15:00");
    expect(b.expectedDeliveryDate).toBe("2026-07-13");
    expect(b.expectedDeliveryTime).toBe("00:40:00");
  });

  it("phones go out E.164 with country code (the second silent-rejection cause)", () => {
    const b = buildShipdayOrderBody(mkInput(), NOW);
    expect(b.customerPhoneNumber).toBe("+16476690808");
    expect(b.restaurantPhoneNumber).toBe("+19055551234");
  });

  it("an already-international phone is preserved; unparseable input falls back raw", () => {
    const b = buildShipdayOrderBody(mkInput({ customerPhone: "+39 02 1234 5678", restaurantPhone: "12" }), NOW);
    expect(b.customerPhoneNumber).toBe("+390212345678");
    // sanitizePhone returns null for "12" → raw fallback so ShipDay's error names the field
    expect(b.restaurantPhoneNumber).toBe("12");
  });

  it("totalOrderCost is the driver COLLECT amount: total − credit, clamped ≥ 0, 2dp", () => {
    expect(buildShipdayOrderBody(mkInput(), NOW).totalOrderCost).toBe(11.32);
    expect(buildShipdayOrderBody(mkInput({ creditApplied: 11.32 }), NOW).totalOrderCost).toBe(0);
    expect(buildShipdayOrderBody(mkInput({ creditApplied: 9.11, total: 10.71 }), NOW).totalOrderCost).toBe(1.6);
    expect(buildShipdayOrderBody(mkInput({ creditApplied: 99 }), NOW).totalOrderCost).toBe(0);
  });

  it("money fields are rounded to 2dp (no float artifacts in the JSON)", () => {
    const b = buildShipdayOrderBody(mkInput({ tip: 0.1 + 0.2, taxAmount: 1.005 }), NOW);
    expect(b.tips).toBe(0.3);
    expect(b.deliveryFee).toBe(7.99);
    expect(String(b.tips)).not.toMatch(/\d{10,}/);
  });

  it("line items ride along with name/quantity/unitPrice", () => {
    const b = buildShipdayOrderBody(mkInput(), NOW);
    expect(b.orderItem).toEqual([{ name: "Doritos Chips", quantity: 1, unitPrice: 1.79 }]);
  });

  it("required identity fields are always present; additionalId is our order id", () => {
    const b = buildShipdayOrderBody(mkInput(), NOW);
    for (const k of ["orderNumber", "customerName", "customerAddress", "customerPhoneNumber", "restaurantName", "restaurantAddress"]) {
      expect(b[k], k).toBeTruthy();
    }
    expect(b.additionalId).toBe("ord_abc123");
    expect(b.orderSource).toBe("Fee Free Ordering");
  });

  it("paymentMethod is deliberately ABSENT (its enum would require card fields)", () => {
    const b = buildShipdayOrderBody(mkInput(), NOW);
    expect("paymentMethod" in b).toBe(false);
  });

  it("coordinates pass through when present, undefined when absent (ShipDay geocodes then)", () => {
    const withCoords = buildShipdayOrderBody(mkInput(), NOW);
    expect(withCoords.deliveryLatitude).toBe(43.51);
    expect(withCoords.pickupLongitude).toBe(-79.87);
    const without = buildShipdayOrderBody(mkInput({ customerLat: null, customerLng: null }), NOW);
    expect(without.deliveryLatitude).toBeUndefined();
  });
});

// ShipDay's DOCUMENTED webhook event vocabulary (order-status-update-2) —
// the original guessed names missed ORDER_PIKEDUP (ShipDay's spelling!),
// ORDER_ONTHEWAY, ORDER_FAILED, ORDER_DELETE; Luigi's live delivered order
// stayed "accepted" forever (2026-07-12).
describe("translateShipdayEvent — documented vocabulary", () => {
  it("ORDER_PIKEDUP (their typo) and ORDER_ONTHEWAY → picked_up / ready", () => {
    expect(translateShipdayEvent("ORDER_PIKEDUP")).toEqual({ shipdayStatus: "picked_up", orderStatus: "ready" });
    expect(translateShipdayEvent("ORDER_ONTHEWAY")).toEqual({ shipdayStatus: "picked_up", orderStatus: "ready" });
  });

  it("ORDER_COMPLETED → delivered / completed", () => {
    expect(translateShipdayEvent("ORDER_COMPLETED")).toEqual({ shipdayStatus: "delivered", orderStatus: "completed" });
  });

  it("failure + deletion families map without touching order status", () => {
    expect(translateShipdayEvent("ORDER_FAILED")).toEqual({ shipdayStatus: "failed", orderStatus: null });
    expect(translateShipdayEvent("ORDER_INCOMPLETE")).toEqual({ shipdayStatus: "failed", orderStatus: null });
    expect(translateShipdayEvent("ORDER_DELETE")).toEqual({ shipdayStatus: "cancelled", orderStatus: null });
  });

  it("assignment shuffle events track shipdayStatus only; unknown events are inert", () => {
    expect(translateShipdayEvent("ORDER_UNASSIGNED")).toEqual({ shipdayStatus: "unassigned", orderStatus: null });
    expect(translateShipdayEvent("ORDER_PIKEDUP_REMOVED")).toEqual({ shipdayStatus: "assigned", orderStatus: null });
    expect(translateShipdayEvent("ORDER_ACCEPTED_AND_STARTED")).toEqual({ shipdayStatus: "started", orderStatus: null });
    expect(translateShipdayEvent("ORDER_POD_UPLOAD")).toEqual({ shipdayStatus: null, orderStatus: null });
    expect(translateShipdayEvent("ORDER_INSERTED")).toEqual({ shipdayStatus: null, orderStatus: null });
  });

  it("legacy guessed aliases still translate (backward compat)", () => {
    expect(translateShipdayEvent("ORDER_ONTHEWAY_STATUS").orderStatus).toBe("ready");
    expect(translateShipdayEvent("ORDER_FAILED_DELIVERY").shipdayStatus).toBe("failed");
    expect(translateShipdayEvent("ORDER_DELETED").shipdayStatus).toBe("cancelled");
  });
});

import { describe, it, expect } from "vitest";
import { serviceLabel } from "./service-labels";

// Stand-in for a next-intl "ordering" translator: returns a marker so we can
// assert WHICH canonical key was localized.
const t = (k: string) => `LOC:${k}`;

describe("serviceLabel — customer-facing service name", () => {
  it("localizes when the displayName is the seeded English default", () => {
    // ristorante-test's real case: 5/6 services sit on the English default.
    expect(serviceLabel("pickup", { pickup: { displayName: "Pickup" } }, t)).toBe("LOC:pickup");
    expect(serviceLabel("dineIn", { dineIn: { displayName: "Dine-In" } }, t)).toBe("LOC:dineIn");
    expect(serviceLabel("takeOut", { takeOut: { displayName: "Take Out" } }, t)).toBe("LOC:takeOut");
    expect(serviceLabel("catering", { catering: { displayName: "Catering" } }, t)).toBe("LOC:catering");
  });

  it("localizes when serviceSettings is missing or empty", () => {
    expect(serviceLabel("pickup", undefined, t)).toBe("LOC:pickup");
    expect(serviceLabel("pickup", null, t)).toBe("LOC:pickup");
    expect(serviceLabel("pickup", {}, t)).toBe("LOC:pickup");
  });

  it("localizes when the displayName is blank/whitespace", () => {
    expect(serviceLabel("pickup", { pickup: { displayName: "   " } }, t)).toBe("LOC:pickup");
    expect(serviceLabel("delivery", { delivery: { displayName: "" } }, t)).toBe("LOC:delivery");
  });

  it("honors a GENUINE custom rename (differs from the default)", () => {
    expect(serviceLabel("delivery", { delivery: { displayName: "Consegna" } }, t)).toBe("Consegna");
    expect(serviceLabel("pickup", { pickup: { displayName: "Express Pickup" } }, t)).toBe("Express Pickup");
  });

  it("maps the reservations key to the tableReservation canonical label", () => {
    expect(serviceLabel("reservations", { reservations: { displayName: "Table Reservations" } }, t)).toBe("LOC:tableReservation");
  });
});

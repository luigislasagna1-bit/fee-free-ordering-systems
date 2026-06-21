import { describe, it, expect } from "vitest";
import { resolveServiceHours } from "./service-hours";
import { liveOpenStatus, nextOpenAt } from "./restaurant-hours";

/**
 * Fabrizio report (2026-06-21): per-service opening hours must GATE ordering.
 * A restaurant open generally 09:00–22:00 but with Pickup hours 14:00–21:00 must
 * NOT offer an ASAP pickup at 11:50 — pickup is closed until 14:00. The general
 * hours still read "open" (that drives the header chip + sound notifications),
 * but the pickup-RESOLVED hours read "opens at 14:00", which blocks ASAP and sets
 * 14:00 as the earliest slot. These lock the exact split the fix relies on.
 *
 * 2021-08-01 is a Sunday (dayOfWeek 0); we pin everything in UTC so the clock is
 * deterministic regardless of the test runner's local timezone.
 */
describe("per-service hours gate ordering (Fabrizio report)", () => {
  const SUN_1150 = new Date("2021-08-01T11:50:00Z");
  const hours = [
    { dayOfWeek: 0, openTime: "09:00", closeTime: "22:00", isOpen: true, service: null },     // general Sunday
    { dayOfWeek: 0, openTime: "14:00", closeTime: "21:00", isOpen: true, service: "pickup" },  // pickup Sunday
  ];

  it("GENERAL (default) hours read OPEN at 11:50 — drives the header chip + sound", () => {
    expect(liveOpenStatus(hours as any, SUN_1150, "24h", undefined, "UTC").kind).toBe("open");
  });

  it("PICKUP-resolved hours read CLOSED (opens at 14:00) at 11:50 — ASAP blocked", () => {
    const pickup = resolveServiceHours(hours as any, "pickup");
    const svc = liveOpenStatus(pickup as any, SUN_1150, "24h", undefined, "UTC");
    expect(svc.kind).toBe("opens_at");
    if (svc.kind === "opens_at") expect(svc.opensAt).toBe("14:00");
  });

  it("pickup's next opening from 11:50 is today at 14:00 — the earliest schedulable slot", () => {
    const pickup = resolveServiceHours(hours as any, "pickup");
    const next = nextOpenAt(pickup as any, SUN_1150, "UTC", []);
    expect(next).not.toBeNull();
    expect(next!.getUTCDate()).toBe(1);   // Aug 1
    expect(next!.getUTCHours()).toBe(14); // 14:00
  });

  it("pickup is OPEN at 15:00 — ASAP allowed", () => {
    const SUN_1500 = new Date("2021-08-01T15:00:00Z");
    const pickup = resolveServiceHours(hours as any, "pickup");
    expect(liveOpenStatus(pickup as any, SUN_1500, "24h", undefined, "UTC").kind).toBe("open");
  });

  it("NO REGRESSION: a restaurant with ONLY general hours → ASAP works (resolves to default)", () => {
    const generalOnly = [{ dayOfWeek: 0, openTime: "09:00", closeTime: "22:00", isOpen: true, service: null }];
    const pickup = resolveServiceHours(generalOnly as any, "pickup"); // no pickup row → falls back to default
    expect(liveOpenStatus(pickup as any, SUN_1150, "24h", undefined, "UTC").kind).toBe("open");
  });

  it("delivery resolves independently — pickup-closed day doesn't block delivery", () => {
    const mixed = [
      { dayOfWeek: 0, openTime: "14:00", closeTime: "21:00", isOpen: true, service: "pickup" },
      { dayOfWeek: 0, openTime: "09:00", closeTime: "22:00", isOpen: true, service: "delivery" },
    ];
    const delivery = resolveServiceHours(mixed as any, "delivery");
    expect(liveOpenStatus(delivery as any, SUN_1150, "24h", undefined, "UTC").kind).toBe("open");
  });
});

/**
 * The reservation slip has TWO builders that must stay in lockstep: the ESC/POS
 * byte builder (receipt.ts, the GOLDEN pipeline) and the line builder used by
 * the native LAN printer path (receipt-lines.ts). A section added to one and
 * forgotten in the other is invisible until paper comes out wrong, so assert
 * both emit the same booking-question set — and that legacy bookings print
 * exactly as they did before (Fabrizio cmsajnvkm).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));

import { buildReservationReceipt, type ReservationReceiptData } from "./receipt";
import { buildReservationReceiptLines } from "./receipt-lines";
import type { ReservationDetails } from "./reservation-details";

const DETAILS: ReservationDetails = {
  childSeating: { highChairs: 2, strollers: 1 },
  allergies: "Shellfish",
  occasion: "birthday",
  accessibility: "Step-free seating",
};

const BASE: ReservationReceiptData = {
  restaurantName: "Luigi's Lasagna & Pizzeria",
  confirmationCode: "AB12CD",
  customerName: "Sadaf",
  partySize: 5,
  date: "2026-08-08",
  time: "19:00",
  status: "confirmed",
  createdAt: new Date("2026-08-01T12:00:00Z"),
  currency: "cad",
};

const textOf = (buf: Buffer) => buf.toString("latin1");

describe("reservation slip — booking questions (both builders in lockstep)", () => {
  it("ESC/POS bytes carry the split + every section", async () => {
    const out = textOf(await buildReservationReceipt(
      { ...BASE, adultsCount: 3, childrenCount: 2, details: DETAILS }, "80mm", "escpos", "en",
    ));
    expect(out).toContain("3 adults / 2 children");
    expect(out).toContain("CHILD SEATING");
    expect(out).toContain("High chair");
    expect(out).toContain("Stroller");
    expect(out).toContain("ALLERGIES");
    expect(out).toContain("Shellfish");
    expect(out).toContain("OCCASION");
    expect(out).toContain("Birthday");
    expect(out).toContain("ACCESSIBILITY");
    expect(out).toContain("Step-free seating");
  });

  it("line builder emits the SAME sections (no drift between the two)", async () => {
    const lines = (await buildReservationReceiptLines(
      { ...BASE, adultsCount: 3, childrenCount: 2, details: DETAILS }, "80mm", "en",
    )).map((l: { text?: string }) => l.text ?? "").join("\n");
    for (const needle of ["3 adults / 2 children", "CHILD SEATING", "High chair", "Stroller",
      "ALLERGIES", "Shellfish", "OCCASION", "Birthday", "ACCESSIBILITY", "Step-free seating"]) {
      expect(lines).toContain(needle);
    }
  });

  it("legacy booking prints exactly as before in BOTH builders", async () => {
    const bytes = textOf(await buildReservationReceipt(BASE, "80mm", "escpos", "en"));
    const lines = (await buildReservationReceiptLines(BASE, "80mm", "en"))
      .map((l: { text?: string }) => l.text ?? "").join("\n");
    for (const out of [bytes, lines]) {
      expect(out).toContain("Party of 5");
      expect(out).not.toContain("adults /");
      expect(out).not.toContain("CHILD SEATING");
      expect(out).not.toContain("ALLERGIES");
      expect(out).not.toContain("ACCESSIBILITY");
    }
  });

  it("prints only the sections the guest actually answered", async () => {
    const out = textOf(await buildReservationReceipt(
      { ...BASE, details: { allergies: "Gluten" } }, "80mm", "escpos", "en",
    ));
    expect(out).toContain("ALLERGIES");
    expect(out).toContain("Gluten");
    expect(out).not.toContain("CHILD SEATING");
    expect(out).not.toContain("OCCASION");
  });
});

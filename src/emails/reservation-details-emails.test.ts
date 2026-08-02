/**
 * Reservation "smart buttons" (Fabrizio cmsajnvkm) must reach BOTH emails —
 * and must leave legacy bookings looking exactly as they did before.
 *
 * Same reasoning as gift-emails.test.ts: tsc and the i18n parity audit both
 * pass while a template quietly forgets to pass a value, so render the real
 * templates through the real translator and assert on the HTML.
 */
import { describe, it, expect, vi } from "vitest";

// getDict -> i18n-server -> @/lib/db, which throws without DATABASE_URL.
vi.mock("@/lib/db", () => ({ default: {} }));

import { renderEmail } from "./render";
import { getDict } from "@/lib/i18n-dict";
import NewReservationNotification from "./templates/NewReservationNotification";
import ReservationConfirmation from "./templates/ReservationConfirmation";
import type { ReservationDetails } from "@/lib/reservation-details";

const LOCALES = ["en", "it", "fr", "de", "ja", "ar"];

const FULL_DETAILS: ReservationDetails = {
  childSeating: { highChairs: 2, strollers: 1 },
  allergies: "Shellfish and peanuts",
  occasion: "anniversary",
  accessibility: "Step-free seating please",
};

function leftoverPlaceholders(html: string): string[] {
  return [...html.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)].map((m) => m[0]);
}

describe("staff new-reservation email carries the booking questions", () => {
  it.each(LOCALES)("renders every section with no leftover placeholders — %s", async (locale) => {
    const t = await getDict(locale);
    const html = await renderEmail(
      NewReservationNotification({
        t,
        restaurantName: "Luigi's Lasagna & Pizzeria",
        reservationNumber: "AB12CD",
        customerName: "Sadaf",
        customerPhone: "+1 905 555 0100",
        customerEmail: "guest@example.com",
        dateTime: "Friday, 8 August, 19:00",
        partySize: 5,
        adultsCount: 3,
        childrenCount: 2,
        details: FULL_DETAILS,
        dashboardUrl: "https://feefreeordering.com/admin/reservations",
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
    // The guest's own words must survive verbatim in every locale.
    expect(html).toContain("Shellfish and peanuts");
    expect(html).toContain("Step-free seating please");
  });

  it("legacy booking (no split, no details) renders no new sections", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      NewReservationNotification({
        t,
        restaurantName: "Luigi's",
        reservationNumber: "AB12CD",
        customerName: "Guest",
        dateTime: "Friday, 8 August, 19:00",
        partySize: 4,
        dashboardUrl: "https://feefreeordering.com/admin/reservations",
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
    expect(html).not.toContain("Child seating");
    expect(html).not.toContain("Allergies");
    expect(html).not.toContain("Accessibility");
    // …but the classic party badge is untouched.
    expect(html).toContain("Party of 4");
  });
});

describe("customer confirmation email echoes the booking questions", () => {
  it.each(LOCALES)("renders details + notes with no leftover placeholders — %s", async (locale) => {
    const t = await getDict(locale);
    const html = await renderEmail(
      ReservationConfirmation({
        t,
        status: "confirmed",
        customerName: "Sadaf",
        reservationNumber: "AB12CD",
        restaurantName: "Luigi's Lasagna & Pizzeria",
        dateTime: "Friday, 8 August, 19:00",
        partySize: 5,
        adultsCount: 3,
        childrenCount: 2,
        details: FULL_DETAILS,
        specialRequests: "Window table if possible",
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
    expect(html).toContain("Shellfish and peanuts");
    // The specialRequests card was dead code until this feature wired it.
    expect(html).toContain("Window table if possible");
  });

  it("occasion 'other' shows the guest's own wording alongside the label", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      ReservationConfirmation({
        t,
        status: "confirmed",
        customerName: "Guest",
        reservationNumber: "AB12CD",
        restaurantName: "Luigi's",
        dateTime: "Friday, 8 August, 19:00",
        partySize: 2,
        details: { occasion: "other", occasionOther: "Graduation dinner" },
      }),
    );
    expect(html).toContain("Graduation dinner");
    expect(leftoverPlaceholders(html)).toEqual([]);
  });

  it("legacy booking renders unchanged", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      ReservationConfirmation({
        t,
        status: "confirmed",
        customerName: "Guest",
        reservationNumber: "AB12CD",
        restaurantName: "Luigi's",
        dateTime: "Friday, 8 August, 19:00",
        partySize: 4,
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
    expect(html).not.toContain("Child seating");
    expect(html).not.toContain("Accessibility");
  });
});

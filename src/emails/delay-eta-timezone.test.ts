/**
 * The delayed-order email must state the new ready time in the RESTAURANT's
 * clock, never the server's.
 *
 * Real defect (Fabrizio, report cms0gyexp #16, 2026-08-07): an order at his
 * Italian store was due at 23:06 and the kitchen added 15 minutes, so the new
 * time was 23:21 local. The email told the customer **9:21 PM**.
 *
 * The template formatted with a bare `toLocaleString()` — no `timeZone` — so it
 * rendered in the Vercel server's clock (UTC). 23:21 CEST is 21:21 UTC, which
 * printed as 9:21 PM: two hours EARLIER than the time the customer was already
 * expecting, which reads as nonsense and erodes trust in every ETA we send.
 *
 * The same class of bug had already been fixed for the ACCEPTED email in
 * 2026-06-05; this template was missed in that sweep. Rendering the real
 * template is the only way to catch it — types can't, and the i18n audit can't.
 */
import { describe, it, expect, vi } from "vitest";

// getDict -> i18n-server -> @/lib/db, which throws without DATABASE_URL.
vi.mock("@/lib/db", () => ({ default: {} }));

import { renderEmail } from "./render";
import { getDict } from "@/lib/i18n-dict";
import OrderDelayed from "./templates/OrderDelayed";

/** 2026-08-07 23:21 in Europe/Rome (CEST, UTC+2) === 21:21 UTC. */
const NEW_READY = new Date("2026-08-07T21:21:00.000Z");

async function render(extra: Record<string, unknown>) {
  const t = await getDict("it");
  return renderEmail(
    OrderDelayed({
      t,
      customerName: "Fabrizio",
      orderNumber: "ORD-984075479",
      restaurantName: "Japanese Restaurant | TEST",
      newEstimatedReady: NEW_READY,
      delayMinutes: 15,
      orderType: "delivery",
      trackingUrl: "https://example.test/status",
      ...extra,
    } as never),
  );
}

describe("OrderDelayed — new ETA is in the restaurant's timezone", () => {
  it("prints 23:21 for a Rome restaurant, not the UTC 21:21", async () => {
    const html = await render({ timezone: "Europe/Rome", hoursFormat: "24h", locale: "it" });
    expect(html).toContain("23:21");
    // 21:21 is the UTC instant — the exact wrong answer the customer received.
    expect(html).not.toContain("21:21");
  });

  it("honours the restaurant's 12h preference", async () => {
    const html = await render({ timezone: "Europe/Rome", hoursFormat: "12h", locale: "en" });
    expect(html).toMatch(/11:21/);
    expect(html).not.toContain("9:21");
  });

  it("is correct for a New York restaurant too (UTC-4)", async () => {
    // Same instant is 17:21 in New York.
    const html = await render({ timezone: "America/New_York", hoursFormat: "24h", locale: "en" });
    expect(html).toContain("17:21");
    expect(html).not.toContain("21:21");
  });

  it("falls back to UTC rather than crashing when no timezone is supplied", async () => {
    // Legacy callers must still render — just without the correction.
    const html = await render({ hoursFormat: "24h", locale: "en" });
    expect(html).toContain("21:21");
  });
});

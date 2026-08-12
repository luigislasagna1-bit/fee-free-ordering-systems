/**
 * Customer SMS + branded-app PUSH bodies, end to end through notifyCustomer.
 *
 * `buildCustomerSms` built every body from hardcoded English template literals
 * until 2026-08-11 — the customer's locale was resolved two lines above the
 * call and simply never passed in. Nothing had shipped only because no
 * restaurant held a `customer_sms` or `app_store_listing` entitlement yet.
 * These tests pin the three things that made that fix worth doing, plus the
 * two behaviours that were ALREADY right and must not regress:
 *
 *   - the text lands in the customer's language, not the server's English;
 *   - the ETA is the RESTAURANT's wall clock (an Italian store once texted a
 *     time two hours off — Fabrizio cms0gyexp #16), in its 12h/24h format;
 *   - a timed-out order reads as "we missed it", never leaking the internal
 *     "Auto-rejected:" reason at the customer (Luigi 2026-06-09);
 *   - a guest self-CANCELLED reservation says cancelled — it used to fall
 *     through to the confirmed branch and text "confirmed" to someone who had
 *     just cancelled;
 *   - SMS and push always carry the identical body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, sendSmsMock, hasFeatureMock, sendPushMock, wantsPushMock } = vi.hoisted(() => ({
  prismaMock: { restaurant: { findUnique: vi.fn() } },
  sendSmsMock: vi.fn(async () => ({ sent: true, sid: "SM1" })),
  hasFeatureMock: vi.fn(async () => true),
  sendPushMock: vi.fn(async () => undefined),
  wantsPushMock: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/sms", () => ({ sendSms: sendSmsMock }));
vi.mock("@/lib/entitlements", () => ({ hasFeature: hasFeatureMock }));
vi.mock("@/lib/customer-push", () => ({
  sendCustomerPush: sendPushMock,
  customerWantsOrderPush: wantsPushMock,
}));
// The email side is out of scope here — every sender is a no-op so the test
// exercises only the SMS/push path.
vi.mock("@/lib/email", () => ({
  sendNewOrderNotificationEmail: vi.fn(),
  sendCustomerSignupNotificationEmail: vi.fn(),
  sendOrderAcceptedNotificationEmail: vi.fn(),
  sendNewReservationNotification: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendOrderStatusUpdateEmail: vi.fn(),
  sendOrderDelayedEmail: vi.fn(),
  sendOrderRejectedEmail: vi.fn(),
  sendOrderCanceledEmail: vi.fn(),
  sendDispatchRejectedEmail: vi.fn(),
  sendReservationConfirmation: vi.fn(),
  setEmailImprint: vi.fn(),
  setEmailLogoUrl: vi.fn(),
}));

import { notifyCustomer, type CustomerEventPayload } from "./notifications";

// The first getDict() call dynamically imports a 7k-key message catalog (plus
// the English fallback); on a cold run that alone can outlast the 5s default.
vi.setConfig({ testTimeout: 30_000 });

/** An Italian store: Rome clock, 24h, everything the customer path selects.
 *  kitchenWorkflowMode is "advanced" because "simple" mode deliberately
 *  suppresses the intermediate preparing/ready updates — see the last test. */
function restaurant(over: Record<string, unknown> = {}) {
  return {
    name: "Trattoria Fabrizio",
    slug: "trattoria-fabrizio",
    subdomain: null,
    customDomain: null,
    customDomainStatus: null,
    phone: "+390612345678",
    email: "ciao@example.test",
    defaultLanguage: "it",
    currency: "eur",
    timezone: "Europe/Rome",
    hoursFormat: "24h",
    receiptLogoUrl: null,
    customerEmailOrderConfirm: true,
    customerEmailPickupReady: true,
    customerEmailDeliveryReady: true,
    customerEmailDineInReady: true,
    customerEmailOrderRejected: true,
    kitchenWorkflowMode: "advanced",
    // resolveImprint() re-reads the restaurant inside withImprint().
    resellerProfile: null,
    ...over,
  };
}

/** Send and hand back the body Twilio was asked to deliver. */
async function smsBody(payload: CustomerEventPayload, opts: Record<string, unknown> = {}) {
  await notifyCustomer({
    restaurantId: "r1",
    customerEmail: "guest@example.test",
    customerPhone: "+15551234567",
    customerLocale: "it",
    payload,
    ...opts,
  });
  return sendSmsMock.mock.calls.at(-1)?.[0]?.body as string | undefined;
}

/** 2026-08-15 19:30 in Europe/Rome (CEST, UTC+2) === 17:30 UTC. */
const READY_AT = new Date("2026-08-15T17:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  sendSmsMock.mockResolvedValue({ sent: true, sid: "SM1" });
  hasFeatureMock.mockResolvedValue(true);
  wantsPushMock.mockResolvedValue(true);
  prismaMock.restaurant.findUnique.mockResolvedValue(restaurant());
});

describe("customer SMS — language", () => {
  it("texts an Italian customer in Italian", async () => {
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "ready",
    });
    expect(body).toBe("Trattoria Fabrizio: Il tuo ordine #ORD-143921044 è pronto!");
  });

  it("texts a German customer in German, from the SAME event", async () => {
    const body = await smsBody(
      {
        event: "orderStatusUpdate",
        customerName: "Jonas",
        orderNumber: "ORD-143921044",
        status: "ready",
      },
      { customerLocale: "de" },
    );
    expect(body).toBe("Trattoria Fabrizio: Ihre Bestellung #ORD-143921044 ist fertig!");
  });

  it("falls back to the restaurant's default language when the guest has none", async () => {
    const body = await smsBody(
      { event: "orderStatusUpdate", customerName: "Ospite", orderNumber: "ORD-1", status: "completed" },
      { customerLocale: undefined },
    );
    // Restaurant.defaultLanguage is "it".
    expect(body).toContain("è completato");
  });
});

describe("customer SMS — the ETA is the restaurant's clock", () => {
  it("renders the ready time in the restaurant timezone, not the server's UTC", async () => {
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "accepted",
      estimatedReady: READY_AT,
    });
    // 17:30 UTC is 19:30 in Rome. Texting "17:30" is the two-hours-off defect.
    expect(body).toContain("19:30");
    expect(body).not.toContain("17:30");
  });

  it("honours a 12h restaurant", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(restaurant({ hoursFormat: "12h" }));
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "accepted",
      estimatedReady: READY_AT,
    });
    expect(body).toContain("7:30 PM");
  });

  it("drops the ETA clause entirely when there is no estimate", async () => {
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "accepted",
    });
    expect(body).toBe("Trattoria Fabrizio: Ordine #ORD-143921044 accettato.");
  });
});

describe("customer SMS — orders that die", () => {
  it("tells a timed-out order it was missed, without leaking the internal reason", async () => {
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "rejected",
      rejectionReason: "Auto-rejected: no response in 15 minutes",
    });
    expect(body).not.toContain("Auto-rejected");
    expect(body).toContain("Spiacenti");
    expect(body).toContain("non ti verrà addebitato nulla");
  });

  it("passes a staff-typed rejection reason through verbatim", async () => {
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "rejected",
      rejectionReason: "Finita la pasta",
    });
    expect(body).toBe("Trattoria Fabrizio: Ordine #ORD-143921044 non accettato - Finita la pasta");
  });

  it("distinguishes cancelled from not-accepted", async () => {
    const body = await smsBody({
      event: "orderStatusUpdate",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      status: "cancelled",
    });
    expect(body).toBe("Trattoria Fabrizio: Ordine #ORD-143921044 annullato.");
  });
});

describe("customer SMS — placement", () => {
  it("promises a follow-up text on a normal order", async () => {
    const body = await smsBody({
      event: "orderConfirmed",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      items: [],
      total: 24,
      orderType: "pickup",
      estimatedTime: 20,
      trackingUrl: "https://example.test/status/o1",
    });
    expect(body).toContain("quando sarà accettato");
    expect(body?.endsWith("https://example.test/status/o1")).toBe(true);
  });

  it("does NOT promise one on an auto-accepted order — no second text is coming", async () => {
    const body = await smsBody({
      event: "orderConfirmed",
      customerName: "Giulia",
      orderNumber: "ORD-143921044",
      items: [],
      total: 24,
      orderType: "pickup",
      estimatedTime: 20,
      alreadyAccepted: true,
      estimatedReady: READY_AT,
      trackingUrl: "https://example.test/status/o1",
    });
    expect(body).toContain("confermato");
    expect(body).toContain("19:30");
    expect(body).not.toContain("quando sarà accettato");
  });
});

describe("customer SMS — reservations", () => {
  const base = {
    event: "reservationConfirmation" as const,
    customerName: "Giulia",
    partySize: 4,
    date: "2026-08-15",
    time: "19:00",
    confirmationCode: "A1B2C3",
  };

  it("confirms a confirmed booking", async () => {
    const body = await smsBody({ ...base, status: "confirmed" });
    expect(body).toBe(
      "Trattoria Fabrizio: Prenotazione per 4 pers. il 2026-08-15 alle 19:00 confermata. Codice A1B2C3",
    );
  });

  it("does NOT tell a guest who cancelled that their table is confirmed", async () => {
    const body = await smsBody({ ...base, status: "cancelled" });
    expect(body).toContain("annullata");
    expect(body).not.toContain("confermata");
  });

  it("uses the missed tone for an auto-declined booking, never a refusal", async () => {
    const body = await smsBody({ ...base, status: "missed" });
    expect(body).toContain("in tempo");
    expect(body).not.toContain("confermata");
  });

  it("renders the booking time in the restaurant's 12h format", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(restaurant({ hoursFormat: "12h" }));
    const body = await smsBody({ ...base, status: "confirmed" });
    expect(body).toContain("7:00 PM");
  });
});

describe("customer SMS + push — gating and parity", () => {
  it("sends nothing without the customer_sms add-on", async () => {
    hasFeatureMock.mockResolvedValue(false);
    await notifyCustomer({
      restaurantId: "r1",
      customerEmail: "guest@example.test",
      customerPhone: "+15551234567",
      customerLocale: "it",
      payload: { event: "orderStatusUpdate", customerName: "G", orderNumber: "ORD-1", status: "ready" },
    });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("gives the branded-app push the byte-identical body", async () => {
    await notifyCustomer({
      restaurantId: "r1",
      customerEmail: "guest@example.test",
      customerPhone: "+15551234567",
      customerId: "c1",
      customerLocale: "it",
      payload: { event: "orderStatusUpdate", customerName: "G", orderNumber: "ORD-1", status: "ready" },
    });
    const texted = sendSmsMock.mock.calls[0][0].body;
    const pushed = sendPushMock.mock.calls[0][2].body;
    expect(pushed).toBe(texted);
    expect(pushed).toContain("è pronto!");
  });

  it("respects simple kitchen mode, which suppresses intermediate updates", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(restaurant({ kitchenWorkflowMode: "simple" }));
    await notifyCustomer({
      restaurantId: "r1",
      customerEmail: "guest@example.test",
      customerPhone: "+15551234567",
      customerLocale: "it",
      payload: { event: "orderStatusUpdate", customerName: "G", orderNumber: "ORD-1", status: "ready" },
    });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("stays silent on a status with no text shape (e.g. preparing)", async () => {
    await notifyCustomer({
      restaurantId: "r1",
      customerEmail: "guest@example.test",
      customerPhone: "+15551234567",
      customerLocale: "it",
      payload: { event: "orderStatusUpdate", customerName: "G", orderNumber: "ORD-1", status: "preparing" },
    });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

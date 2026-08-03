import { describe, it, expect, vi, beforeEach } from "vitest";

// Only notifyStaff's dispatchRejected wiring is under test here — mock the
// email transport layer entirely (no real Resend call) and a minimal
// @/lib/db surface (restaurant + notificationRecipients lookup).
const { prismaMock, sendDispatchRejectedEmailMock } = vi.hoisted(() => ({
  prismaMock: {
    restaurant: { findUnique: vi.fn() },
  },
  sendDispatchRejectedEmailMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
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
  sendDispatchRejectedEmail: sendDispatchRejectedEmailMock,
  sendReservationConfirmation: vi.fn(),
  setEmailImprint: vi.fn(),
  setEmailLogoUrl: vi.fn(),
}));

import { notifyStaff } from "./notifications";

function baseRestaurant(recipients: Array<Record<string, unknown>>) {
  return {
    id: "r1",
    name: "Luigi's Lasagna",
    currency: "usd",
    hoursFormat: "24h",
    notificationRecipients: recipients,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyStaff — dispatchRejected event (ShipDay auto-dispatch rejection alert)", () => {
  const payload = {
    event: "dispatchRejected" as const,
    orderNumber: "ORD-1001",
    customerName: "Jane Doe",
    reason: "ShipDay rejected the order: bad address",
    dashboardUrl: "https://example.com/admin/orders/o1",
  };

  it("fires the email to every active recipient with the dispatchRejected toggle ON", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(
      baseRestaurant([
        { email: "owner@example.com", emailLanguage: "en", isActive: true, dispatchRejected: true },
      ]),
    );

    const result = await notifyStaff({ restaurantId: "r1", payload });

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(sendDispatchRejectedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendDispatchRejectedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        restaurantName: "Luigi's Lasagna",
        orderNumber: "ORD-1001",
        customerName: "Jane Doe",
        reason: payload.reason,
        dashboardUrl: payload.dashboardUrl,
        locale: "en",
      }),
    );
  });

  it("does NOT send when the recipient's dispatchRejected toggle is OFF", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(
      baseRestaurant([
        { email: "owner@example.com", emailLanguage: "en", isActive: true, dispatchRejected: false },
      ]),
    );

    const result = await notifyStaff({ restaurantId: "r1", payload });

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(sendDispatchRejectedEmailMock).not.toHaveBeenCalled();
  });

  it("only emails recipients with the toggle on, skipping the rest, when a restaurant has a mix", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(
      baseRestaurant([
        { email: "on@example.com", emailLanguage: "en", isActive: true, dispatchRejected: true },
        { email: "off@example.com", emailLanguage: "fr", isActive: true, dispatchRejected: false },
      ]),
    );

    const result = await notifyStaff({ restaurantId: "r1", payload });

    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(sendDispatchRejectedEmailMock).toHaveBeenCalledTimes(1);
    // Only the toggled-on recipient gets it, in THEIR OWN emailLanguage —
    // the toggled-off recipient (fr) never appears in the call.
    expect(sendDispatchRejectedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "on@example.com", locale: "en" }),
    );
  });

  it("does nothing when there are no active recipients at all", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(baseRestaurant([]));

    const result = await notifyStaff({ restaurantId: "r1", payload });

    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(sendDispatchRejectedEmailMock).not.toHaveBeenCalled();
  });
});

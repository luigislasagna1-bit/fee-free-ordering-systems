/**
 * POST /api/public/reservations/[id]/cancel   body: { token: string }
 *
 * Customer-initiated reservation cancellation via the emailed link (Fabrizio
 * cms0idtz7). Reservations have NO customer session system, so the
 * purpose-scoped "reservation-cancel" HMAC token is the ONLY auth path.
 *
 * Guards (each with a stable code the confirm page maps to translations):
 *   not_found       — no such reservation
 *   invalid_token   — token missing/forged/wrong purpose/wrong reservation
 *   linked_to_order — reserve-then-order booking: cancel via the ORDER's
 *                     cancel link instead (it syncs this booking; keeping the
 *                     money logic in one place)
 *   wrong_status    — only pending|confirmed bookings are cancellable
 *   too_late        — the reservation time has already passed
 *
 * On success (idempotent claim — a concurrent staff action wins cleanly):
 *   status="cancelled", cancelledBy="customer", rejectionReason stamped.
 *   Deposits are NOT auto-refunded in v1 — the email/page tell the customer
 *   to contact the restaurant about the deposit.
 *   Customer gets the "cancelled" reservation email; staff get a ping via
 *   the existing reservation-notification toggle.
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { verifyActionToken } from "@/lib/order-status-token";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Reservation id required", code: "not_found" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : undefined;

  // Token FIRST — an invalid token learns nothing about the booking
  // (not even whether it exists).
  if (!verifyActionToken("reservation-cancel", id, token)) {
    return NextResponse.json(
      { error: "This cancellation link isn't valid.", code: "invalid_token" },
      { status: 401 },
    );
  }

  const resv = await prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true, restaurantId: true, orderId: true, status: true,
      customerName: true, customerEmail: true, confirmationCode: true,
      partySize: true, date: true, time: true,
      depositPaid: true, depositAmount: true, preOrderTotal: true,
      restaurant: { select: { id: true, name: true, defaultLanguage: true, timezone: true } },
    },
  });
  if (!resv) return NextResponse.json({ error: "Reservation not found", code: "not_found" }, { status: 404 });

  // Reserve-then-order bookings cancel via their ORDER (which syncs this row
  // and owns the money path) — never two independent cancel flows.
  if (resv.orderId) {
    return NextResponse.json(
      { error: "This booking is tied to an order — cancel the order instead.", code: "linked_to_order" },
      { status: 409 },
    );
  }

  if (resv.status !== "pending" && resv.status !== "confirmed") {
    return NextResponse.json(
      { error: `Reservation is ${resv.status} — nothing to cancel.`, code: "wrong_status" },
      { status: 409 },
    );
  }

  // Past reservations can't be cancelled ("too late"). The date/time are the
  // restaurant's LOCAL wall clock — compare against the restaurant's tz.
  try {
    const tz = resv.restaurant.timezone || "UTC";
    const nowLocal = new Date().toLocaleString("sv-SE", { timeZone: tz }); // "YYYY-MM-DD HH:MM:SS"
    const nowKey = nowLocal.slice(0, 16).replace(" ", "T");
    const resvKey = `${resv.date}T${resv.time}`;
    if (resvKey < nowKey) {
      return NextResponse.json(
        { error: "This reservation time has already passed.", code: "too_late" },
        { status: 409 },
      );
    }
  } catch { /* tz parse hiccup — let the cancel proceed rather than block */ }

  // IDEMPOTENT CLAIM — a concurrent staff seat/decline wins; count 0 means
  // the status moved, so re-read and answer accurately with no side effects.
  const claim = await prisma.reservation.updateMany({
    where: { id, status: { in: ["pending", "confirmed"] } },
    data: {
      status: "cancelled",
      cancelledBy: "customer",
      rejectionReason: "Customer cancelled from the reservation link.",
    },
  });
  if (claim.count === 0) {
    const fresh = await prisma.reservation.findUnique({ where: { id }, select: { status: true } });
    return NextResponse.json(
      { error: `Reservation is ${fresh?.status ?? "unknown"} — nothing to cancel.`, code: "wrong_status" },
      { status: 409 },
    );
  }

  // Customer confirmation email — the "cancelled" variant of the reservation
  // email (includes the deposit-contact note when a deposit was paid).
  if (resv.customerEmail) {
    after(
      notifyCustomer({
        restaurantId: resv.restaurant.id,
        customerEmail: resv.customerEmail,
        customerLocale: resv.restaurant.defaultLanguage || "en",
        payload: {
          event: "reservationConfirmation",
          customerName: resv.customerName,
          partySize: resv.partySize,
          date: resv.date,
          time: resv.time,
          confirmationCode: resv.confirmationCode,
          status: "cancelled",
          depositPaid: resv.depositPaid,
          depositAmount: resv.depositAmount,
          reservationId: resv.id,
        },
      }).catch((e: unknown) => console.error("[reservation cancel notifyCustomer]", e)),
    );
  }

  // Staff ping — rides the existing reservation-notification event + toggle.
  {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
    after(
      notifyStaff({
        restaurantId: resv.restaurant.id,
        payload: {
          event: "reservationConfirmed",
          customerName: resv.customerName,
          partySize: resv.partySize,
          date: resv.date,
          time: resv.time,
          confirmationCode: resv.confirmationCode,
          status: "cancelled",
          dashboardUrl: `${baseUrl}/admin/reservations`,
        },
      }).catch((e: unknown) => console.error("[reservation cancel notifyStaff]", e)),
    );
  }

  return NextResponse.json({ ok: true, depositPaid: resv.depositPaid });
}

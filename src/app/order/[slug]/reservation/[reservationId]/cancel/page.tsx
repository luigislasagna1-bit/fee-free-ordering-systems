/**
 * Guest reservation-cancel confirm page (Fabrizio cms0idtz7).
 *
 * URL: /order/[slug]/reservation/[reservationId]/cancel?t=<token>
 * — the link in the reservation emails. Reservations have no customer
 * session system, so the purpose-scoped "reservation-cancel" HMAC token
 * is the only credential.
 *
 * SECURITY: the token is verified server-side BEFORE any booking detail
 * is rendered. An invalid/missing token gets a generic invalid-link state
 * that leaks nothing — not even whether the reservation exists.
 *
 * SAFETY: this GET only ever renders UI. The actual cancel is a POST from
 * the client confirm button, so mail-scanner prefetches can never cancel
 * a booking.
 */
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { verifyActionToken } from "@/lib/order-status-token";
import { formatTime } from "@/lib/format-time";
import { CancelReservationConfirm, type CancelPageState } from "./CancelReservationConfirm";

export const dynamic = "force-dynamic";

export default async function ReservationCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; reservationId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug, reservationId } = await params;
  const { t: token } = await searchParams;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: { id: true, name: true, themeSettings: true, timezone: true, hoursFormat: true },
  });
  if (!restaurant) notFound();

  // Token FIRST — no booking data is even queried on a bad link.
  const tokenOk = verifyActionToken("reservation-cancel", reservationId, token);

  let state: CancelPageState = "invalid";
  let booking: {
    dateTime: string;
    partySize: number;
    confirmationCode: string;
    customerName: string;
    depositPaid: boolean;
  } | null = null;

  if (tokenOk) {
    const resv = await prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId: restaurant.id },
      select: {
        status: true, orderId: true, customerName: true, confirmationCode: true,
        partySize: true, date: true, time: true, depositPaid: true,
      },
    });
    if (!resv) {
      state = "invalid";
    } else if (resv.orderId) {
      // Reserve-then-order — the ORDER's cancel link owns this booking.
      state = "linked";
    } else if (resv.status === "cancelled" || resv.status === "rejected") {
      state = "already";
    } else if (resv.status !== "pending" && resv.status !== "confirmed") {
      // seated / completed / no_show — nothing to cancel online anymore.
      state = "tooLate";
    } else {
      // Past reservations: compare the booking's LOCAL wall clock against
      // the restaurant's timezone (same rule as the API).
      let past = false;
      try {
        const tz = restaurant.timezone || "UTC";
        const nowLocal = new Date().toLocaleString("sv-SE", { timeZone: tz });
        past = `${resv.date}T${resv.time}` < nowLocal.slice(0, 16).replace(" ", "T");
      } catch { /* tz hiccup — offer the confirm; the API re-checks */ }
      state = past ? "tooLate" : "confirm";
    }
    if (resv && (state === "confirm" || state === "already" || state === "tooLate")) {
      const hoursFmt = restaurant.hoursFormat === "12h" ? "12h" : "24h";
      booking = {
        dateTime: `${resv.date} · ${formatTime(resv.time, hoursFmt)}`,
        partySize: resv.partySize,
        confirmationCode: resv.confirmationCode,
        customerName: resv.customerName,
        depositPaid: resv.depositPaid,
      };
    }
  }

  return (
    <CancelReservationConfirm
      slug={slug}
      reservationId={reservationId}
      token={token ?? ""}
      restaurantName={restaurant.name}
      themeSettings={restaurant.themeSettings}
      initialState={state}
      booking={booking}
    />
  );
}

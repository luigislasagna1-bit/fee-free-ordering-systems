"use client";
/**
 * Client half of the guest reservation-cancel page (cms0idtz7).
 *
 * The server page already verified the token and resolved the initial state;
 * this component renders the right card and, on Confirm, POSTs the token to
 * /api/public/reservations/[id]/cancel. All copy comes from
 * customer.reservationCancel.* (×38); API error codes map to the same keys —
 * the server's English strings are a fallback only.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarX2, CheckCircle, Loader2, Users, Hash } from "lucide-react";
import { parseTheme } from "@/lib/theme";

export type CancelPageState = "confirm" | "invalid" | "already" | "linked" | "tooLate";

type Booking = {
  dateTime: string;
  partySize: number;
  confirmationCode: string;
  customerName: string;
  depositPaid: boolean;
};

export function CancelReservationConfirm({
  slug, reservationId, token, restaurantName, themeSettings, initialState, booking,
}: {
  slug: string;
  reservationId: string;
  token: string;
  restaurantName: string;
  themeSettings: string | null;
  initialState: CancelPageState;
  booking: Booking | null;
}) {
  const t = useTranslations("customer.reservationCancel");
  const router = useRouter();
  const theme = parseTheme(themeSettings);
  const primary = theme.primaryColor || "#10b981";

  const [state, setState] = useState<CancelPageState | "success" | "error">(initialState);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const doCancel = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/public/reservations/${reservationId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("success");
      } else if (body?.code === "invalid_token" || body?.code === "not_found") {
        setState("invalid");
      } else if (body?.code === "linked_to_order") {
        setState("linked");
      } else if (body?.code === "too_late") {
        setState("tooLate");
      } else if (body?.code === "wrong_status") {
        // The booking moved under us (staff seated/declined it, or a second
        // tap) — "already handled" is the honest answer.
        setState("already");
      } else {
        setState("error");
        setErrorMsg(typeof body?.error === "string" ? body.error : null);
      }
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  const backHome = () => router.push(`/order/${slug}`);

  const bookingCard = booking && (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left space-y-1.5">
      <div className="font-semibold text-gray-900">{booking.dateTime}</div>
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <Users className="w-4 h-4" /> {t("partySize", { partySize: booking.partySize })}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <Hash className="w-4 h-4" /> {booking.confirmationCode}
      </div>
    </div>
  );

  let content: React.ReactNode;
  if (state === "confirm") {
    content = (
      <>
        <CalendarX2 className="w-12 h-12 mx-auto text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-600">{t("intro", { restaurantName })}</p>
        {bookingCard}
        {booking?.depositPaid && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
            {t("depositNote")}
          </p>
        )}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={doCancel}
            disabled={busy}
            className="w-full rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 text-sm transition inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? t("cancelling") : t("confirmButton")}
          </button>
          <button
            onClick={backHome}
            disabled={busy}
            className="w-full rounded-xl font-semibold py-3 text-sm text-white transition disabled:opacity-60"
            style={{ backgroundColor: primary }}
          >
            {t("keepButton")}
          </button>
        </div>
      </>
    );
  } else if (state === "success") {
    content = (
      <>
        <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
        <h1 className="text-xl font-bold text-gray-900">{t("successTitle")}</h1>
        <p className="text-sm text-gray-600">{t("successBody", { restaurantName })}</p>
        {booking?.depositPaid && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
            {t("depositNote")}
          </p>
        )}
      </>
    );
  } else if (state === "already") {
    content = (
      <>
        <CheckCircle className="w-12 h-12 mx-auto text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900">{t("alreadyCancelledTitle")}</h1>
        <p className="text-sm text-gray-600">{t("alreadyCancelledBody")}</p>
      </>
    );
  } else if (state === "linked") {
    content = (
      <>
        <CalendarX2 className="w-12 h-12 mx-auto text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-600">{t("linkedOrderBody")}</p>
      </>
    );
  } else if (state === "tooLate") {
    content = (
      <>
        <CalendarX2 className="w-12 h-12 mx-auto text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-600">{t("tooLateBody", { restaurantName })}</p>
      </>
    );
  } else if (state === "error") {
    content = (
      <>
        <CalendarX2 className="w-12 h-12 mx-auto text-red-400" />
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-red-600">{errorMsg || t("genericError")}</p>
        <button
          onClick={doCancel}
          className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold py-3 text-sm transition"
        >
          {t("confirmButton")}
        </button>
      </>
    );
  } else {
    // "invalid" — generic, leaks nothing about whether the booking exists.
    content = (
      <>
        <CalendarX2 className="w-12 h-12 mx-auto text-gray-400" />
        <h1 className="text-xl font-bold text-gray-900">{t("invalidLinkTitle")}</h1>
        <p className="text-sm text-gray-600">{t("invalidLinkBody")}</p>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8 text-center space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{restaurantName}</p>
        {content}
      </div>
    </div>
  );
}

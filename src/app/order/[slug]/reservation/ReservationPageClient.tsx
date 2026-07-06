"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReservationModal } from "../ReservationModal";
import { parseTheme } from "@/lib/theme";
import { formatTime } from "@/lib/format-time";

/**
 * Standalone reservation page wrapper around the existing ReservationModal.
 *
 * Two layouts (Fabrizio cmpxeacks), chosen per restaurant via the theme
 * setting `reservationFullBg`:
 *   - default: a branded HERO band at the top (banner photo, or a brand-colour
 *     gradient when there's no banner) with logo + name + "Table Reservation",
 *     and the booking card pulled up just below it.
 *   - full background (owner opt-in, needs a banner): the banner photo fills
 *     the ENTIRE page behind a dark overlay, with the branding + booking card
 *     centred over it.
 *
 * The modal renders in `embedded` mode (no dark overlay, no duplicate header)
 * in both layouts.
 */
export function ReservationPageClient({ restaurant, closure }: { restaurant: any; closure?: any }) {
  const router = useRouter();
  const tOrd = useTranslations("ordering");
  const theme = parseTheme(restaurant.themeSettings);
  const hasBanner = !!restaurant.bannerUrl;
  const primary = theme.primaryColor || "#10b981";
  const fullBg = !!theme.reservationFullBg && hasBanner;
  const back = () => router.push(`/order/${restaurant.slug}`);

  const backButton = (
    <button
      onClick={back}
      className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white bg-black/30 hover:bg-black/45 rounded-full pl-2.5 pr-3.5 py-1.5 transition"
    >
      <ArrowLeft className="w-4 h-4" /> {tOrd("menu")}
    </button>
  );

  const brand = (
    <div className="text-center text-white px-4">
      {restaurant.logoUrl && (
        <img
          src={restaurant.logoUrl}
          alt=""
          className="w-16 h-16 rounded-2xl object-cover shadow-lg mb-3 border-2 border-white/70 mx-auto"
        />
      )}
      <h1 className="text-2xl sm:text-3xl font-bold drop-shadow-md">{restaurant.name}</h1>
      <p className="mt-1 text-xs sm:text-sm font-semibold uppercase tracking-wider text-white/90 drop-shadow">
        {tOrd("tableReservation")}
      </p>
    </div>
  );

  const modal = (
    <ReservationModal
      embedded
      restaurantSlug={restaurant.slug}
      restaurantName={restaurant.name}
      settings={restaurant.reservationSettings}
      fallbackOpeningHours={restaurant.openingHours ?? []}
      requireCustomerEmail={true}
      requireCustomerPhone={restaurant.requireCustomerPhone !== false}
      hoursFormat={restaurant.hoursFormat === "12h" ? "12h" : "24h"}
      timezone={restaurant.timezone ?? undefined}
      currency={(restaurant as any).currency ?? "usd"}
      theme={theme}
      onClose={back}
      // Reserve-then-order (Luigi 2026-06-08): when the restaurant allows
      // pre-ordering, "Add food to your booking" stashes the validated booking
      // in sessionStorage and forwards to the ordering page, which picks it up
      // and finalises the reservation together with the paid order.
      allowPreOrder={!!restaurant.reservationSettings?.allowPreOrder}
      onContinueToOrder={(draft) => {
        try {
          sessionStorage.setItem("ff_reservation_draft", JSON.stringify(draft));
        } catch { /* private mode / quota — fall through to a bare menu */ }
        router.push(`/order/${restaurant.slug}`);
      }}
    />
  );

  // ── Closure banner — parity with the ordering page (Luigi reseller report) ──
  // A website "Book a table" link can deep-link straight here, so the closed /
  // extraordinary-closure warning has to show on this surface too, not just the
  // order page. The holiday/special-day banner takes precedence; the plain
  // weekly-hours "closed now" banner shows otherwise. Same amber strips + the
  // generic (non-order-specific) copy. closure is computed server-side.
  const c = closure ?? {};
  const fmt = restaurant.hoursFormat === "12h" ? "12h" : "24h";
  const serviceLabel = (s: string) =>
    s === "pickup" ? tOrd("pickup")
    : s === "delivery" ? tOrd("delivery")
    : s === "dine_in" ? tOrd("dineIn")
    : s === "take_out" ? tOrd("takeOut")
    : s === "reservation" ? tOrd("tableReservation")
    : s === "catering" ? tOrd("catering")
    : s.charAt(0).toUpperCase() + s.slice(1);
  const fmtWins = (ivs: any[]) =>
    (ivs ?? []).map((iv: any) => `${formatTime(iv.open, fmt)} – ${formatTime(iv.close, fmt)}`).join(", ");
  const holidayActive =
    c.todayHolidayClosed || !!c.todayHolidayName || !!c.todayHolidayMessage ||
    (c.todayHolidayIntervals?.length ?? 0) > 0 || (c.holidayClosedServices?.length ?? 0) > 0 ||
    (c.holidayClosedWindows?.length ?? 0) > 0 || (c.holidayCustomHoursServices?.length ?? 0) > 0 ||
    (c.holidayClosedWindowsGeneral?.length ?? 0) > 0;
  const closureBanner = holidayActive ? (
    <div className="w-full bg-amber-500 border-b border-amber-600 px-4 sm:px-6 py-3 text-sm">
      <div className="max-w-2xl mx-auto space-y-0.5">
        {(c.todayHolidayClosed || (c.todayHolidayIntervals?.length ?? 0) > 0 || (c.holidayClosedServices?.length ?? 0) > 0) && (
          <div className="font-bold text-amber-950">
            {c.todayHolidayClosed
              ? <>⛔ {tOrd("holidayClosedToday")}{c.todayHolidayName ? ` — ${c.todayHolidayName}` : ""}</>
              : (c.todayHolidayIntervals?.length ?? 0) > 0
                ? <>🕒 {tOrd("holidaySpecialHours")}{c.todayHolidayName ? ` — ${c.todayHolidayName}` : ""}: {c.todayHolidayIntervals.map((iv: any) => `${formatTime(iv.open, fmt)} – ${formatTime(iv.close, fmt)}`).join(", ")}</>
                : <>⛔ {tOrd("holidayNotAvailableToday", { services: (c.holidayClosedServices ?? []).map(serviceLabel).join(", ") })}{c.todayHolidayName ? ` — ${c.todayHolidayName}` : ""}</>}
          </div>
        )}
        {/* Partial / per-service closures — parity with the ordering page. */}
        {!c.todayHolidayClosed && (c.holidayClosedWindowsGeneral?.length ?? 0) > 0 && (
          <div className="font-bold text-amber-950">⏸ {tOrd("holidayClosedHoursToday", { windows: fmtWins(c.holidayClosedWindowsGeneral) })}</div>
        )}
        {!c.todayHolidayClosed && (c.holidayClosedWindows ?? []).map((g: any, i: number) => (
          <div key={`cw-${i}`} className="font-bold text-amber-950">⏸ {tOrd("holidayServiceClosedWindows", { service: serviceLabel(g.service), windows: fmtWins(g.intervals) })}</div>
        ))}
        {!c.todayHolidayClosed && (c.holidayCustomHoursServices ?? []).map((g: any, i: number) => (
          <div key={`ch-${i}`} className="font-bold text-amber-950">🕒 {tOrd("holidayServiceSpecialHours", { service: serviceLabel(g.service), windows: fmtWins(g.intervals) })}</div>
        ))}
        {c.todayHolidayMessage && <div className="text-xs text-amber-900 mt-0.5">{c.todayHolidayMessage}</div>}
      </div>
    </div>
  ) : c.regularClosedKind ? (
    <div className="w-full bg-amber-400 border-b border-amber-500 px-4 sm:px-6 py-3">
      <div className="max-w-2xl mx-auto flex items-center gap-2 text-amber-950 font-semibold text-sm">
        <Clock className="w-5 h-5 flex-shrink-0" />
        <span>
          {c.regularClosedKind === "opens_at" && c.opensAt
            ? `${tOrd("closed")} · ${tOrd("opensAtLabel", { time: c.opensAt })}`
            : tOrd("closedToday")}
        </span>
      </div>
    </div>
  ) : null;

  // ── Layout: full-screen banner background, or branded hero band on top ──────
  const overlay = Math.min(0.85, (theme.bannerOpacity ?? 60) / 100);
  const heroStyle = hasBanner
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.65)), url(${restaurant.bannerUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: `linear-gradient(135deg, ${primary}, ${darkenHex(primary, 0.28)})` };

  const body = fullBg ? (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundColor: theme.backgroundColor, backgroundImage: `url(${restaurant.bannerUrl})` }}
    >
      <div
        className="relative min-h-screen flex flex-col items-center justify-center gap-5 px-3 sm:px-4 py-16"
        style={{ backgroundColor: `rgba(0,0,0,${overlay})` }}
      >
        {backButton}
        {brand}
        <div className="w-full flex justify-center">{modal}</div>
      </div>
    </div>
  ) : (
    <div className="min-h-screen" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
      <div className="relative h-56 sm:h-64 flex flex-col items-center justify-center" style={heroStyle}>
        {backButton}
        {brand}
      </div>
      <div className="px-3 sm:px-4 pb-12 -mt-8 relative z-10 flex justify-center">{modal}</div>
    </div>
  );

  return (
    <>
      {closureBanner}
      {body}
    </>
  );
}

/** Darken a #rrggbb hex by `fraction` (0..1) for the no-banner hero gradient. */
function darkenHex(hex: string, fraction: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const f = Math.max(0, Math.min(1, fraction));
  const adj = (h: string) => Math.round(parseInt(h, 16) * (1 - f)).toString(16).padStart(2, "0");
  return `#${adj(m[1])}${adj(m[2])}${adj(m[3])}`;
}

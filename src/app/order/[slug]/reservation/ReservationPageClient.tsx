"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReservationModal } from "../ReservationModal";
import { parseTheme } from "@/lib/theme";

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
export function ReservationPageClient({ restaurant }: { restaurant: any }) {
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
      requireCustomerEmail={restaurant.requireCustomerEmail !== false}
      requireCustomerPhone={restaurant.requireCustomerPhone !== false}
      hoursFormat={restaurant.hoursFormat === "12h" ? "12h" : "24h"}
      timezone={restaurant.timezone ?? undefined}
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

  // ── Full-screen banner background ──────────────────────────────────────────
  if (fullBg) {
    const overlay = Math.min(0.85, (theme.bannerOpacity ?? 60) / 100);
    return (
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
    );
  }

  // ── Default: branded hero band on top, card below ──────────────────────────
  const heroStyle = hasBanner
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.65)), url(${restaurant.bannerUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: `linear-gradient(135deg, ${primary}, ${darkenHex(primary, 0.28)})` };

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
      <div className="relative h-56 sm:h-64 flex flex-col items-center justify-center" style={heroStyle}>
        {backButton}
        {brand}
      </div>
      <div className="px-3 sm:px-4 pb-12 -mt-8 relative z-10 flex justify-center">{modal}</div>
    </div>
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

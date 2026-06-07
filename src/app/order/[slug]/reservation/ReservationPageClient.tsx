"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReservationModal } from "../ReservationModal";
import { parseTheme } from "@/lib/theme";

/**
 * Standalone reservation page wrapper around the existing ReservationModal.
 *
 * GloriaFood-style layout (Fabrizio cmpxeacks): a branded HERO at the top —
 * the restaurant's banner photo (or a theme-colour gradient when no banner,
 * so there's never a flat grey void) with the logo, restaurant name, and a
 * "Table Reservation" sub-label — and the reservation form card pulled up
 * just below it. The modal renders in `embedded` mode (no dark overlay, no
 * duplicate header) so it reads as a real page, not a popup floating in grey.
 */
export function ReservationPageClient({ restaurant }: { restaurant: any }) {
  const router = useRouter();
  const tOrd = useTranslations("ordering");
  const theme = parseTheme(restaurant.themeSettings);
  const hasBanner = !!restaurant.bannerUrl;
  const primary = theme.primaryColor || "#10b981";

  // Hero background: banner photo under a top-to-bottom dark gradient (keeps
  // the white text legible over any image), or a primary-colour gradient when
  // the restaurant hasn't uploaded a banner.
  const heroStyle = hasBanner
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.65)), url(${restaurant.bannerUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: `linear-gradient(135deg, ${primary}, ${darkenHex(primary, 0.28)})` };

  const back = () => router.push(`/order/${restaurant.slug}`);

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
      {/* Branded hero */}
      <div
        className="relative h-56 sm:h-64 flex flex-col items-center justify-center text-center px-4 text-white"
        style={heroStyle}
      >
        <button
          onClick={back}
          className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white bg-black/30 hover:bg-black/45 rounded-full pl-2.5 pr-3.5 py-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> {tOrd("menu")}
        </button>
        {restaurant.logoUrl && (
          <img
            src={restaurant.logoUrl}
            alt=""
            className="w-16 h-16 rounded-2xl object-cover shadow-lg mb-3 border-2 border-white/70"
          />
        )}
        <h1 className="text-2xl sm:text-3xl font-bold drop-shadow-md">{restaurant.name}</h1>
        <p className="mt-1 text-xs sm:text-sm font-semibold uppercase tracking-wider text-white/90 drop-shadow">
          {tOrd("tableReservation")}
        </p>
      </div>

      {/* Reservation form card, pulled up over the hero */}
      <div className="px-3 sm:px-4 pb-12 -mt-8 relative z-10 flex justify-center">
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
        />
      </div>
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

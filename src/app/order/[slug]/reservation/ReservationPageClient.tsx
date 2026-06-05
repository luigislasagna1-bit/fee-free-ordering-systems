"use client";

import { useRouter } from "next/navigation";
import { ReservationModal } from "../ReservationModal";
import { parseTheme } from "@/lib/theme";

/**
 * Standalone reservation page wrapper around the existing
 * ReservationModal. Renders the modal "always open" against a themed
 * background — clicking the modal's X navigates back to the order
 * page so the customer can switch to ordering if they want.
 *
 * Why reuse ReservationModal instead of duplicating its form? Because
 * the form already encapsulates validation, slot generation, the
 * party-size dropdown, deposit handling, and the post-submit
 * confirmation screen. Lifting all that into a separate
 * page-specific component would be hundreds of lines of duplication
 * with two surfaces to keep in sync.
 */
export function ReservationPageClient({ restaurant }: { restaurant: any }) {
  const router = useRouter();
  const theme = parseTheme(restaurant.themeSettings);

  // Full-bleed banner background (Luigi 2026-06-05): the restaurant's banner
  // photo covers the ENTIRE page behind the reservation card — no white gap —
  // with a dark overlay (respecting the theme's banner opacity) so the form
  // stays legible. Falls back to the flat theme background when no banner.
  const hasBanner = !!restaurant.bannerUrl;
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        backgroundImage: hasBanner ? `url(${restaurant.bannerUrl})` : undefined,
      }}
    >
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          backgroundColor: hasBanner
            ? `rgba(0,0,0,${Math.min(0.85, (theme.bannerOpacity ?? 60) / 100)})`
            : undefined,
        }}
      >
        <ReservationModal
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.name}
          settings={restaurant.reservationSettings}
          fallbackOpeningHours={restaurant.openingHours ?? []}
          requireCustomerEmail={restaurant.requireCustomerEmail !== false}
          requireCustomerPhone={restaurant.requireCustomerPhone !== false}
          hoursFormat={restaurant.hoursFormat === "12h" ? "12h" : "24h"}
          timezone={restaurant.timezone ?? undefined}
          theme={theme}
          onClose={() => {
            // Land on the regular order page on close. Most customers
            // who hit X just want to see the menu instead.
            router.push(`/order/${restaurant.slug}`);
          }}
        />
      </div>
    </div>
  );
}

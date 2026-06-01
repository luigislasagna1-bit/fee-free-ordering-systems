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

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}
    >
      {/* Optional banner — gives the page a visual identity that
          matches the rest of the brand surface. If the restaurant
          hasn't uploaded one, we let the gradient show through. */}
      {restaurant.bannerUrl && (
        <div
          className="w-full h-32 sm:h-48 bg-cover bg-center"
          style={{ backgroundImage: `url(${restaurant.bannerUrl})` }}
        />
      )}

      <div className="flex-1 flex items-center justify-center p-4">
        <ReservationModal
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.name}
          settings={restaurant.reservationSettings}
          fallbackOpeningHours={restaurant.openingHours ?? []}
          requireCustomerEmail={restaurant.requireCustomerEmail !== false}
          requireCustomerPhone={restaurant.requireCustomerPhone !== false}
          hoursFormat={restaurant.hoursFormat === "12h" ? "12h" : "24h"}
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

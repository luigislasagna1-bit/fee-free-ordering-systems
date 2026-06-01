/**
 * Standalone reservation page.
 *
 * Loads ONLY the reservation form (no menu, no cart, no order chrome)
 * on a clean themed background — the GloriaFood UX Luigi flagged
 * 2026-06-01. The "Book a Table" widget button + the second admin
 * embed snippet both link here directly.
 *
 * Why a separate page instead of just always opening the modal on top
 * of the menu? Because a customer clicking "Book a Table" doesn't
 * want to be visually told "here's our pizzas" first — they're
 * already decided, they just need to pick a time. GloriaFood ships
 * two distinct surfaces for that reason.
 *
 * URL: /order/[slug]/reservation
 *   - Honors the same embedded= / from= query params as /order/[slug]
 *   - Returns 404 when the restaurant has acceptsReservations = false
 *
 * Implementation note: the reservation UI itself is the existing
 * ReservationModal component, rendered here against the themed
 * background instead of an overlay. The modal already handles all
 * the data + validation + submit; we don't reimplement any of it.
 */
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { ReservationPageClient } from "./ReservationPageClient";

export const dynamic = "force-dynamic";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    include: {
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      reservationSettings: true,
    },
  });
  if (!restaurant) notFound();
  if (!restaurant.acceptsReservations || !restaurant.reservationSettings) {
    notFound();
  }

  // Strip relations/Date instances down to plain JSON-serialisable
  // shape so the client component can consume them without prisma
  // type coupling.
  const serialized = {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurant.name,
    bannerUrl: restaurant.bannerUrl,
    logoUrl: restaurant.logoUrl,
    themeSettings: restaurant.themeSettings,
    requireCustomerEmail: restaurant.requireCustomerEmail,
    requireCustomerPhone: restaurant.requireCustomerPhone,
    openingHours: restaurant.openingHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isOpen: h.isOpen,
      closesNextDay: h.closesNextDay,
      service: h.service,
    })),
    reservationSettings: restaurant.reservationSettings && {
      ...restaurant.reservationSettings,
      // The Json columns / Date fields are already JSON-compatible from Prisma.
    },
  };

  return <ReservationPageClient restaurant={serialized as any} />;
}

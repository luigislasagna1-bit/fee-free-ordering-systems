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
import { resolveTodayHolidayClosure } from "@/lib/holiday-rules";
import { liveOpenStatus } from "@/lib/restaurant-hours";
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
      // Special-day / extraordinary-closure rows — needed so the SAME amber
      // closure banner the ordering page shows also appears here (Luigi reseller
      // report: a website "Book a table" link deep-links straight to this page,
      // bypassing the order surface where that warning currently lives).
      holidays: true,
    },
  });
  if (!restaurant) notFound();
  if (!restaurant.acceptsReservations || !restaurant.reservationSettings) {
    notFound();
  }

  // Closure banner state — shared logic with the ordering page. The holiday
  // banner (extraordinary closure / special hours) takes precedence; the plain
  // weekly-hours "closed now" banner only shows when there's no special day,
  // exactly like the ordering page's two-banner gating.
  const hol = resolveTodayHolidayClosure((restaurant as any).holidays, restaurant.timezone ?? undefined);
  const holidayActive =
    hol.todayHolidayClosed || !!hol.todayHolidayName || !!hol.todayHolidayMessage ||
    (hol.todayHolidayIntervals?.length ?? 0) > 0 || hol.holidayClosedServices.length > 0;
  const hoursFmt = restaurant.hoursFormat === "12h" ? "12h" : "24h";
  const live = liveOpenStatus(
    (restaurant.openingHours ?? []) as any,
    new Date(),
    hoursFmt,
    hol.todayHolidayClosed || (hol.todayHolidayIntervals?.length ?? 0) > 0
      ? { name: hol.todayHolidayName ?? undefined, intervals: hol.todayHolidayIntervals ?? undefined }
      : undefined,
    restaurant.timezone ?? undefined,
  );
  const closure = {
    ...hol,
    regularClosedKind:
      !holidayActive && (live.kind === "opens_at" || live.kind === "closed_today") ? live.kind : null,
    opensAt: live.kind === "opens_at" ? live.opensAt : null,
  };

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
    hoursFormat: restaurant.hoursFormat,
    timezone: restaurant.timezone,
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

  return <ReservationPageClient restaurant={serialized as any} closure={closure} />;
}

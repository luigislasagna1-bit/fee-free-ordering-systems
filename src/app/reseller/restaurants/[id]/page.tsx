import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { RestaurantDetailClient } from "./RestaurantDetailClient";

/**
 * /reseller/restaurants/[id]
 *
 * Per-restaurant detail view for the reseller. Matches GloriaFood's
 * "Management → click row" experience: shows the restaurant's services
 * (which add-ons it has), creation date, billing status, total
 * commission earned, and the most recent paid invoices.
 *
 * Strict ownership check: the restaurant must belong to the calling
 * reseller. Anything else 404s — we don't leak existence of restaurants
 * across resellers.
 */
export default async function ResellerRestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  const restaurant = await prisma.restaurant.findFirst({
    where: { id, resellerProfileId: user.resellerProfileId },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      country: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      createdAt: true,
      subscriptionPlan: { select: { name: true, price: true } },
      // Relation is `addOns` on Restaurant (see schema.prisma:200).
      addOns: {
        where: { status: { in: ["active", "trialing"] } },
        select: {
          id: true,
          status: true,
          activatedAt: true,
          currentPeriodEnd: true,
          addOn: {
            select: { slug: true, name: true, description: true, monthlyPriceCents: true },
          },
        },
      },
    },
  });

  if (!restaurant) notFound();

  // Commission summary + recent invoices for this restaurant under THIS
  // reseller (the same restaurant could have history with a different
  // reseller via reassignment — scope here strictly to current owner).
  const commissions = await prisma.commissionTransaction.findMany({
    where: {
      restaurantId: restaurant.id,
      resellerProfileId: user.resellerProfileId,
    },
    select: {
      id: true,
      createdAt: true,
      commissionCents: true,
      netRevenueCents: true,
      ratePercent: true,
      status: true,
      subscriptionInvoice: { select: { paidAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Lifetime + pending sums from the same scope.
  const sums = await prisma.commissionTransaction.groupBy({
    by: ["status"],
    where: {
      restaurantId: restaurant.id,
      resellerProfileId: user.resellerProfileId,
    },
    _sum: { commissionCents: true },
  });
  const sumByStatus = Object.fromEntries(
    sums.map((s) => [s.status, s._sum.commissionCents ?? 0]),
  ) as Record<string, number>;

  return (
    <div className="max-w-5xl">
      <Link
        href="/reseller/restaurants"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        ← All restaurants
      </Link>
      <RestaurantDetailClient
        restaurant={JSON.parse(JSON.stringify(restaurant))}
        commissions={JSON.parse(JSON.stringify(commissions))}
        sumByStatus={sumByStatus}
      />
    </div>
  );
}

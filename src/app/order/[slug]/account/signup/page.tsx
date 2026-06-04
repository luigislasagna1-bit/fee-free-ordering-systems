/**
 * /order/[slug]/account/signup
 *
 * Per-restaurant customer signup page. Separate from the marketplace-wide
 * /signup flow — this account is scoped to ONE restaurant and grants
 * access to that restaurant's coupons + order history. For multi-location
 * restaurants the signup propagates to all sibling locations (see the
 * POST handler at /api/restaurants/[slug]/account/signup).
 */

import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { SignupForm } from "./SignupForm";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountSignupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("customer.signupPage");
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  // Already signed in here → bounce to the dashboard. Keeps the back
  // button predictable.
  const existing = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (existing) redirect(`/order/${slug}/account`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t.rich("subheading", {
            name: restaurant.name,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <SignupForm slug={slug} restaurantName={restaurant.name} />
        <p className="mt-6 text-xs text-gray-500 text-center">
          {t("alreadyHaveAccount")}{" "}
          <a href={`/order/${slug}/account/login`} className="text-emerald-600 font-semibold hover:underline">
            {t("signIn")}
          </a>
        </p>
        <p className="mt-2 text-[11px] text-gray-400 text-center leading-snug">
          {t.rich("scopeNote", {
            name: restaurant.name,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    </div>
  );
}

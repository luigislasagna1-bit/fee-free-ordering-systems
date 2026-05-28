/**
 * /order/[slug]/account/login
 *
 * Per-restaurant customer login page.
 */

import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  const existing = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (existing) redirect(`/order/${slug}/account`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back to <strong>{restaurant.name}</strong>.
        </p>
        <LoginForm slug={slug} />
        <p className="mt-6 text-xs text-gray-500 text-center">
          No account yet?{" "}
          <a href={`/order/${slug}/account/signup`} className="text-emerald-600 font-semibold hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

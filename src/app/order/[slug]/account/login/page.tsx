/**
 * /order/[slug]/account/login
 *
 * Per-restaurant customer login page.
 */

import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { LoginForm } from "./LoginForm";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("customer.loginPage");
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
        <h1 className="text-2xl font-bold text-gray-900">{t("signIn")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t.rich("welcomeBack", { name: restaurant.name, strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <LoginForm slug={slug} />
        <p className="mt-6 text-xs text-gray-500 text-center">
          {t("noAccountYet")}{" "}
          <a href={`/order/${slug}/account/signup`} className="text-emerald-600 font-semibold hover:underline">
            {t("signUp")}
          </a>
        </p>
      </div>
    </div>
  );
}

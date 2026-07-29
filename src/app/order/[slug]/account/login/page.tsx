/**
 * /order/[slug]/account/login
 *
 * Per-restaurant customer login page.
 *
 * Locale (cms0gyexp #7): resolved cookie → restaurant.defaultLanguage → en,
 * matching the storefront page — a cookieless visitor to an Italian store
 * used to get English here because bare getTranslations() only knew the
 * cookie. The nested provider hands the same locale to the client form.
 */

import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { LoginForm } from "./LoginForm";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";

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

  const locale = await resolveLocale({ restaurantId: restaurant.id });
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "customer.loginPage" });

  const existing = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (existing) redirect(`/order/${slug}/account`);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
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
    </NextIntlClientProvider>
  );
}

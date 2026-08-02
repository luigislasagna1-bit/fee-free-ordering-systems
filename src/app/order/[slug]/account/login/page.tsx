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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { slug } = await params;
  const { next } = await searchParams;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  const locale = await resolveLocale({ restaurantId: restaurant.id });
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "customer.loginPage" });

  // CheckoutModal's "Sign in" link carries ?next=/order/<slug> so a customer
  // signing in mid-checkout lands back on checkout, not a dead end. This
  // redirect (already-authenticated) used to ignore that param entirely —
  // a customer who's already signed in but clicks "Sign in" out of habit
  // (e.g. the header hadn't visibly updated yet) got punted to their
  // Account page instead, losing their place in checkout and needing an
  // extra "Back to <restaurant>" hop to return. Only ever redirect to a
  // same-restaurant relative path — never follow an absolute/external next.
  const existing = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (existing) {
    const safeNext = next && next.startsWith(`/order/${slug}`) ? next : `/order/${slug}/account`;
    redirect(safeNext);
  }

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

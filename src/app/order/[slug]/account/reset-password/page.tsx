/**
 * /order/[slug]/account/reset-password?token=…
 *
 * Landing page from the password-reset email. Renders the new-password
 * form which POSTs to /api/restaurants/[slug]/account/reset-password.
 * Token validity is checked server-side at submit time — we don't
 * preflight it here so we don't burn the reset link just by clicking
 * it (e.g. preview/scanner bots).
 */

import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function RestaurantResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  // Locale: cookie → restaurant default → en (cms0gyexp #7). Critical HERE —
  // customers land straight from the reset email with no cookie set.
  const locale = await resolveLocale({ restaurantId: restaurant.id });
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "customer.resetPage" });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("subheading", { name: restaurant.name })}
          </p>
          {token ? (
            <ResetPasswordForm slug={slug} token={token} />
          ) : (
            <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {t("missingTokenPrefix")}{" "}
              <a href={`/order/${slug}/account/forgot-password`} className="font-semibold underline">
                {t("forgotPasswordLink")}
              </a>.
            </div>
          )}
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

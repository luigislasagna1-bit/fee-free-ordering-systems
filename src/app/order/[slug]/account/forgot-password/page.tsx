/**
 * /order/[slug]/account/forgot-password
 *
 * Per-restaurant customer "request a password reset" page. Mirrors
 * the marketplace /account/forgot-password page but scoped to a
 * single restaurant — the form posts to
 * /api/restaurants/[slug]/account/forgot-password which writes a
 * one-time token to Customer.passwordResetToken and emails the
 * customer a /order/[slug]/account/reset-password?token=… link.
 */

import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default async function RestaurantForgotPasswordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("customer.forgotPage");
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("subheading")}
        </p>
        <ForgotPasswordForm slug={slug} />
        <p className="mt-6 text-xs text-gray-500 text-center">
          {t("rememberedIt")}{" "}
          <a href={`/order/${slug}/account/login`} className="text-emerald-600 font-semibold hover:underline">
            {t("backToSignIn")}
          </a>
        </p>
      </div>
    </div>
  );
}

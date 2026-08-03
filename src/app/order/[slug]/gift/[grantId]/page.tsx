/**
 * /order/[slug]/gift/[grantId] — the Gift Wallet Pass claim landing page.
 *
 * Renders NOTHING sensitive: no amount, no sender name, no note, no email.
 * A grant id is a cuid, not a secret — the amount/sender/note are only
 * revealed by GiftClaimClient AFTER the typed code is proven server-side via
 * /api/public/gift-pass/verify. This closes the unauthenticated-PII-
 * disclosure hole a bare grant-id page would otherwise be.
 *
 * Mutates nothing (mail-scanner-safe, matching the guest-cancel precedent).
 * Frame/cache/referrer/robots headers for this whole /order/:slug/gift/*
 * subtree are set in next.config.ts (required — /order paths are otherwise
 * exempt from X-Frame-Options for the embed widget's sake).
 */
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { parseTheme } from "@/lib/theme";
import { GiftClaimClient } from "./GiftClaimClient";

export const dynamic = "force-dynamic";

export default async function GiftClaimPage({
  params,
}: {
  params: Promise<{ slug: string; grantId: string }>;
}) {
  const { slug, grantId } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true, rewardsEnabled: true, themeSettings: true, logoUrl: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  const theme = parseTheme(restaurant.themeSettings);
  const locale = await resolveLocale({ restaurantId: restaurant.id });
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "giftPass" });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: theme.backgroundColor }}>
        <div
          className="rounded-2xl shadow-sm border p-8 max-w-md w-full"
          style={{ backgroundColor: theme.cardBackground, borderColor: "#e5e7eb" }}
        >
          {restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt={restaurant.name} className="h-10 mb-4 object-contain" />
          )}
          <h1 className="text-2xl font-bold" style={{ color: theme.textColor }}>
            {t("landingTitle", { restaurantName: restaurant.name })}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.textColor, opacity: 0.7 }}>
            {t("landingSubtitle")}
          </p>
          {!restaurant.rewardsEnabled ? (
            <p className="mt-6 text-sm font-semibold text-red-600">{t("errRewardsOff")}</p>
          ) : (
            <GiftClaimClient slug={slug} grantId={grantId} restaurantName={restaurant.name} primaryColor={theme.primaryColor} />
          )}
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

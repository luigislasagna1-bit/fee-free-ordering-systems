/**
 * /order/[slug]/status/[orderId] — server wrapper.
 *
 * Resolves the customer locale (fee-free-locale cookie → restaurant
 * defaultLanguage → en) and mounts a nested NextIntlClientProvider, exactly
 * like the account pages. Without this, the emailed status/cancel link opened
 * in a fresh browser (no cookie) rendered the page — including the cancel
 * confirmation modal — in English on a non-English store (Fabrizio cms0gyexp
 * follow-up, 2026-07-29). All UI lives in StatusPageClient.
 */
import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { StatusPageClient } from "./StatusPageClient";

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: { id: true },
  });
  if (!restaurant) notFound();

  // The language the customer ORDERED in wins over the restaurant's default —
  // otherwise a diner who ordered in Italian from a restaurant running the app
  // in Chinese opened the status page (linked straight from their confirmation
  // email) in Chinese. An explicit language choice on this device still wins.
  const statusOrder = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: restaurant.id },
    select: { customerLocale: true },
  });
  const locale = await resolveLocale({
    restaurantId: restaurant.id,
    customerLocale: statusOrder?.customerLocale ?? null,
  });
  const messages = await loadMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <StatusPageClient slug={slug} orderId={orderId} />
    </NextIntlClientProvider>
  );
}

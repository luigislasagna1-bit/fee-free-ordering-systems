import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Iframe content endpoint for the embeddable widget. Looks up the
 * restaurant by `widgetPublicId`, refuses to render unless `publishedAt`
 * is set, then redirects into the existing /order/<slug> ordering page
 * with `?embedded=1` so the page can hide its top navigation chrome.
 */
export default async function WidgetEmbedPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { widgetPublicId: publicId },
    select: { id: true, slug: true, publishedAt: true, isActive: true },
  });
  if (!restaurant || !restaurant.publishedAt || !restaurant.isActive) {
    notFound();
  }
  redirect(`/order/${restaurant.slug}?embedded=1`);
}

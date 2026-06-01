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
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { publicId } = await params;
  const sp = await searchParams;
  const restaurant = await prisma.restaurant.findUnique({
    where: { widgetPublicId: publicId },
    select: { id: true, slug: true, publishedAt: true, isActive: true },
  });
  if (!restaurant || !restaurant.publishedAt || !restaurant.isActive) {
    notFound();
  }
  // ?mode=reservation → standalone reservation page (no menu chrome).
  // GloriaFood-style UX: click "Book a Table" lands DIRECTLY on the
  // form. Anything else routes to the regular order page.
  // Legacy ?reservation=1 (from older widget snippets) auto-opens
  // the modal on the regular order page — kept for backwards compat.
  if (sp.mode === "reservation") {
    redirect(`/order/${restaurant.slug}/reservation?embedded=1`);
  }
  const extra: string[] = [];
  if (sp.reservation === "1") extra.push("reservation=1");
  const qs = extra.length > 0 ? `&${extra.join("&")}` : "";
  redirect(`/order/${restaurant.slug}?embedded=1${qs}`);
}

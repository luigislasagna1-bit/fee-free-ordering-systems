import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import { ensureWidgetPublicId, getPublishState } from "@/lib/publishing";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import prisma from "@/lib/db";
import { LegacyWidgetClient } from "./LegacyWidgetClient";

export default async function LegacyWebsitePage() {
  const t = await getTranslations("admin.legacyWebsitePage");
  const user = await getSessionUser();
  // See add-ons/page.tsx for the rationale.
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  // Always make sure we have a widgetPublicId so the snippet is copy-pastable
  // even before the owner clicks Publish. Owner can paste it now; orders won't
  // accept until publishedAt is set.
  const [widgetPublicId, state, restaurant] = await Promise.all([
    ensureWidgetPublicId(user.restaurantId),
    getPublishState(user.restaurantId),
    // slug + branded-domain fields feed restaurantOrderUrl() below so the
    // owner's pasted button/Facebook/reservation links land on the
    // restaurant's most-branded domain (verified custom domain > subdomain >
    // apex) — not /embed/widget/<widgetPublicId> and not the platform apex.
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: {
        slug: true,
        subdomain: true,
        customDomain: true,
        customDomainStatus: true,
        acceptsReservations: true,
      },
    }),
  ]);

  // Platform base — used ONLY for the /embed/* token URLs (widget.js script +
  // iframe), which must stay on the apex.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // Customer-facing order links must land on the restaurant's MOST-BRANDED
  // domain (verified custom domain > subdomain > apex), not the platform apex.
  const orderUrl = restaurant ? restaurantOrderUrl(restaurant, "") : "";
  const reservationUrl = restaurant ? restaurantOrderUrl(restaurant, "/reservation") : "";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/publishing"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; {t("backToPublishing")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{t("pageTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t.rich("pageDescription", {
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
      </div>

      <LegacyWidgetClient
        publicId={widgetPublicId}
        baseUrl={baseUrl}
        orderUrl={orderUrl}
        reservationUrl={reservationUrl}
        isPublished={!!state.publishedAt}
        acceptsReservations={!!restaurant?.acceptsReservations}
      />

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">{t("installationTipsTitle")}</h3>
        <ul className="mt-2 text-sm text-gray-700 space-y-1 list-disc list-inside">
          <li>{t.rich("tipPlacement", { code: (chunks) => <code>{chunks}</code> })}</li>
          <li>{t("tipPlatforms")}</li>
          <li>{t.rich("tipPublish", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          <li>{t.rich("tipCustomize", { code: (chunks) => <code>{chunks}</code> })}</li>
        </ul>
      </div>
    </div>
  );
}

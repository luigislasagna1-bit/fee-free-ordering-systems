import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { ensureWidgetPublicId, getPublishState } from "@/lib/publishing";
import prisma from "@/lib/db";
import { LegacyWidgetClient } from "./LegacyWidgetClient";

export default async function LegacyWebsitePage() {
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
    // slug needed by the button_link snippet (which links to /order/<slug>,
    // not /embed/widget/<widgetPublicId> — we want a real shareable URL).
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { slug: true },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/publishing"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; Back to publishing
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Legacy Website widget</h1>
        <p className="text-sm text-gray-600 mt-1">
          Already have a website? Paste this snippet into the <code>&lt;body&gt;</code> of any page where you want
          customers to be able to order. A floating "Order Online" button will appear; clicking it
          opens your full ordering experience in an overlay.
        </p>
      </div>

      <LegacyWidgetClient
        publicId={widgetPublicId}
        orderSlug={restaurant?.slug ?? ""}
        baseUrl={baseUrl}
        isPublished={!!state.publishedAt}
      />

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">Installation tips</h3>
        <ul className="mt-2 text-sm text-gray-700 space-y-1 list-disc list-inside">
          <li>Place the snippet just before <code>&lt;/body&gt;</code>. It loads asynchronously and won't slow your page.</li>
          <li>Works on any platform that lets you edit raw HTML: WordPress, Wix, Shopify, Squarespace, raw HTML, etc.</li>
          <li>The widget refuses to render until you click <strong>Publish</strong> on the previous page.</li>
          <li>Change the button color with <code>data-color="#hex"</code> and label with <code>data-label="Order Now"</code>.</li>
        </ul>
      </div>
    </div>
  );
}

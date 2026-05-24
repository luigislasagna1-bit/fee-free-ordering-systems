import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import prisma from "@/lib/db";
import { parseHostedSiteSettings } from "@/lib/hosted-site-settings";
import { WebsiteEditorClient } from "./WebsiteEditorClient";

/**
 * Admin page that wraps the WebsiteEditorClient with server-side gating.
 *
 * Gated on the `hosted_marketing_page` entitlement — without the Sales
 * Optimized Website add-on we show an upgrade prompt instead of the
 * editor. Owners can still get here via /admin/website but the editor
 * only does anything for restaurants that subscribed.
 *
 * Loads the current settings server-side so the editor renders with the
 * right initial state (no client-side flash from defaults → saved).
 */
export default async function WebsiteEditorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [restaurant, entitled] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: {
        slug: true,
        subdomain: true,
        name: true,
        slogan: true,
        cuisineType: true,
        hostedSiteSettings: true,
        // bannerUrl + logoUrl shown by inline ImageUpload controls in
        // the Header & hero card — owner can swap the hero photo
        // without leaving the editor.
        bannerUrl: true,
        logoUrl: true,
      },
    }),
    hasFeature(user.restaurantId, "hosted_marketing_page"),
  ]);
  if (!restaurant) redirect("/login");

  if (!entitled) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6">
          <h1 className="text-xl font-bold text-emerald-900">
            Sales Optimized Website add-on required
          </h1>
          <p className="text-sm text-emerald-800 mt-2 leading-relaxed">
            The website editor lets you customize the hosted marketing
            page at <code className="bg-white px-1 rounded">{restaurant.subdomain ?? restaurant.slug}.feefreeordering.com</code>.
            Activate the add-on to unlock it.
          </p>
          <Link
            href="/admin/billing/add-ons"
            className="mt-4 inline-block px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition"
          >
            View add-ons
          </Link>
        </div>
      </div>
    );
  }

  const initial = parseHostedSiteSettings(restaurant.hostedSiteSettings);
  const previewUrl = `/site/${restaurant.slug}`;
  const liveUrl = `https://${restaurant.subdomain ?? restaurant.slug}.feefreeordering.com`;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Website editor</h1>
          <p className="text-sm text-gray-600 mt-1">
            Customize what appears on your hosted site. All your menu and
            restaurant info still flows from your existing setup — this
            editor just controls layout, visibility, and a few overrides.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            Preview <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition"
          >
            Live site <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <WebsiteEditorClient
        initial={initial}
        restaurantDefaults={{
          name: restaurant.name,
          slogan: restaurant.slogan,
          cuisineType: restaurant.cuisineType,
          bannerUrl: restaurant.bannerUrl,
          logoUrl: restaurant.logoUrl,
        }}
        previewUrl={previewUrl}
      />
    </div>
  );
}

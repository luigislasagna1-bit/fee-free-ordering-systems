import Link from "next/link";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { Globe, Palette, ChevronRight, ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getAddOnBillingState } from "@/lib/dunning";
import { AddOnBillingNotice } from "@/components/admin/AddOnBillingNotice";

export default async function WebsiteHubPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId ?? "";

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      slug: true,
      subdomain: true,
      customDomain: true,
      customDomainStatus: true,
      themeSettings: true,
    },
  });

  const t = await getTranslations("admin.websiteHub");
  const platformDomain = process.env.PLATFORM_DOMAIN || "localtest.me";
  // Sales Optimized Website add-on dunning state → grace / downgraded notice.
  const billingState = await getAddOnBillingState(restaurantId, "hosted_website");

  const liveUrl = (() => {
    if (r?.customDomain && r.customDomainStatus === "verified") return `https://${r.customDomain}`;
    if (r?.subdomain) return `https://${r.subdomain}.${platformDomain}`;
    return r?.slug ? `/order/${r.slug}` : null;
  })();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-6">{t("subtitle")}</p>

      <AddOnBillingNotice state={billingState} addOnSlug="hosted_website" />

      {liveUrl && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">{t("liveAt")}</p>
            <p className="text-sm font-mono text-emerald-900 truncate">{liveUrl}</p>
          </div>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            {t("open")} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <HubTile
          href="/admin/website/theme"
          icon={Palette}
          title={t("themeTitle")}
          body={t("themeBody")}
        />
        <HubTile
          href="/admin/website/domain"
          icon={Globe}
          title={t("domainTitle")}
          body={t("domainBody")}
        />
      </div>
    </div>
  );
}

function HubTile({ href, icon: Icon, title, body }: { href: string; icon: any; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition p-5 flex flex-col"
    >
      <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500 mt-1 leading-relaxed">{body}</p>
    </Link>
  );
}

import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { runSeoHealthChecks, type SeoCheck } from "@/lib/seo/health-check";
import { CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, LineChart } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { resolveReportScope, resolveActiveLocation } from "@/lib/reports/report-scope";
import { LocationChooser, ActiveLocationChip } from "../../LocationChooser";

/**
 * /admin/reports/online-ordering/google-rank
 *
 * Two-part report:
 *   A) SEO Health checklist — 7 success factors (content optimization,
 *      Google Business listing, PageSpeed, Domain, Security, Structured
 *      data, Social/local listings). Real checks against the restaurant's
 *      data + a free Google PageSpeed Insights probe.
 *   B) Ranking position chart — needs SerpAPI integration. When
 *      SERPAPI_KEY env is set we'll show the position-over-time chart;
 *      when unset (today) we explain what's missing so the owner can
 *      decide to enable it later. No silent dead-feature.
 *
 * No date-range picker — SEO is a "current state" question, not a
 * historical one. The ranking chart (when enabled) will get its own
 * "last N days" toggle inside the chart itself.
 *
 * Side effects: the PageSpeed Insights call inside health-check.ts
 * hits Google's free API once per page load (~5s). Hide-behind-cache
 * is a future optimization; for now it's fine since this page isn't
 * on a customer hot path.
 */
export default async function GoogleRankReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.reportGoogleRank");
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;

  const sp = await searchParams;
  const scope = await resolveReportScope(restaurantId);
  const active = resolveActiveLocation(scope, sp);
  const rangeQuery = "";

  // Brand parent without a picked location → show the chooser (these
  // per-location SEO metrics can't aggregate across a chain).
  if (!active) {
    return (
      <div>
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("pageSubtitle")}
          </p>
        </header>
        <LocationChooser locations={scope.locations} baseQuery={rangeQuery} />
      </div>
    );
  }

  const [restaurant, hasHostedSite] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: active.id },
      select: {
        id: true, slug: true, name: true, description: true, cuisineType: true,
        phone: true, address: true, city: true, state: true, zip: true,
        socialLinks: true, subdomain: true, customDomain: true, customDomainStatus: true,
      },
    }),
    hasFeature(active.id, "hosted_marketing_page"),
  ]);
  if (!restaurant) return <p className="text-sm text-gray-500">{t("restaurantNotFound")}</p>;

  const checks = await runSeoHealthChecks(restaurant, { hasHostedSite });
  const problemCount = checks.reduce((s, c) => s + (c.status === "fix" ? c.problemCount : 0), 0);
  const okCount = checks.filter((c) => c.status === "ok").length;
  const serpApiConfigured = !!process.env.SERPAPI_KEY;

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t("pageSubtitle")}
        </p>
      </header>

      {scope.isChain && <ActiveLocationChip name={active.name} baseQuery={rangeQuery} />}

      {/* Headline summary — "X of 7 OK · N problems to fix" so owners
          see the verdict before scanning the list. */}
      <div className={`rounded-2xl border shadow-sm p-5 mb-4 flex items-start gap-3 ${
        problemCount === 0
          ? "bg-emerald-50 border-emerald-200"
          : problemCount <= 2
            ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200"
      }`}>
        {problemCount === 0 ? (
          <CheckCircle2 className="w-6 h-6 mt-0.5 text-emerald-600" />
        ) : (
          <AlertTriangle className="w-6 h-6 mt-0.5 text-amber-600" />
        )}
        <div className="flex-1">
          <div className={`font-bold text-lg ${problemCount === 0 ? "text-emerald-900" : problemCount <= 2 ? "text-amber-900" : "text-red-900"}`}>
            {t("summaryFactors", { okCount, total: checks.length })}
            {problemCount > 0 && ` · ${t("summaryProblems", { count: problemCount })}`}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {t("summaryDescription")}
          </p>
        </div>
      </div>

      {/* The 7 checks. Same color semantics as the headline summary. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        {checks.map((c, i) => (
          <CheckRow check={c} isLast={i === checks.length - 1} key={c.id} />
        ))}
      </div>

      {/* Ranking position chart placeholder. Shows different copy based
          on whether SerpAPI is configured. Once SERPAPI_KEY is set in
          env + the daily-rank-scan cron starts populating
          GoogleRankingSnapshot rows, this becomes the real position
          chart matching GloriaFood's screenshot. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <LineChart className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">{t("rankingChartTitle")}</h2>
        </div>
        {serpApiConfigured ? (
          <p className="text-xs text-gray-500 italic">
            {t("serpApiConfiguredNoScans")}
          </p>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs text-amber-900 font-semibold mb-1">{t("rankTrackingOff")}</p>
            <p className="text-xs text-amber-900 leading-relaxed">
              {t("rankTrackingOffDescription", {
                cuisine: restaurant.cuisineType ?? t("yourCuisineFallback"),
                city: restaurant.city ?? t("yourCityFallback"),
              })} <code className="bg-amber-100 px-1 rounded">SERPAPI_KEY</code> {t("rankTrackingOffDescriptionSuffix")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

async function CheckRow({ check, isLast }: { check: SeoCheck; isLast: boolean }) {
  const t = await getTranslations("admin.reportGoogleRank");
  const Icon =
    check.status === "ok" ? CheckCircle2 :
    check.status === "unknown" ? HelpCircle :
    AlertTriangle;
  const color =
    check.status === "ok" ? "text-emerald-500" :
    check.status === "unknown" ? "text-gray-400" :
    "text-amber-500";
  const statusLabel =
    check.status === "ok" ? t("checkStatusOk") :
    check.status === "unknown" ? t("checkStatusUnknown") :
    t("checkStatusFix", { count: check.problemCount });
  const statusCls =
    check.status === "ok" ? "bg-emerald-50 text-emerald-700" :
    check.status === "unknown" ? "bg-gray-100 text-gray-500" :
    "bg-amber-50 text-amber-700";

  return (
    <div className={`flex items-start justify-between gap-3 p-4 ${isLast ? "" : "border-b border-gray-100"}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${color}`} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{check.label}</div>
          {check.hint && (
            <div className="text-xs text-gray-500 mt-0.5">{check.hint}</div>
          )}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${statusCls}`}>
        {statusLabel}
        {check.status === "fix" && check.id === "gmb" && (
          <a
            href="https://www.google.com/business/"
            target="_blank"
            rel="noreferrer"
            className="ml-1 hover:text-amber-900"
            title={t("openGmbTitle")}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </span>
    </div>
  );
}

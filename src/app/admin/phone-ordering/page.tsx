import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, Sparkles, Mic, Bot, Clock, ArrowRight, Rocket, LayoutDashboard, PhoneCall, UtensilsCrossed, Settings } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { buildQuery, one, type SearchParams } from "@/components/admin/reports/table-nav";
import NabilStatusHeader from "./NabilStatusHeader";
import OverviewTab from "./OverviewTab";
import CallsTab from "./CallsTab";
import MenuTab from "./MenuTab";
import SettingsTab from "./SettingsTab";

/**
 * Nabil AI — Fee Free's Automated Phone Answering System.
 *
 * Entitled restaurants get the full dashboard (Overview / Calls / Menu /
 * Settings — server-rendered ?tab= tabs, Loman-parity IA and then some);
 * everyone else sees the "Coming Soon" upsell teaser (UNCHANGED).
 * "Nabil AI" is a brand name — never translated (standing rule).
 */

const TABS = ["overview", "calls", "menu", "settings"] as const;
type Tab = (typeof TABS)[number];

export default async function PhoneOrderingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const restaurantId = user.restaurantId;

  const t = await getTranslations("admin.phoneOrderingPage");
  const entitled = await hasFeature(restaurantId, "phone_ordering_agent");

  const Header = (
    <div>
      <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
        &larr; {t("backToAdmin")}
      </Link>
      <div className="flex items-center gap-3 mt-2">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md">
          <Phone className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Nabil AI</h1>
            {!entitled && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                <Rocket className="w-3 h-3" />
                {t("comingSoon")}
              </span>
            )}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mt-1">{t("pageTitle")}</p>
          <p className="text-sm text-gray-600 mt-0.5">{t("pageSubtitle")}</p>
        </div>
      </div>
    </div>
  );

  if (entitled) {
    const sp = await searchParams;
    const tabParam = one(sp.tab);
    const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";

    const tOverview = await getTranslations("admin.phoneOrderingPage.overview");
    const [config, number] = await Promise.all([
      prisma.voiceAgentConfig.findUnique({ where: { restaurantId }, select: { enabled: true } }),
      prisma.voiceNumber.findFirst({ where: { restaurantId }, orderBy: { createdAt: "asc" }, select: { phoneNumber: true, status: true } }),
    ]);

    return (
      <div className="max-w-7xl mx-auto space-y-5 pb-10">
        {Header}

        {/* Number + "Active — handling calls" status, visible on every tab. */}
        <NabilStatusHeader
          initialEnabled={config?.enabled ?? false}
          phoneNumber={number?.phoneNumber ?? null}
        />

        {/* Server-rendered ?tab= tabs (per-tab accent, ReservationsClient style). */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {(
            [
              ["overview", tOverview("tabOverview"), LayoutDashboard, "border-amber-500", "text-amber-700", "bg-amber-50", "text-amber-500"],
              ["calls", tOverview("tabCalls"), PhoneCall, "border-sky-500", "text-sky-700", "bg-sky-50", "text-sky-500"],
              ["menu", tOverview("tabMenu"), UtensilsCrossed, "border-emerald-500", "text-emerald-700", "bg-emerald-50", "text-emerald-500"],
              ["settings", tOverview("tabSettings"), Settings, "border-slate-900", "text-slate-900", "bg-slate-100", "text-slate-600"],
            ] as [Tab, string, typeof Phone, string, string, string, string][]
          ).map(([key, label, Icon, activeBorder, activeText, activeBg, inactiveIcon]) => {
            const isActive = tab === key;
            const u = new URLSearchParams(buildQuery(sp));
            u.set("tab", key);
            return (
              <Link
                key={key}
                href={`?${u.toString()}`}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
                  isActive
                    ? `${activeBorder} ${activeText} ${activeBg}`
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "" : inactiveIcon}`} />
                {label}
              </Link>
            );
          })}
        </div>

        {tab === "overview" && <OverviewTab restaurantId={restaurantId} sp={sp} />}
        {tab === "calls" && <CallsTab restaurantId={restaurantId} sp={sp} />}
        {tab === "menu" && <MenuTab restaurantId={restaurantId} sp={sp} />}
        {tab === "settings" && <SettingsTab restaurantId={restaurantId} />}
      </div>
    );
  }

  // ── Not entitled → upsell teaser ─────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {Header}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-blue-600 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-90 mb-2">
          <Sparkles className="w-4 h-4" />
          {t("heroBadge")}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("heroHeadline")}</h2>
        <p className="mt-3 text-white/90 text-sm sm:text-base leading-relaxed max-w-2xl">{t("heroBody")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium">
            <Clock className="w-3.5 h-3.5" />
            {t("chip247")}
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium">
            <Bot className="w-3.5 h-3.5" />
            {t("chipMenuTrained")}
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium">
            <Mic className="w-3.5 h-3.5" />
            {t("chipNaturalConversation")}
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <FeatureCard icon={<Phone className="w-5 h-5" />} title={t("featurePhoneTitle")} body={t("featurePhoneBody")} />
        <FeatureCard icon={<Bot className="w-5 h-5" />} title={t("featureAiTitle")} body={t("featureAiBody")} />
        <FeatureCard icon={<Mic className="w-5 h-5" />} title={t("featureVoiceTitle")} body={t("featureVoiceBody")} />
        <FeatureCard icon={<Sparkles className="w-5 h-5" />} title={t("featureKitchenTitle")} body={t("featureKitchenBody")} />
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          {t("statusHeading")}
        </h3>
        <p className="text-sm text-amber-900 leading-relaxed">{t("statusBody1")}</p>
        <p className="text-sm text-amber-900 leading-relaxed mt-2">{t("statusBody2")}</p>
        <div className="mt-4">
          <Link href="/admin/billing/add-ons" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 transition">
            {t("addonCatalogLink")}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">{icon}</div>
      <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

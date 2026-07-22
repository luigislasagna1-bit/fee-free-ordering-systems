/**
 * /admin/contentpilot — ContentPilot, the AI social media manager.
 *
 * Branded teaser page (the product is comingSoon — the copy used to squat on
 * the FREE Social Media page as an anonymous "Auto-drafted social posts"
 * card; Luigi 2026-06-11 named it ContentPilot and gave it its own GrowthNet
 * sub-tab, separate from the free social-links manager). When the feature
 * ships: flip the add-on's comingSoon off and replace this teaser with the
 * real UI behind featureGate("contentpilot", "contentpilot").
 *
 * "ContentPilot" is a brand name — never translated.
 */
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { Bot, Sparkles, Calendar, MessageSquare, Rocket, Network } from "lucide-react";
import Link from "next/link";
import { localizedAddOnDescription } from "@/lib/addon-catalog-i18n";

export default async function ContentPilotPage() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return null; // admin layout already gates auth

  const t = await getTranslations("admin.contentpilot");
  const tAddOns = await getTranslations("admin.addOns");
  const tCatalog = await getTranslations("addOnCatalog");

  // Pull live catalog copy so the description stays in one place (the AddOn
  // row), same as every other add-on surface.
  const addOn = await prisma.addOn.findUnique({
    where: { slug: "contentpilot" },
    select: { description: true },
  });

  return (
    <div className="max-w-3xl">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-600 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">{t("tagline")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          ContentPilot
          <span className="text-[11px] font-bold uppercase tracking-wide bg-amber-400 text-amber-950 px-2 py-1 rounded-full">
            {tAddOns("comingSoonBadge")}
          </span>
        </h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed">
          {localizedAddOnDescription(tCatalog, "contentpilot", addOn?.description ?? null) ?? t("heroBody")}
        </p>
        <p className="mt-4 text-xs text-white/75 leading-relaxed max-w-2xl flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            {t("includedNote")}{" "}
            <Link href="/admin/growthnet" className="font-semibold underline underline-offset-2 hover:text-white">
              GrowthNet →
            </Link>
          </span>
        </p>
      </div>

      {/* What it will do — the cards moved off the Social Media page */}
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <Feature icon={<Sparkles className="w-4 h-4" />} title={t("featureDraftTitle")} body={t("featureDraftBody")} />
        <Feature icon={<Calendar className="w-4 h-4" />} title={t("featureScheduleTitle")} body={t("featureScheduleBody")} />
        <Feature icon={<MessageSquare className="w-4 h-4" />} title={t("featureTemplatesTitle")} body={t("featureTemplatesBody")} />
        <Feature icon={<Rocket className="w-4 h-4" />} title={t("featureAutoTitle")} body={t("featureAutoBody")} />
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-3 shadow-sm">
      <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

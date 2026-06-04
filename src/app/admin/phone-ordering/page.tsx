import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, Sparkles, Mic, Bot, Clock, ArrowRight, Rocket } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * Phone Ordering — "Coming Soon" teaser page.
 *
 * Linked from the SETUP → Taking Orders sub-group in the sidebar so the
 * feature is publicly discoverable on the admin panel. The page itself
 * doesn't do anything functional yet — there's no Twilio integration,
 * no AI agent, no number provisioning. The implementation is post-
 * launch work.
 *
 * Why ship the teaser before the feature: prospective restaurants get
 * to see the roadmap when they evaluate the platform. Owners can mark
 * interest (not yet wired — would be a future enhancement). And when
 * we DO build it, the entry point is already there in the sidebar so
 * launch is just "swap this page for the real one".
 *
 * When the actual feature lands:
 *   - Replace the body of this page with the configuration UI
 *     (phone number provisioning, AI voice picker, menu coverage,
 *     fallback to staff after-hours, etc.)
 *   - Set the `phone_ordering` add-on's comingSoon=false in /superadmin/add-ons
 *   - Set a real monthlyPriceCents + click Sync to Stripe
 *   - Restaurants can then subscribe + use the feature
 */
export default async function PhoneOrderingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const t = await getTranslations("admin.phoneOrderingPage");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; {t("backToAdmin")}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md">
            <Phone className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                <Rocket className="w-3 h-3" />
                {t("comingSoon")}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {t("pageSubtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Hero pitch ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-blue-600 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-90 mb-2">
          <Sparkles className="w-4 h-4" />
          {t("heroBadge")}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("heroHeadline")}
        </h2>
        <p className="mt-3 text-white/90 text-sm sm:text-base leading-relaxed max-w-2xl">
          {t("heroBody")}
        </p>
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

      {/* ── Feature preview cards ─────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <FeatureCard
          icon={<Phone className="w-5 h-5" />}
          title={t("featurePhoneTitle")}
          body={t("featurePhoneBody")}
        />
        <FeatureCard
          icon={<Bot className="w-5 h-5" />}
          title={t("featureAiTitle")}
          body={t("featureAiBody")}
        />
        <FeatureCard
          icon={<Mic className="w-5 h-5" />}
          title={t("featureVoiceTitle")}
          body={t("featureVoiceBody")}
        />
        <FeatureCard
          icon={<Sparkles className="w-5 h-5" />}
          title={t("featureKitchenTitle")}
          body={t("featureKitchenBody")}
        />
      </div>

      {/* ── Status / next steps ───────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          {t("statusHeading")}
        </h3>
        <p className="text-sm text-amber-900 leading-relaxed">
          {t("statusBody1")}
        </p>
        <p className="text-sm text-amber-900 leading-relaxed mt-2">
          {t("statusBody2")}
        </p>
        <div className="mt-4">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 transition"
          >
            {t("addonCatalogLink")}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

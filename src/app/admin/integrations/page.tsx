import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { BarChart3, Truck, ArrowRight, CheckCircle2, Lock } from "lucide-react";

// Auth-gated + reads the restaurant's Shipday status — never cache.
export const dynamic = "force-dynamic";

/**
 * /admin/integrations — first-pass Integrations surface (Luigi 2026-06-17).
 *
 * A directory of the integrations restaurants ask for, modelled on the
 * CloudWaitress "Integrations" tab. For now most are COMING-SOON cards (the
 * page advertises the roadmap); Shipday is the one we actually support, so its
 * card shows Active/Available and links to the existing delivery-dispatch setup.
 * The real wiring (Facebook Pixel / GA script injection, marketplace order
 * sync, etc.) is deferred — "fix it more in depth later." Keep the brand names
 * untranslated; the descriptions/labels are i18n'd (admin.integrations.*).
 */
type Category = "marketing" | "delivery";
type DescKey = "descTracking" | "descDispatch" | "descMarketplace";

interface IntegrationCard {
  name: string; // brand name — never translated
  category: Category;
  descKey: DescKey;
  icon: typeof Truck;
  /** Set only for integrations we actually support — the card becomes a link. */
  href?: string;
}

const CARDS: IntegrationCard[] = [
  { name: "Facebook Pixel", category: "marketing", descKey: "descTracking", icon: BarChart3 },
  { name: "Google Analytics", category: "marketing", descKey: "descTracking", icon: BarChart3 },
  { name: "Shipday", category: "delivery", descKey: "descDispatch", icon: Truck, href: "/admin/delivery/pool" },
  { name: "Uber Eats", category: "delivery", descKey: "descMarketplace", icon: Truck },
  { name: "DoorDash", category: "delivery", descKey: "descMarketplace", icon: Truck },
  { name: "Tookan", category: "delivery", descKey: "descDispatch", icon: Truck },
  { name: "Lalamove", category: "delivery", descKey: "descDispatch", icon: Truck },
  { name: "Postmates", category: "delivery", descKey: "descMarketplace", icon: Truck },
];

export default async function IntegrationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { shipdayConfig: { select: { id: true } } },
  });
  const shipdayActive = !!restaurant?.shipdayConfig;

  const t = await getTranslations("admin.integrations");
  const tc = await getTranslations("common");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t("subtitle")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          const isShipday = c.name === "Shipday";
          const linked = !!c.href;

          // Status badge: Shipday is Active when configured / Available to set up;
          // everything else is a Coming-soon teaser.
          const badge = isShipday ? (
            shipdayActive ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> {tc("active")}
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{tc("available")}</span>
            )
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              <Lock className="w-3 h-3" /> {t("comingSoon")}
            </span>
          );

          const card = (
            <div
              className={`h-full bg-white rounded-2xl border border-gray-200 p-5 flex flex-col ${
                linked ? "hover:border-emerald-300 hover:shadow-sm transition" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-gray-600" />
                </div>
                {badge}
              </div>
              <div className="mt-3 font-bold text-gray-900">{c.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                {c.category === "marketing" ? t("catMarketing") : t("catDelivery")}
              </div>
              <p className="text-sm text-gray-500 mt-2 flex-1">
                {c.descKey === "descTracking"
                  ? t("descTracking", { name: c.name })
                  : c.descKey === "descDispatch"
                    ? t("descDispatch", { name: c.name })
                    : t("descMarketplace", { name: c.name })}
              </p>
              {linked ? (
                <div className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                  {t("setUp")} <ArrowRight className="w-4 h-4" />
                </div>
              ) : (
                <div className="mt-3 text-sm font-semibold text-gray-400">{t("comingSoon")}</div>
              )}
            </div>
          );

          return c.href ? (
            <Link key={c.name} href={c.href} className="block">
              {card}
            </Link>
          ) : (
            <div key={c.name}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}

"use client";
import {
  CreditCard, Zap, Globe, CheckCircle2,
  ChevronRight, Shield, Building2, ArrowUpRight, ExternalLink, Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrencyFormat } from "@/lib/currency-context";

/**
 * Shape of an active or trialing add-on subscription as it arrives
 * from the page-level server fetch. Fields mirror what the Account
 * card surfaces: the human name, monthly price, and a renewal hint
 * if Stripe is on file. `cancelAtPeriodEnd` lets us flag "ends on
 * <date>" when the owner has clicked Cancel but the period hasn't
 * elapsed yet.
 */
export type ActiveAddOn = {
  id: string;
  status: "active" | "trialing" | "past_due" | "cancelled" | "incomplete";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
};

export function SettingsClient({
  restaurant,
  activeAddOns = [],
}: {
  restaurant: any;
  activeAddOns?: ActiveAddOn[];
}) {
  const formatCurrency = useCurrencyFormat();
  const t = useTranslations("admin.settings");
  const tSidebar = useTranslations("admin.sidebar");

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      </div>

      <div className="space-y-6">
        {/* Customer Payment Processing — link to Payments page */}
        <Section title={tSidebar("payments")}>
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <a
                href="/admin/payments/providers"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition"
              >
                <CreditCard className="w-4 h-4" /> {tSidebar("payments")} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </Section>

        {/* Subscription / Plan
            FREE-by-default model (2026-05 redesign): every restaurant is on
            the FREE plan ($0/mo, 100 orders/month cap) unless they explicitly
            subscribe to a paid add-on. The legacy 4-tier "Starter / Growth /
            Pro / Enterprise" grid was retired — add-ons are managed at
            /admin/billing and /admin/billing/add-ons.

            2026-05-31 fix: this card used to render a hardcoded "FREE / $0"
            line regardless of what add-ons the restaurant actually had
            subscribed. Luigi flagged it from his own account — Online
            Payments was active but the card said FREE. We now sum active
            add-on monthly cents server-side and list each one with its
            real price + status. */}
        <Section title={t("account")}>
          {(() => {
            const monthlyTotalCents = activeAddOns.reduce(
              (sum, a) => sum + (a.status === "active" ? a.monthlyPriceCents : 0),
              0,
            );
            const hasPaid = activeAddOns.length > 0;
            return (
              <>
                <div className="flex items-start gap-5 mb-6">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900">
                        {hasPaid
                          ? `Current Plan: FREE + ${activeAddOns.length} add-on${activeAddOns.length === 1 ? "" : "s"}`
                          : "Current Plan: FREE"}
                      </h3>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {formatCurrency(monthlyTotalCents / 100)}/mo
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Ordering widget, admin, menu, kitchen app — no card
                      required. Accept up to 100 orders/month forever. Add
                      paid features any time from the Billing page.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[
                        "100 orders/month",
                        "Unlimited menu items",
                        "Kitchen display",
                        "Customer accounts",
                      ].map((f) => (
                        <div key={f} className="flex items-center gap-1 text-xs text-gray-600 bg-green-50 border border-green-100 rounded-full px-2.5 py-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Active add-ons list. Only rendered when at least one is
                    on file — we don't want to take up vertical space with
                    an empty list for FREE-only restaurants. Each row shows
                    the human name, price, and a "Trial" / "Cancelling on
                    X" badge as appropriate so the owner can tell at a
                    glance what state each subscription is in. */}
                {hasPaid && (
                  <div className="border-t border-gray-100 pt-5 mb-5">
                    <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" /> Active add-ons
                    </div>
                    <div className="space-y-2">
                      {activeAddOns.map((a) => {
                        const endingSoon = a.cancelAtPeriodEnd && a.currentPeriodEnd;
                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-amber-100 bg-amber-50/50"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 text-sm">{a.name}</span>
                                {a.status === "trialing" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide">
                                    Trial
                                  </span>
                                )}
                                {endingSoon && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 uppercase tracking-wide">
                                    Ends {new Date(a.currentPeriodEnd!).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              {a.description && (
                                <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.description}</div>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                              {formatCurrency(a.monthlyPriceCents / 100)}/mo
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-5">
                  <div className="text-sm font-medium text-gray-700 mb-3">
                    {hasPaid ? "Manage your subscriptions" : "Upgrade with paid add-ons"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/admin/billing"
                      className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                    >
                      Manage Billing <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href="/admin/billing/add-ons"
                      className="inline-flex items-center gap-2 border border-emerald-300 text-emerald-600 hover:bg-emerald-50 font-semibold px-4 py-2 rounded-lg text-sm transition"
                    >
                      Browse Add-ons <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" />
                    Billing is handled securely through Stripe. Cancel anytime.
                  </p>
                </div>
              </>
            );
          })()}
        </Section>

        {/* Order-notification settings live on the dedicated, fully-functional
            /admin/notifications page (sidebar → Notifications). The old stub
            here showed fake toggles + a misleading "coming soon" note that
            duplicated — and contradicted — that working page, so it was removed.
            Luigi 2026-06-11 (reseller report: notifications were duplicated). */}

        {/* Advanced — real add-on tiles.
            2026-05-31: removed the legacy "Growth+ / Pro+ / Enterprise"
            plan-tier badges. Those plan tiers don't exist anymore — we
            ship a FREE base + à-la-carte add-ons. The badge would tell
            a Luigi-style owner to "upgrade to Pro+" with no Pro+ to
            upgrade to. Each tile now links straight to the matching
            add-on on /admin/billing/add-ons where the price + Subscribe
            CTA live. REST API was dropped from this list — there's no
            corresponding add-on, so surfacing it here is misleading. */}
        <Section title={t("dangerZone")}>
          <div className="space-y-3">
            {[
              {
                icon: Globe,
                iconBg: "bg-amber-50",
                iconColor: "text-amber-500",
                title: "Custom Domain",
                desc: "Serve your ordering page at yourdomain.com instead of the default URL.",
                href: "/admin/billing/add-ons#custom_domain",
              },
              {
                icon: Building2,
                iconBg: "bg-gray-50",
                iconColor: "text-gray-500",
                title: "Multi-Location",
                desc: "Manage multiple restaurant locations from one account.",
                href: "/admin/billing/add-ons#multi_location",
              },
            ].map((item) => (
              <a
                key={item.title}
                href={item.href}
                className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-emerald-200 hover:bg-emerald-50/30 transition group"
              >
                <div className={`w-10 h-10 ${item.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-medium text-emerald-600 group-hover:underline">Add-on</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500" />
                </div>
              </a>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}


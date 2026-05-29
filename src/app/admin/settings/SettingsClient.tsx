"use client";
import { useState } from "react";
import {
  CreditCard, Zap, Bell, Globe, Code2, CheckCircle2,
  ChevronRight, Shield, Building2, ArrowUpRight, ExternalLink,
} from "lucide-react";
import { useTranslations } from "next-intl";

export function SettingsClient({ restaurant }: { restaurant: any }) {
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
            /admin/billing and /admin/billing/add-ons. */}
        <Section title={t("account")}>
          <div className="flex items-start gap-5 mb-6">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">Current Plan: FREE</h3>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  $0.00/mo
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Ordering widget, admin, menu, kitchen app — no card required.
                Accept up to 100 orders/month forever. Add paid features any
                time from the Billing page.
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

          <div className="border-t border-gray-100 pt-5">
            <div className="text-sm font-medium text-gray-700 mb-3">Upgrade with paid add-ons</div>
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
        </Section>

        {/* Notifications */}
        <Section title={tSidebar("notifications")}>
          <div className="flex items-start gap-5 mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">Order Notifications</h3>
              <p className="text-sm text-gray-500">
                Configure email alerts sent to <span className="font-medium">{restaurant?.email || "your restaurant email"}</span> when orders arrive or change status.
              </p>
            </div>
          </div>
          <div className="space-y-0 divide-y divide-gray-100">
            {[
              { label: "New order received", desc: "Alert when a customer places a new order", defaultOn: true },
              { label: "Order accepted by kitchen", desc: "Notify when kitchen accepts an order", defaultOn: false },
              { label: "Order ready for pickup", desc: "Alert when order is ready for customer", defaultOn: true },
              { label: "Daily summary email", desc: "End-of-day summary of orders and revenue", defaultOn: false },
            ].map((n) => (
              <NotificationRow key={n.label} {...n} />
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
            <Bell className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Email notifications are coming soon. Contact support to enable order email alerts for your account.</span>
          </div>
        </Section>

        {/* Advanced */}
        <Section title={t("dangerZone")}>
          <div className="space-y-3">
            {[
              {
                icon: Globe,
                iconBg: "bg-amber-50",
                iconColor: "text-amber-500",
                title: "Custom Domain",
                desc: "Serve your ordering page at yourdomain.com instead of the default URL.",
                badge: "Growth+ Plan",
                badgeColor: "bg-amber-100 text-amber-700",
              },
              {
                icon: Code2,
                iconBg: "bg-green-50",
                iconColor: "text-green-500",
                title: "REST API Access",
                desc: "Integrate with your POS, loyalty program, or custom apps via our REST API.",
                badge: "Pro+ Plan",
                badgeColor: "bg-green-100 text-green-700",
              },
              {
                icon: Building2,
                iconBg: "bg-gray-50",
                iconColor: "text-gray-500",
                title: "Multi-Location",
                desc: "Manage multiple restaurant locations from one account.",
                badge: "Enterprise",
                badgeColor: "bg-gray-100 text-gray-600",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition">
                <div className={`w-10 h-10 ${item.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.badgeColor}`}>{item.badge}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function NotificationRow({ label, desc, defaultOn }: { label: string; desc: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-3.5">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        <div className="text-xs text-gray-400">{desc}</div>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${on ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? "left-5" : "left-0.5"}`} />
      </button>
    </div>
  );
}

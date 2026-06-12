/**
 * /admin/customer-sms — Customer SMS Notifications (GrowthNet member tool).
 *
 * The add-on itself is plumbing (sendSms in notifications.ts fires on order
 * status changes once entitled) — this page gives it a visible home under
 * GrowthNet (Luigi 2026-06-11): locked upsell for free accounts via the
 * standard featureGate, and for subscribers an "it's working" view explaining
 * exactly when texts go out + where the per-status toggles live.
 */
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { featureGate } from "@/lib/feature-gate";
import { getTranslations } from "next-intl/server";
import { MessageSquare, CheckCircle2, Bell, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function CustomerSmsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null; // admin layout already gates auth

  // Paid add-on: free accounts see the locked upsell.
  const gate = await featureGate(restaurantId, "customer_sms", "customer_sms");
  if (gate) return gate;

  const t = await getTranslations("admin.customerSms");
  const tCommon = await getTranslations("common");

  const addOn = await prisma.addOn.findUnique({
    where: { slug: "customer_sms" },
    select: { name: true, description: true },
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            {addOn?.name ?? "Customer SMS"}
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
              <CheckCircle2 className="w-3 h-3" /> {tCommon("active")}
            </span>
          </h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
      </div>

      {/* How it works */}
      <div className="mt-6 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">{t("howTitle")}</h2>
        <ul className="space-y-2.5 text-sm text-gray-700">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>{t("how1")}</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>{t("how2")}</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>{t("how3")}</span>
          </li>
        </ul>
      </div>

      {/* Toggles live on the Notifications page */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Bell className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900 flex-1">
          <p>{t("togglesNote")}</p>
          <Link
            href="/admin/notifications"
            className="inline-flex items-center gap-1 mt-2 text-blue-700 underline font-medium"
          >
            {t("openNotifications")} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

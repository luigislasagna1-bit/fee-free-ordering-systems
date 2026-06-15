"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Banknote, CreditCard, Globe, Check, Loader2, ArrowRight, AlertCircle, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Accepted-payment-methods picker — now PER ORDER TYPE (GloriaFood parity,
 * Luigi 2026-06-08). Renders one section per order type the restaurant offers
 * (pickup / delivery / dine-in / takeout); each section toggles the four
 * methods independently. Saves the per-type object to PUT
 * /api/restaurants/payment-methods.
 *
 * "Online card" can be toggled regardless of Stripe state, but enabling it
 * without a connected Stripe account shows a warning + a "Finish Stripe setup"
 * link; online_card / paypal are locked without the Online Payments add-on.
 */

type Method = "cash" | "card_in_person" | "online_card" | "paypal";
const METHOD_IDS: Method[] = ["cash", "card_in_person", "online_card", "paypal"];
const METHOD_ICON: Record<Method, typeof Banknote> = {
  cash: Banknote,
  card_in_person: CreditCard,
  online_card: Globe,
  paypal: Globe,
};

export function PaymentMethodsClient({
  initialByType,
  orderTypes,
  stripeReady,
  stripeStatus,
  onlinePaymentsUnlocked,
}: {
  /** Accepted method slugs per order type, e.g. { pickup:["cash"], delivery:[...] }. */
  initialByType: Record<string, string[]>;
  /** Order types the restaurant offers, in display order. */
  orderTypes: string[];
  stripeReady: boolean;
  stripeStatus: string;
  /** True iff the restaurant has an active/trialing `online_payments` add-on. */
  onlinePaymentsUnlocked: boolean;
}) {
  const t = useTranslations("admin.paymentMethods");
  const router = useRouter();
  const [byType, setByType] = useState<Record<string, Set<Method>>>(() => {
    const init: Record<string, Set<Method>> = {};
    for (const ot of orderTypes) {
      init[ot] = new Set(
        (initialByType[ot] ?? []).filter((m): m is Method => (METHOD_IDS as string[]).includes(m)),
      );
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  const orderTypeLabel = (ot: string) =>
    ot === "pickup" ? t("orderTypePickup")
      : ot === "delivery" ? t("orderTypeDelivery")
      : ot === "dine_in" ? t("orderTypeDineIn")
      : ot === "take_out" ? t("orderTypeTakeOut")
      : ot;

  function toggle(ot: string, m: Method) {
    const currentlyOn = byType[ot]?.has(m) ?? false;
    // A locked method (online card / PayPal without the add-on) can't be
    // turned ON — but one that's ALREADY selected must stay removable, or a
    // restaurant that picked online card before subscribing gets permanently
    // stuck (can't remove it, and its presence blocks saving). Luigi 2026-06-15.
    if ((m === "online_card" || m === "paypal") && !onlinePaymentsUnlocked && !currentlyOn) {
      toast.error(t("toastSubscribeFirst"));
      return;
    }
    setByType((s) => {
      const next = new Set(s[ot] ?? []);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return { ...s, [ot]: next };
    });
  }

  async function save() {
    for (const ot of orderTypes) {
      if ((byType[ot]?.size ?? 0) === 0) {
        toast.error(t("toastPickAtLeastOneType", { type: orderTypeLabel(ot) }));
        return;
      }
    }
    setSaving(true);
    try {
      const methodsByType: Record<string, string[]> = {};
      for (const ot of orderTypes) methodsByType[ot] = Array.from(byType[ot] ?? []);
      const res = await fetch("/api/restaurants/payment-methods", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodsByType }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || t("toastSaveFailed"));
      }
      toast.success(t("toastSaveSuccess"));
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || t("toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const anyOnlineCard = orderTypes.some((ot) => byType[ot]?.has("online_card"));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("perTypeHint")}</p>
      </div>

      {orderTypes.map((ot) => (
        <div key={ot} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{orderTypeLabel(ot)}</h2>
          <div className="space-y-2">
            {METHOD_IDS.map((id) => {
              const Icon = METHOD_ICON[id];
              const selected = byType[ot]?.has(id) ?? false;
              const requiresAddon = (id === "online_card" || id === "paypal") && !onlinePaymentsUnlocked;
              // `locked` = can't be ENABLED. A stale selection (requiresAddon &&
              // selected) stays removable + renders as selected so it's visible
              // and fixable, not silently greyed out. Luigi 2026-06-15.
              const locked = requiresAddon && !selected;
              return (
                <button
                  key={`${ot}-${id}`}
                  type="button"
                  onClick={() => toggle(ot, id)}
                  className={`w-full text-left rounded-2xl border-2 p-3.5 transition flex items-start gap-3 ${
                    locked
                      ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                      : selected
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    locked ? "bg-gray-200 text-gray-400" : selected ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`font-bold text-sm ${locked ? "text-gray-500" : "text-gray-900"}`}>{t(`methodLabel_${id}` as any)}</div>
                      {requiresAddon && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase tracking-wider inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> {t("badgeAddonRequired")}
                        </span>
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 leading-snug ${locked ? "text-gray-500" : "text-gray-600"}`}>{t(`methodDesc_${id}` as any)}</div>
                    {requiresAddon && (
                      <Link
                        href="/admin/billing/add-ons"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                      >
                        {t("subscribeAddonLink")}
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${
                    locked ? "border-gray-300 bg-gray-100" : selected ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 bg-white"
                  }`}>
                    {locked ? <Lock className="w-3 h-3 text-gray-400" /> : selected && <Check className="w-4 h-4" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Stripe-status callout — shown whenever any order type accepts online card. */}
      {anyOnlineCard && (
        <div className={`rounded-2xl border-2 p-4 ${stripeReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${stripeReady ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>
              {stripeReady ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              {stripeReady ? (
                <>
                  <div className="font-bold text-emerald-900">{t("stripeReadyTitle")}</div>
                  <p className="text-sm text-emerald-800 mt-0.5 leading-snug">{t("stripeReadyBody")}</p>
                </>
              ) : (
                <>
                  <div className="font-bold text-amber-900">{t("stripeNotReadyTitle")}</div>
                  <p className="text-sm text-amber-800 mt-0.5 leading-snug">
                    {t.rich("stripeNotReadyBody", {
                      status: stripeStatus ?? "",
                      code: (chunks) => <code className="bg-amber-100 px-1 py-0.5 rounded">{chunks}</code>,
                    })}
                  </p>
                  <Link
                    href="/admin/payments/providers"
                    className="mt-3 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
                  >
                    {t("finishStripeSetupButton")}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow transition flex items-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t("buttonSaving")}</>
          ) : (
            <>{t("buttonSaveChanges")}</>
          )}
        </button>
      </div>
    </div>
  );
}

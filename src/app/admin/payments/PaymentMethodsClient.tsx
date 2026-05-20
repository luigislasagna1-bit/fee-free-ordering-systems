"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Banknote, CreditCard, Globe, Check, Loader2, ArrowRight, AlertCircle, Lock } from "lucide-react";

/**
 * Accepted-payment-methods picker.
 *
 * Method cards toggle on/off. "Online card" can be toggled regardless of
 * Stripe state, but if the owner enables it without a connected Stripe
 * account they see a warning + a "Finish Stripe setup →" link to
 * /admin/payments/providers — they CAN'T publish until Stripe is live.
 *
 * Save calls PUT /api/restaurants/payment-methods, then router.refresh()
 * so the layout re-runs and the floating GuidedSetupPill auto-advances.
 */

type Method = "cash" | "card_in_person" | "online_card";

const METHOD_CARDS: Array<{
  id: Method;
  label: string;
  description: string;
  icon: typeof Banknote;
}> = [
  {
    id: "cash",
    label: "Cash",
    description: "Customers pay with cash at pickup or when their delivery arrives. Zero setup required.",
    icon: Banknote,
  },
  {
    id: "card_in_person",
    label: "Card in person",
    description: "You take card payments via your own in-store POS, Square reader, Clover, or mobile terminal at pickup or delivery. We don't process these.",
    icon: CreditCard,
  },
  {
    id: "online_card",
    label: "Online card payment",
    description: "Customers pay by card on the ordering page. Money lands in your Stripe account, minus a small processor fee. Requires Stripe Connect setup.",
    icon: Globe,
  },
];

export function PaymentMethodsClient({
  initialMethods,
  stripeReady,
  stripeStatus,
  onlinePaymentsUnlocked,
}: {
  initialMethods: string[];
  stripeReady: boolean;
  stripeStatus: string;
  /** True iff the restaurant has an active/trialing `online_payments`
   *  add-on. When false, the online_card tile is locked. */
  onlinePaymentsUnlocked: boolean;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<Set<Method>>(
    new Set(initialMethods.filter((m): m is Method =>
      m === "cash" || m === "card_in_person" || m === "online_card"
    ))
  );
  const [saving, setSaving] = useState(false);

  function toggle(m: Method) {
    if (m === "online_card" && !onlinePaymentsUnlocked) {
      toast.error("Subscribe to the Online Payments add-on first.");
      return;
    }
    setMethods((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  async function save() {
    if (methods.size === 0) {
      toast.error("Pick at least one payment method.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/payment-methods", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methods: Array.from(methods) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save");
      }
      toast.success("Payment methods updated");
      // Re-render the layout so the setup checklist + GuidedSetupPill pick
      // up the new selection (and Stripe Connect becomes required-or-not
      // based on whether online_card is now in the list).
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const onlineCardSelected = methods.has("online_card");
  const onlineCardWarning = onlineCardSelected && !stripeReady;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accepted payment methods</h1>
        <p className="text-sm text-gray-600 mt-1">
          Pick how customers can pay. You can change these any time — it just
          affects what shows up on the customer&apos;s checkout page.
        </p>
      </div>

      <div className="space-y-3">
        {METHOD_CARDS.map((m) => {
          const Icon = m.icon;
          const selected = methods.has(m.id);
          const locked = m.id === "online_card" && !onlinePaymentsUnlocked;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`w-full text-left rounded-2xl border-2 p-4 transition flex items-start gap-4 ${
                locked
                  ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                  : selected
                  ? "border-orange-400 bg-orange-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                locked ? "bg-gray-200 text-gray-400" : selected ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`font-bold ${locked ? "text-gray-500" : "text-gray-900"}`}>{m.label}</div>
                  {locked && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase tracking-wider inline-flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Add-on required
                    </span>
                  )}
                  {!locked && selected && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500 text-white uppercase tracking-wider">
                      Selected
                    </span>
                  )}
                </div>
                <div className={`text-sm mt-1 leading-snug ${locked ? "text-gray-500" : "text-gray-600"}`}>{m.description}</div>
                {locked && (
                  <Link
                    href="/admin/billing/add-ons"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    Subscribe to Online Payments add-on
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${
                locked ? "border-gray-300 bg-gray-100" : selected ? "border-orange-500 bg-orange-500 text-white" : "border-gray-300 bg-white"
              }`}>
                {locked ? <Lock className="w-3 h-3 text-gray-400" /> : selected && <Check className="w-4 h-4" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stripe-status callout shows whenever online_card is in the list. */}
      {onlineCardSelected && (
        <div className={`rounded-2xl border-2 p-4 ${
          stripeReady
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              stripeReady ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
            }`}>
              {stripeReady ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              {stripeReady ? (
                <>
                  <div className="font-bold text-emerald-900">Stripe Connect is live</div>
                  <p className="text-sm text-emerald-800 mt-0.5 leading-snug">
                    Card payments will flow into your Stripe account. You&apos;re ready to publish.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-bold text-amber-900">
                    Finish Stripe setup to accept online card payments
                  </div>
                  <p className="text-sm text-amber-800 mt-0.5 leading-snug">
                    You picked online card payment, but Stripe Connect is{" "}
                    <code className="bg-amber-100 px-1 py-0.5 rounded">{stripeStatus}</code>.
                    You can&apos;t publish until charges are enabled on your account.
                  </p>
                  <Link
                    href="/admin/payments/providers"
                    className="mt-3 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
                  >
                    Finish Stripe setup
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-gray-500">
          {methods.size === 0
            ? "Pick at least one method to publish."
            : `${methods.size} method${methods.size === 1 ? "" : "s"} selected`}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || methods.size === 0}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow transition flex items-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <>Save changes</>
          )}
        </button>
      </div>

      {/* Note about the warning */}
      {onlineCardWarning && (
        <p className="text-xs text-amber-700 text-right">
          ⚠ Save will succeed, but Stripe must be connected before you can publish.
        </p>
      )}
    </div>
  );
}

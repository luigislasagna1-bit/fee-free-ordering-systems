"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";

function CheckoutForm({
  orderId,
  slug,
  payAmountLabel,
}: {
  orderId: string;
  slug: string;
  /** Preformatted net amount ("$12.34") appended to the Pay Now button, or null when the summary fetch failed. */
  payAmountLabel: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const t = useTranslations("customer.payment");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError("");

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/${slug}/confirmation?orderId=${orderId}`,
      },
    });

    if (stripeError) {
      setError(stripeError.message ?? t("paymentFailed"));
      setPaying(false);
    }
    // On success, Stripe redirects to return_url automatically
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || paying}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {paying && <Loader2 className="w-5 h-5 animate-spin" />}
        {paying ? t("processing") : payAmountLabel ? `${t("payNow")} · ${payAmountLabel}` : t("payNow")}
      </button>
    </form>
  );
}

export function PaymentPageClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("customer.payment");
  // Root translator for the shared checkout.* / receipt.customer.* money keys
  // (already translated in all 38 locales) — same pattern as the status page.
  const tRoot = useTranslations();
  const orderId = searchParams.get("orderId") ?? "";
  // ── The page is now self-sufficient from `orderId` alone (Luigi 2026-08-11) ──
  // It used to require clientSecret + pk to be carried in the QUERY STRING. That
  // made the payment screen un-reloadable: a refresh, a back-then-forward, a
  // link handler or in-app browser that trimmed the URL, or anything that
  // dropped a param landed the customer on "Invalid payment link" mid-checkout —
  // Luigi's "customers kicked out while trying to pay". It also put a live
  // payment credential into browser history, referrer headers and access logs.
  //
  // Now we re-derive the intent from the order id below. Re-deriving is safe:
  // /api/public/payment-intent creates with a per-order idempotency key, so a
  // reload returns the SAME PaymentIntent and can never place a second hold.
  // The URL params are still READ so a customer already mid-checkout on the
  // previous build isn't interrupted by the deploy.
  const legacyClientSecret = searchParams.get("clientSecret") ?? "";
  const legacyPk = searchParams.get("pk") ?? "";
  // Direct-charge PaymentIntents live on the restaurant's connected account.
  // Stripe.js needs the `stripeAccount` option at load time so confirmation
  // hits the right account. Empty string means "platform charge" — kept
  // as a fallback for legacy intents created before the cutover.
  const stripeAccount = searchParams.get("stripeAccount") ?? "";

  const [clientSecret, setClientSecret] = useState(legacyClientSecret);
  const [stripePromise, setStripePromise] = useState(() =>
    legacyPk
      ? loadStripe(legacyPk, stripeAccount ? { stripeAccount } : undefined)
      : null,
  );
  const [setupError, setSetupError] = useState("");

  // Money summary — what the card is about to be charged. Fetched from the
  // public order endpoint (same select the status page uses) so the page can
  // show Total / credit used / net "To pay today" above the card form.
  // STRICTLY best-effort: any failure leaves `summary` null and the page
  // renders exactly as before — payment must never be blocked by the summary.
  const [summary, setSummary] = useState<{
    total: number;
    creditUsed: number;
    toPay: number;
    rewardLabel: string;
    currency: string;
  } | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      let o: any = null;
      try {
        const r = await fetch(`/api/orders/${orderId}`);
        o = r.ok ? await r.json() : null;
      } catch { /* handled below */ }
      if (cancelled) return;

      if (o && typeof o.total === "number") {
        // Reward rows only when the program is currently ON for this store.
        const rewardsOn = !!o.restaurant?.rewardsEnabled;
        const creditUsed = rewardsOn ? Math.max(0, Number(o.creditApplied) || 0) : 0;
        setSummary({
          total: o.total,
          creditUsed,
          // The PaymentIntent was created for total − credit; quote the same net.
          toPay: Math.max(0, Math.round((o.total - creditUsed) * 100) / 100),
          rewardLabel:
            o.restaurant?.rewardLabelPlural?.trim() ||
            o.restaurant?.rewardLabelSingular?.trim() ||
            tRoot("checkout.reward.defaultPlural"),
          currency: (o.restaurant?.currency || "usd").toLowerCase(),
        });
      }

      // Already carrying an intent from the URL (customer mid-checkout across
      // the deploy) — nothing to set up.
      if (legacyClientSecret && legacyPk) return;

      // This order is already settled — don't re-present a card form for money
      // that's been taken. Send them to the confirmation, which now reports the
      // real state either way.
      if (o && (o.paymentStatus === "paid" || o.paymentStatus === "authorized")) {
        router.replace(`/order/${slug}/confirmation?orderId=${orderId}`);
        return;
      }

      if (!o || typeof o.total !== "number") {
        setSetupError(t("couldNotStartPayment"));
        return;
      }

      // Re-derive the PaymentIntent from the order. The server re-prices the
      // order and refuses on any mismatch, so this `amount` is a probe, not a
      // trusted input — same contract the checkout has always used.
      const creditUsed = Math.max(0, Number(o.creditApplied) || 0);
      const amount = Math.max(0, Math.round((o.total - creditUsed) * 100) / 100);
      try {
        const res = await fetch("/api/public/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantSlug: slug,
            amount,
            currency: (o.restaurant?.currency || "usd").toLowerCase(),
            metadata: { orderId },
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.clientSecret || !data.publishableKey) {
          setSetupError(data.error || t("couldNotStartPayment"));
          return;
        }
        setStripePromise(
          loadStripe(data.publishableKey, data.stripeAccount ? { stripeAccount: data.stripeAccount } : undefined),
        );
        setClientSecret(data.clientSecret);
      } catch {
        if (!cancelled) setSetupError(t("couldNotStartPayment"));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  const fmt = (amount: number) => formatCurrency(amount, summary?.currency ?? "usd");

  // Only a genuinely missing order id is an unrecoverable link now — everything
  // else is either still resolving or a reportable setup failure.
  if (!orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">{t("invalidPaymentLink")}</div>
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {setupError}
          </div>
          <button
            onClick={() => router.push(`/order/${slug}`)}
            className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-200 transition"
          >
            {t("backToRestaurant")}
          </button>
        </div>
      </div>
    );
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t("preparingPayment")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t("completePayment")}</h1>
            <p className="text-sm text-gray-500">{t("orderReserved")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
          {t("securedByStripe")}
        </div>

        {/* Money summary — Total, credit used, net to pay. Skipped entirely
            when the fetch failed (summary null) so payment is never blocked. */}
        {summary && (
          <div className="border border-gray-100 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>{tRoot("checkout.total")}</span>
              <span>{fmt(summary.total)}</span>
            </div>
            {summary.creditUsed > 0 && (
              <>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>{tRoot("receipt.customer.paidWithReward", { label: summary.rewardLabel })}</span>
                  <span>− {fmt(summary.creditUsed)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900">
                  <span>{tRoot("checkout.reward.chargeToday")}</span>
                  <span>{fmt(summary.toPay)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm
              orderId={orderId}
              slug={slug}
              payAmountLabel={summary ? fmt(summary.toPay) : null}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

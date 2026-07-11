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
  const clientSecret = searchParams.get("clientSecret") ?? "";
  const pk = searchParams.get("pk") ?? "";
  // Direct-charge PaymentIntents live on the restaurant's connected account.
  // Stripe.js needs the `stripeAccount` option at load time so confirmation
  // hits the right account. Empty string means "platform charge" — kept
  // as a fallback for legacy intents created before the cutover.
  const stripeAccount = searchParams.get("stripeAccount") ?? "";

  const [stripePromise] = useState(() =>
    pk
      ? loadStripe(pk, stripeAccount ? { stripeAccount } : undefined)
      : null,
  );

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
    fetch(`/api/orders/${orderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => {
        if (cancelled || !o || typeof o.total !== "number") return;
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
      })
      .catch(() => { /* silent — summary is optional */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  const fmt = (amount: number) => formatCurrency(amount, summary?.currency ?? "usd");

  if (!clientSecret || !pk || !orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">{t("invalidPaymentLink")}</div>
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

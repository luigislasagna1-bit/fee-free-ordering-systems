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

function CheckoutForm({ orderId, slug }: { orderId: string; slug: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
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
      setError(stripeError.message ?? "Payment failed");
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
        {paying ? "Processing…" : "Pay Now"}
      </button>
    </form>
  );
}

export function PaymentPageClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  if (!clientSecret || !pk || !orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">Invalid payment link.</div>
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
            <h1 className="text-xl font-bold text-gray-900">Complete Payment</h1>
            <p className="text-sm text-gray-500">Your order is reserved while you pay</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
          Secured by Stripe. We never store your card details.
        </div>

        {stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm orderId={orderId} slug={slug} />
          </Elements>
        )}
      </div>
    </div>
  );
}

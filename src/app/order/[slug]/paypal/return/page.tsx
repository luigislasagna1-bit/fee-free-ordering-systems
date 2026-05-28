/**
 * /order/[slug]/paypal/return?orderId=...
 *
 * Landing page after the customer approves a PayPal payment. We POST to
 * /api/public/paypal-order/[id]/authorize to lock funds, then send the
 * customer to the standard order-tracking page. If authorize fails
 * (network, PayPal-side error, customer somehow approved a stale order),
 * we surface the error with a retry CTA.
 *
 * Client component because we need to fire the authorize call from the
 * browser — keeps the server-side handler stateless. Also lets us show
 * a spinner while PayPal's redirect resolves.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function PaypalReturnPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const orderId = search.get("orderId") ?? "";
  const [state, setState] = useState<"authorizing" | "success" | "error">("authorizing");
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-effect guard — we only want one authorize call.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (!orderId) {
      setState("error");
      setError("Missing order id");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/public/paypal-order/${encodeURIComponent(orderId)}/authorize`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("error");
          setError(data.error ?? "Could not finalize your PayPal payment.");
          return;
        }
        setState("success");
        // Auto-redirect after a brief beat so the customer sees the
        // confirmation tick before the tracking page paints.
        setTimeout(() => {
          router.replace(`/order/${params.slug}/status/${encodeURIComponent(orderId)}`);
        }, 1200);
      } catch {
        setState("error");
        setError("Network error finalizing PayPal payment.");
      }
    })();
  }, [orderId, params.slug, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
        {state === "authorizing" && (
          <>
            <Loader2 className="w-10 h-10 mx-auto text-blue-500 animate-spin" />
            <h1 className="mt-4 text-lg font-bold text-gray-900">Finalizing your PayPal payment&hellip;</h1>
            <p className="mt-1 text-sm text-gray-500">Hold on a moment, don&apos;t close this page.</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle className="w-10 h-10 mx-auto text-emerald-500" />
            <h1 className="mt-4 text-lg font-bold text-gray-900">Order placed!</h1>
            <p className="mt-1 text-sm text-gray-500">Taking you to your order tracking page&hellip;</p>
          </>
        )}
        {state === "error" && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
            <h1 className="mt-4 text-lg font-bold text-gray-900">Payment couldn&apos;t be finalized</h1>
            <p className="mt-2 text-sm text-gray-600">{error}</p>
            <div className="mt-4 flex gap-2 justify-center">
              <Link
                href={`/order/${params.slug}`}
                className="bg-gray-900 hover:bg-gray-700 text-white font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Back to menu
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

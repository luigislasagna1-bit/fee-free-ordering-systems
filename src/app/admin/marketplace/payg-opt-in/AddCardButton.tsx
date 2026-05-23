"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, CreditCard } from "lucide-react";

/**
 * Kicks off a Stripe Checkout session in setup mode to collect a card
 * without charging it. On success, Stripe redirects back here with
 * ?card_saved=1; the server re-renders the page with hasCard=true and
 * the PAYG opt-in button becomes enabled.
 */
export function AddCardButton() {
  const [loading, setLoading] = useState(false);

  async function start() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing/setup-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/admin/marketplace/payg-opt-in" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        toast.error(data?.error || "Failed to start card setup");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e?.message || "Failed to start card setup");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading}
      className="mt-3 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Opening Stripe…</>
      ) : (
        <><CreditCard className="w-4 h-4" /> Add a payment method</>
      )}
    </button>
  );
}

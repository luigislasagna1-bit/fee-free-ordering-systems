"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type AddOnView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number | null;
  enabledFeatures: string[];
  requiredDependencies: string[];
  stripePriceId: string | null;
  isSubscribed: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: Date | string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export function AddOnsClient({ addOns }: { addOns: AddOnView[] }) {
  const router = useRouter();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(slug: string) {
    setError(null);
    setPendingSlug(slug);
    try {
      const r = await fetch("/api/admin/add-ons/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addOnSlug: slug }),
      });
      const data = await r.json();
      if (!r.ok || !data?.url) {
        setError(data?.error || "Failed to start checkout");
        setPendingSlug(null);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Failed to start checkout");
      setPendingSlug(null);
    }
  }

  async function cancel(slug: string) {
    if (!confirm("Cancel this add-on at the end of the current billing period?")) return;
    setError(null);
    setPendingSlug(slug);
    try {
      const r = await fetch("/api/admin/add-ons/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addOnSlug: slug }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Failed to cancel");
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || "Failed to cancel");
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {addOns.map((a) => {
          const dollars = (a.monthlyPriceCents / 100).toFixed(2);
          const active =
            a.isSubscribed && ["active", "trialing"].includes(a.subscription?.status || "");
          const scheduled = a.subscription?.cancelAtPeriodEnd;
          const notSynced = !a.stripePriceId;
          const busy = pendingSlug === a.slug;

          return (
            <div
              key={a.id}
              className={`rounded-xl border bg-white p-5 ${
                active ? "border-green-300 ring-1 ring-green-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{a.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                </div>
                {active && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                )}
              </div>

              <div className="mt-3">
                <span className="text-2xl font-bold text-gray-900">
                  ${dollars}
                </span>
                <span className="text-sm text-gray-500"> / month</span>
                {a.trialDays && a.trialDays > 0 && (
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {a.trialDays}-day trial
                  </span>
                )}
              </div>

              {a.enabledFeatures.length > 0 && (
                <ul className="mt-3 text-xs text-gray-600 space-y-1">
                  {a.enabledFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-1">
                      <span className="text-green-600">&#10003;</span>
                      <code className="text-xs">{f}</code>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100">
                {active ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {scheduled
                        ? "Ends at period close"
                        : `Renews ${
                            a.subscription?.currentPeriodEnd
                              ? new Date(a.subscription.currentPeriodEnd).toLocaleDateString()
                              : "automatically"
                          }`}
                    </span>
                    {!scheduled && (
                      <button
                        type="button"
                        onClick={() => cancel(a.slug)}
                        disabled={busy}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {busy ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => subscribe(a.slug)}
                    disabled={busy || notSynced || a.monthlyPriceCents <= 0}
                    className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    title={
                      notSynced
                        ? "This add-on isn't synced to Stripe yet. Ask the platform admin."
                        : a.monthlyPriceCents <= 0
                        ? "No price set yet"
                        : ""
                    }
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {notSynced || a.monthlyPriceCents <= 0 ? "Coming soon" : busy ? "Loading…" : "Subscribe"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

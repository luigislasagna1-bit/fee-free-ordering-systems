"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, X, Clock, RefreshCw } from "lucide-react";

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
  // Slug currently in the cancel-confirmation modal. Replaces the old
  // window.confirm() which had no "Don't cancel" + no visible date.
  const [cancelConfirm, setCancelConfirm] = useState<AddOnView | null>(null);

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

  async function confirmCancel(slug: string) {
    setError(null);
    setPendingSlug(slug);
    setCancelConfirm(null);
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

  async function resume(slug: string) {
    setError(null);
    setPendingSlug(slug);
    try {
      const r = await fetch("/api/admin/add-ons/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addOnSlug: slug }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Failed to resume");
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || "Failed to resume");
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
          const periodEnd = a.subscription?.currentPeriodEnd
            ? new Date(a.subscription.currentPeriodEnd)
            : null;

          return (
            <div
              key={a.id}
              className={`rounded-xl border bg-white p-5 ${
                scheduled
                  ? "border-amber-300 ring-1 ring-amber-200"
                  : active
                  ? "border-green-300 ring-1 ring-green-200"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{a.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                </div>
                {active && !scheduled && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                )}
                {scheduled && (
                  <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                )}
              </div>

              <div className="mt-3">
                <span className="text-2xl font-bold text-gray-900">
                  ${dollars}
                </span>
                <span className="text-sm text-gray-500"> / month</span>
                {(a.trialDays ?? 0) > 0 && (
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {a.trialDays}-day trial
                  </span>
                )}
                <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">
                  USD · CA tax by province · US/intl exempt
                </div>
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
                {scheduled ? (
                  // Scheduled-cancellation state — show the exact date and a
                  // prominent "Keep this service" button so owners can undo
                  // an accidental cancel without panicking.
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
                      <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        Cancellation scheduled
                      </div>
                      <div className="text-amber-800 mt-0.5">
                        {periodEnd ? (
                          <>
                            Access ends{" "}
                            <strong>
                              {periodEnd.toLocaleDateString(undefined, {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </strong>
                            . Until then, the feature stays unlocked.
                          </>
                        ) : (
                          "Access ends at the end of your current billing period."
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => resume(a.slug)}
                      disabled={busy}
                      className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Restoring…</>
                      ) : (
                        <><RefreshCw className="w-4 h-4" /> Keep this service</>
                      )}
                    </button>
                  </div>
                ) : active ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {periodEnd
                        ? `Renews ${periodEnd.toLocaleDateString()}`
                        : "Renews automatically"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCancelConfirm(a)}
                      disabled={busy}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Cancel"}
                    </button>
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

      {/* Cancel-confirmation modal — replaces window.confirm() so owners
          see the exact end date AND have an obvious "Don't cancel"
          escape hatch. */}
      {cancelConfirm && (
        <CancelModal
          addOn={cancelConfirm}
          onClose={() => setCancelConfirm(null)}
          onConfirm={() => confirmCancel(cancelConfirm.slug)}
        />
      )}
    </div>
  );
}

function CancelModal({
  addOn,
  onClose,
  onConfirm,
}: {
  addOn: AddOnView;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const periodEnd = addOn.subscription?.currentPeriodEnd
    ? new Date(addOn.subscription.currentPeriodEnd)
    : null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Cancel {addOn.name}?</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 text-sm text-gray-700 leading-relaxed">
          <p>
            You&apos;ll keep access to the features below until
            {periodEnd ? (
              <>
                {" "}
                <strong>
                  {periodEnd.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
              </>
            ) : (
              " the end of the current billing period"
            )}
            . After that, the add-on turns off — you can re-subscribe any time.
          </p>
          {addOn.enabledFeatures.length > 0 && (
            <ul className="mt-3 space-y-1">
              {addOn.enabledFeatures.map((f) => (
                <li key={f} className="text-xs text-gray-600 flex items-center gap-1.5">
                  <X className="w-3 h-3 text-red-400" />
                  <code className="font-mono">{f}</code> will be locked
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition"
          >
            Don&apos;t cancel — keep this service
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 transition"
          >
            Yes, cancel
          </button>
        </div>
      </div>
    </div>
  );
}

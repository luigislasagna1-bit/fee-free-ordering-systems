"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, X, Clock, RefreshCw, Sparkles, ArrowRight, Settings, Rocket } from "lucide-react";

/**
 * Where each add-on's settings/config live. Used to render an "Open settings"
 * deep-link on each ACTIVE add-on card so owners don't have to hunt for the
 * matching admin page. Keys are AddOn.slug values; missing slugs render no
 * link (the add-on has no config surface).
 *
 * When adding a new add-on with config, add a row here. When the slug has
 * no admin-side settings (e.g. a passive "unlock this feature" add-on),
 * leave it out.
 */
const ADDON_SETTINGS_PATH: Record<string, { href: string; label: string }> = {
  hosted_website:           { href: "/admin/website/editor",      label: "Open website editor" },
  online_payments:          { href: "/admin/payments/providers",  label: "Manage Stripe Connect" },
  marketplace:              { href: "/admin/marketplace",         label: "Manage marketplace listing" },
  driver_pool:              { href: "/admin/delivery/pool",       label: "Configure driver pool" },
  multi_location:           { href: "/admin/locations",           label: "Manage locations" },
  custom_domain:            { href: "/admin/website/domain",      label: "Connect your domain" },
  advanced_promo_marketing: { href: "/admin/promotions",          label: "Run promotions" },
  reservation_deposits:     { href: "/admin/reservations",        label: "Configure reservations" },
  branded_mobile_app:       { href: "/admin/publishing",          label: "Configure app" },
};

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
  /** Roadmap teaser flag. When true, the catalog card renders as
   *  "Coming Soon" — visible but unsubscribable. */
  comingSoon: boolean;
  isSubscribed: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: Date | string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

/** Marketplace listing data (only needed for the "marketplace" slug,
 *  but plumbed through here so the card can render dual-plan info). */
type MarketplaceListingHint = {
  billingMode: string;          // "monthly" | "payg"
  isListed: boolean;
  switchToPaygOnCancel: boolean;
} | null;

export function AddOnsClient({
  addOns,
  marketplaceListing = null,
}: {
  addOns: AddOnView[];
  marketplaceListing?: MarketplaceListingHint;
}) {
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

      {/* FREE Unlimited Orders is only useful for restaurants on the
          FREE plan with no other paid add-on (every paid add-on already
          includes unlimited orders via the hasAnyPaidAddOn cap exemption
          in src/lib/order-cap.ts). If they have at least one OTHER paid
          add-on active, subscribing to Unlimited Orders is buying nothing
          new — we surface it as "Already included" and disable the
          Subscribe button so they can't accidentally pay $14.99/mo for
          nothing. The card stays visible (rather than being hidden) so
          owners can see what's in the catalog. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(() => {
          const hasOtherPaidAddOn = addOns.some((x) =>
            x.slug !== "unlimited_orders" &&
            x.isSubscribed &&
            ["active", "trialing"].includes(x.subscription?.status || "")
          );
          // Marketplace Monthly bundles driver_pool (see seed-addons.ts).
          // PAYG does NOT — PAYG users don't have a RestaurantAddOn row
          // so the isSubscribed flag is false for them here.
          const hasMarketplaceMonthly = addOns.some((x) =>
            x.slug === "marketplace" &&
            x.isSubscribed &&
            ["active", "trialing"].includes(x.subscription?.status || "")
          );
          // Is Marketplace mid-switch from Monthly to PAYG? When yes
          // the bundled Driver Pool inclusion has an expiration date —
          // we surface that on BOTH the Marketplace tile (extending
          // the existing "Switching to PAYG" notice) AND the Driver
          // Pool tile (so owners know to subscribe to driver_pool
          // separately before the monthly period ends, or they'll
          // lose access to drivers AND to fulfilling marketplace
          // orders entirely). Luigi 2026-05-31.
          const marketplaceRow = addOns.find((x) => x.slug === "marketplace");
          const marketplaceSwitchingToPayg =
            !!marketplaceRow?.subscription?.cancelAtPeriodEnd &&
            !!marketplaceListing?.switchToPaygOnCancel;
          const marketplaceSwitchEnd = marketplaceSwitchingToPayg && marketplaceRow?.subscription?.currentPeriodEnd
            ? new Date(marketplaceRow.subscription.currentPeriodEnd)
            : null;
          return addOns.map((a) => {
          const dollars = (a.monthlyPriceCents / 100).toFixed(2);
          const active =
            a.isSubscribed && ["active", "trialing"].includes(a.subscription?.status || "");
          const scheduled = a.subscription?.cancelAtPeriodEnd;
          const notSynced = !a.stripePriceId;
          const busy = pendingSlug === a.slug;
          const periodEnd = a.subscription?.currentPeriodEnd
            ? new Date(a.subscription.currentPeriodEnd)
            : null;
          // Unlimited Orders is redundant for restaurants who already
          // have ANY other paid add-on (they're already cap-exempt).
          const unlimitedRedundant =
            a.slug === "unlimited_orders" && !active && hasOtherPaidAddOn;
          // Driver Pool is redundant when Marketplace Monthly is active
          // (Marketplace bundles driver_pool via enabledFeatures).
          // EXCEPTION: when the owner has scheduled the Monthly → PAYG
          // switch, the bundled inclusion ends at the period boundary.
          // We then surface the Subscribe button (NOT "already
          // included") so they can lock in driver_pool before the
          // switch lands. Without this, they'd hit the PAYG date with
          // no drivers and a still-open Marketplace listing → bad UX.
          const driverPoolRedundant =
            a.slug === "driver_pool" && !active && hasMarketplaceMonthly && !marketplaceSwitchingToPayg;
          const includedNote = unlimitedRedundant
            ? "Your other paid add-on already includes unlimited orders — you don't need this one."
            : driverPoolRedundant
              ? "Marketplace Monthly already includes the ShipDay Driver Pool — you don't need this one."
              : null;
          // Special pre-cancellation banner on the Driver Pool tile —
          // rendered as a warning ABOVE the Subscribe button when the
          // user is mid-switch from Marketplace Monthly to PAYG.
          const driverPoolEndingWithMarketplace =
            a.slug === "driver_pool" && !active && hasMarketplaceMonthly && marketplaceSwitchingToPayg;
          // Marketplace-specific: is the user mid-switch from Monthly to
          // PAYG? When both Stripe's cancel_at_period_end AND our local
          // switchToPaygOnCancel flag are set, the "scheduled cancellation"
          // UI below is actually a "switching to PAYG" event — different
          // labels, different undo button copy. See
          // /admin/marketplace/payg-opt-in for the full switch flow.
          const isMarketplaceSwitch =
            a.slug === "marketplace" &&
            !!scheduled &&
            !!marketplaceListing?.switchToPaygOnCancel;

          return (
            <div
              key={a.id}
              className={`rounded-xl border bg-white p-5 ${
                a.comingSoon && !active
                  ? "border-amber-200 bg-gradient-to-br from-white to-amber-50/40"
                  : scheduled
                  ? "border-amber-300 ring-1 ring-amber-200"
                  : active
                  ? "border-green-300 ring-1 ring-green-200"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{a.name}</h3>
                    {a.comingSoon && !active && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        <Rocket className="w-2.5 h-2.5" />
                        Coming Soon
                      </span>
                    )}
                  </div>
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
                {a.comingSoon && !active ? (
                  // Coming-soon card: don't show a price at all. The
                  // ROADMAP teaser format — restaurants see the value
                  // prop without us mis-selling vapor.
                  <div className="text-sm text-amber-700 font-semibold">
                    In development · pricing TBD
                  </div>
                ) : (
                  <>
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
                  </>
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
                {scheduled ? (
                  // Scheduled-cancellation state. Two flavors:
                  //   1. Marketplace switching to PAYG → friendlier copy
                  //      ("Switching to Pay-As-You-Go") + the undo button
                  //      goes to the dedicated switch flow page (which
                  //      lets them click "Stay on Monthly" — clearer than
                  //      "Keep this service" for a switch context).
                  //   2. Everything else → existing "Cancellation
                  //      scheduled" + "Keep this service" flow.
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
                      <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {isMarketplaceSwitch ? "Switching to Pay-As-You-Go" : "Cancellation scheduled"}
                      </div>
                      <div className="text-amber-800 mt-0.5">
                        {periodEnd ? (
                          isMarketplaceSwitch ? (
                            <>
                              Monthly ends{" "}
                              <strong>
                                {periodEnd.toLocaleDateString(undefined, {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </strong>
                              . PAYG ($3/order, capped $249.99/mo) kicks in automatically.
                              Your listing stays live throughout.
                              {/* Driver Pool was bundled with Monthly; PAYG does NOT
                                  include it. Without an explicit subscribe-now nudge
                                  the owner loses ShipDay dispatch on the switch date
                                  and can't deliver marketplace orders either. */}
                              <span className="block mt-2 text-amber-900 font-medium">
                                ⚠ The bundled <strong>Driver Pool</strong> ends on the
                                same date. To keep dispatching to ShipDay drivers (and
                                to keep fulfilling Marketplace orders, which need
                                drivers), subscribe to the Driver Pool add-on
                                separately before then.
                              </span>
                            </>
                          ) : (
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
                          )
                        ) : (
                          isMarketplaceSwitch
                            ? "PAYG kicks in at the end of your current billing period."
                            : "Access ends at the end of your current billing period."
                        )}
                      </div>
                    </div>
                    {isMarketplaceSwitch ? (
                      <Link
                        href="/admin/marketplace/payg-opt-in"
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 transition"
                      >
                        <RefreshCw className="w-4 h-4" /> Review switch · undo
                      </Link>
                    ) : (
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
                    )}
                  </div>
                ) : active ? (
                  <div className="space-y-2.5">
                    {/* Deep-link to whatever admin page configures this add-on.
                        Means owners can jump straight from billing to the
                        relevant settings rather than hunting the sidebar. */}
                    {ADDON_SETTINGS_PATH[a.slug] && (
                      <Link
                        href={ADDON_SETTINGS_PATH[a.slug].href}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {ADDON_SETTINGS_PATH[a.slug].label}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {/* Marketplace-specific: surface the active plan + a
                        Switch link. A RestaurantAddOn row in "active" state
                        means they're on the Monthly $199.99/mo plan — PAYG
                        doesn't create a row (it bills via the settlement
                        cron, no Stripe sub). */}
                    {a.slug === "marketplace" && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs text-emerald-900">
                          <strong>Currently on: Monthly plan</strong> · $199.99/mo · unlimited orders
                        </div>
                        <Link
                          href="/admin/marketplace/payg-opt-in"
                          className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                        >
                          Switch to Pay-As-You-Go →
                        </Link>
                      </div>
                    )}
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
                  </div>
                ) : a.comingSoon ? (
                  // Coming-soon: no subscribe path at all. Show a
                  // friendly "we're building it" message + a disabled
                  // teaser button. Restaurants can't accidentally try
                  // to pay for vapor.
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled
                      className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-amber-100 text-amber-600 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Rocket className="w-3.5 h-3.5" />
                      In development
                    </button>
                    <p className="text-[11px] text-gray-500 leading-snug text-center">
                      We&apos;re building this. You&apos;ll see it here as
                      soon as it&apos;s ready to subscribe to.
                    </p>
                  </div>
                ) : includedNote ? (
                  // Redundant subscribe: feature already bundled with
                  // another active add-on. Surfaced "Already included"
                  // with explanatory caption so the owner doesn't
                  // accidentally pay for a duplicate.
                  <div className="space-y-2">
                    <div className="w-full px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Already included
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-snug text-center">
                      {includedNote}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Pre-cancellation nudge on the Driver Pool tile when
                        Marketplace Monthly is scheduled to switch to PAYG.
                        Without this banner the owner sees a normal blue
                        Subscribe button and could easily miss that their
                        bundled access is about to end. */}
                    {driverPoolEndingWithMarketplace && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900">
                        <div className="font-semibold flex items-center gap-1.5 mb-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          Bundled access ending
                        </div>
                        <span>
                          Marketplace is switching to Pay-As-You-Go
                          {marketplaceSwitchEnd && (
                            <>
                              {" "}on{" "}
                              <strong>
                                {marketplaceSwitchEnd.toLocaleDateString(undefined, {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </strong>
                            </>
                          )}
                          . PAYG does <strong>not</strong> include the Driver Pool — subscribe
                          here before the switch date to keep ShipDay dispatch (and to keep
                          fulfilling Marketplace orders, which require drivers).
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => subscribe(a.slug)}
                      disabled={busy || notSynced || a.monthlyPriceCents <= 0}
                      className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      title={
                        notSynced
                          ? "This add-on isn't synced to Stripe yet. Ask the platform admin."
                          : a.monthlyPriceCents <= 0
                          ? "No price set yet"
                          : ""
                      }
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      {notSynced || a.monthlyPriceCents <= 0
                        ? "Coming soon"
                        : busy
                          ? "Loading…"
                          : a.slug === "marketplace"
                            ? "Subscribe to Monthly ($199.99/mo)"
                            : "Subscribe"}
                    </button>
                    {/* The Marketplace add-on has a SECOND signup path —
                        Pay-As-You-Go ($3/order, capped at $249.99/month,
                        no subscription). Make it visible right under
                        the Monthly subscribe button so owners see the
                        choice without having to hunt for it. */}
                    {a.slug === "marketplace" && !notSynced && (
                      <>
                        <Link
                          href="/admin/marketplace/payg-opt-in"
                          className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-white text-emerald-600 border border-emerald-300 hover:bg-emerald-50 flex items-center justify-center gap-1.5 transition"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Or start Pay-As-You-Go
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <p className="text-[11px] text-gray-600 leading-snug bg-blue-50 border border-blue-100 rounded px-2 py-1.5">
                          💡 <strong>Tip:</strong> Start with Pay-As-You-Go until
                          you&apos;re consistently getting 60–70 marketplace
                          orders/month. Above that volume Monthly saves money.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          });
        })()}
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

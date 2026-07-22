"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, AlertCircle, X, Clock, RefreshCw, ArrowRight, Settings, Rocket } from "lucide-react";
import { localizedAddOnName, localizedAddOnDescription } from "@/lib/addon-catalog-i18n";

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
// `labelKey` is a FULL (root-relative) i18n key resolved at render time via
// the root useTranslations() hook — these constants live outside the
// component so they can't call t() inline. `marketplace` deliberately reuses
// the existing admin.billing.manageMarketplaceListing key (no duplicate).
const ADDON_SETTINGS_PATH: Record<string, { href: string; labelKey: string }> = {
  hosted_website:           { href: "/admin/website/editor",      labelKey: "admin.addOns.settingsLinks.hostedWebsite" },
  online_payments:          { href: "/admin/payments/providers",  labelKey: "admin.addOns.settingsLinks.onlinePayments" },
  marketplace:              { href: "/admin/marketplace",         labelKey: "admin.billing.manageMarketplaceListing" },
  driver_pool:              { href: "/admin/delivery/pool",       labelKey: "admin.addOns.settingsLinks.driverPool" },
  multi_location:           { href: "/admin/locations",           labelKey: "admin.addOns.settingsLinks.multiLocation" },
  custom_domain:            { href: "/admin/website/domain",      labelKey: "admin.addOns.settingsLinks.customDomain" },
  advanced_promo_marketing: { href: "/admin/promotions",          labelKey: "admin.addOns.settingsLinks.advancedPromoMarketing" },
  reservation_deposits:     { href: "/admin/reservations",        labelKey: "admin.addOns.settingsLinks.reservationDeposits" },
  branded_mobile_app:       { href: "/admin/publishing",          labelKey: "admin.addOns.settingsLinks.brandedMobileApp" },
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
    /** Free partner period: active-looking but UNBILLED — switches off at
     *  trialEndsAt unless the owner subscribes. Card must not say "renews". */
    isComplimentary?: boolean;
    trialEndsAt?: Date | string | null;
  } | null;
};

export function AddOnsClient({
  addOns,
}: {
  addOns: AddOnView[];
}) {
  const router = useRouter();
  const t = useTranslations("admin.addOns");
  // Root hook to resolve the full-path labelKey values in ADDON_SETTINGS_PATH
  // (some point into admin.billing, so a namespaced hook can't reach them).
  const tRoot = useTranslations();
  // Localized catalog name/description by slug, DB-English fallback.
  const tCatalog = useTranslations("addOnCatalog");
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
        setError(data?.error || t("errorCheckout"));
        setPendingSlug(null);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || t("errorCheckout"));
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
        setError(data?.error || t("errorCancel"));
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || t("errorCancel"));
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
        setError(data?.error || t("errorResume"));
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || t("errorResume"));
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
          return addOns.map((a) => {
          const name = localizedAddOnName(tCatalog, a.slug, a.name);
          const description = localizedAddOnDescription(tCatalog, a.slug, a.description);
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
          const includedNote = unlimitedRedundant
            ? t("includedNoteUnlimited")
            : null;

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
                    <h3 className="font-semibold text-gray-900">{name}</h3>
                    {a.comingSoon && !active && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        <Rocket className="w-2.5 h-2.5" />
                        {t("comingSoonBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{description}</p>
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
                    {t("inDevelopmentPricing")}
                  </div>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-gray-900">
                      ${dollars}
                    </span>
                    <span className="text-sm text-gray-500"> {t("perMonth")}</span>
                    {(a.trialDays ?? 0) > 0 && (
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {t("trialDaysBadge", { days: a.trialDays ?? 0 })}
                      </span>
                    )}
                    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">
                      {t("taxNote")}
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
                  // Scheduled-cancellation state: the add-on stays live until
                  // the period ends; "Keep this service" resumes it.
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
                      <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {t("cancellationScheduled")}
                      </div>
                      <div className="text-amber-800 mt-0.5">
                        {periodEnd ? (
                          <>
                            {t("accessEnds")}{" "}
                            <strong>
                              {periodEnd.toLocaleDateString(undefined, {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </strong>
                            . {t("accessEndsUntilThen")}
                          </>
                        ) : (
                          t("accessEndsAtPeriodEnd")
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
                        <><Loader2 className="w-4 h-4 animate-spin" /> {t("restoring")}</>
                      ) : (
                        <><RefreshCw className="w-4 h-4" /> {t("keepThisService")}</>
                      )}
                    </button>
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
                        {tRoot(ADDON_SETTINGS_PATH[a.slug].labelKey as any)}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {a.subscription?.isComplimentary ? (
                      /* Free partner period: this row is comped and UNBILLED —
                         the cron switches it off at trialEndsAt. Saying
                         "Renews automatically" here misled Luigi into thinking
                         he was subscribed (2026-07-11). Tell the truth + offer
                         the convert-to-paid checkout (billing starts when the
                         free period ends — see checkout route trial_end). The
                         Cancel button is omitted: the cancel API 404s on rows
                         with no Stripe sub, and a comped service ends on its
                         own anyway. */
                      <div className="space-y-2">
                        <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2.5 text-xs text-sky-900">
                          <div className="font-semibold flex items-center gap-1.5 mb-0.5">
                            <Clock className="w-3.5 h-3.5" />
                            {t("compFreeUntil", {
                              date: a.subscription?.trialEndsAt
                                ? new Date(a.subscription.trialEndsAt).toLocaleDateString(undefined, {
                                    month: "long",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "",
                            })}
                          </div>
                          <span>{t("compExplainer")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => subscribe(a.slug)}
                          disabled={busy || notSynced || a.monthlyPriceCents <= 0}
                          className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          title={
                            notSynced
                              ? t("titleNotSynced")
                              : a.monthlyPriceCents <= 0
                              ? t("titleNoPrice")
                              : ""
                          }
                        >
                          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                          {busy ? t("loading") : t("compSubscribeCta")}
                        </button>
                      </div>
                    ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">
                        {periodEnd
                          ? t("renewsOn", { date: periodEnd.toLocaleDateString() })
                          : t("renewsAutomatically")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCancelConfirm(a)}
                        disabled={busy}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {busy ? t("working") : t("cancel")}
                      </button>
                    </div>
                    )}
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
                      {t("inDevelopment")}
                    </button>
                    <p className="text-[11px] text-gray-500 leading-snug text-center">
                      {t("inDevelopmentDesc")}
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
                      {t("alreadyIncluded")}
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-snug text-center">
                      {includedNote}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => subscribe(a.slug)}
                      disabled={busy || notSynced || a.monthlyPriceCents <= 0}
                      className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      title={
                        notSynced
                          ? t("titleNotSynced")
                          : a.monthlyPriceCents <= 0
                          ? t("titleNoPrice")
                          : ""
                      }
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      {notSynced || a.monthlyPriceCents <= 0
                        ? t("comingSoon")
                        : busy
                          ? t("loading")
                          : t("subscribe")}
                    </button>
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
  const t = useTranslations("admin.addOns");
  const tCatalog = useTranslations("addOnCatalog");
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
              <h3 className="font-bold text-gray-900">{t("modalCancelTitle", { name: localizedAddOnName(tCatalog, addOn.slug, addOn.name) })}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 text-sm text-gray-700 leading-relaxed">
          <p>
            {t("modalKeepAccessUntil")}
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
              " " + t("modalEndOfBillingPeriod")
            )}
            . {t("modalAfterThatOff")}
          </p>
          {addOn.enabledFeatures.length > 0 && (
            <ul className="mt-3 space-y-1">
              {addOn.enabledFeatures.map((f) => (
                <li key={f} className="text-xs text-gray-600 flex items-center gap-1.5">
                  <X className="w-3 h-3 text-red-400" />
                  <code className="font-mono">{f}</code> {t("willBeLocked")}
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
            {t("dontCancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 transition"
          >
            {t("yesCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

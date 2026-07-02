"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TrackingScripts } from "./TrackingScripts";

/**
 * Consent gate in front of the restaurant-configured GA4 / Meta Pixel on the
 * customer ordering page (launch Blocker #5). Before this, TrackingScripts
 * loaded unconditionally — gtag + fbq fired on first paint with no consent,
 * while the Privacy Policy claimed no such tracking ran.
 *
 * Region-gated: in the EU/EEA/UK/Switzerland (ePrivacy/GDPR — prior opt-in
 * required) — or when the restaurant's country is unknown (privacy-safe
 * default) — the scripts stay OFF until the visitor accepts the banner. In
 * opt-out jurisdictions (CA/US/…) the scripts load as before; §7 of the
 * Privacy Policy now discloses them.
 *
 * The choice persists per restaurant in localStorage; "decline" hides the
 * banner and never loads the scripts for that store. Banner colors follow
 * theme.primaryColor per the customer-page theme rule.
 */
const CONSENT_REQUIRED_COUNTRIES = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA + UK + CH
  "IS", "LI", "NO", "GB", "UK", "CH",
]);

export function TrackingConsentGate({
  facebookPixelId,
  googleAnalyticsId,
  restaurantId,
  country,
  primaryColor,
}: {
  facebookPixelId?: string | null;
  googleAnalyticsId?: string | null;
  restaurantId: string;
  country?: string | null;
  primaryColor?: string | null;
}) {
  const t = useTranslations("ordering.consent");
  const hasTrackers = !!(facebookPixelId || googleAnalyticsId);
  const cc = (country || "").trim().toUpperCase();
  // Unknown country → gate (privacy-safe default); live stores carry ISO codes.
  const requiresConsent = !cc || CONSENT_REQUIRED_COUNTRIES.has(cc);
  const storageKey = `ff-tracking-consent:${restaurantId}`;

  // null = undecided (banner shows); read from localStorage after mount so
  // SSR/hydration stay deterministic.
  const [consent, setConsent] = useState<"granted" | "denied" | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === "granted" || v === "denied") setConsent(v);
    } catch { /* storage blocked — stay undecided (scripts stay off) */ }
    setLoaded(true);
  }, [storageKey]);

  if (!hasTrackers) return null;
  if (!requiresConsent) {
    return <TrackingScripts facebookPixelId={facebookPixelId} googleAnalyticsId={googleAnalyticsId} />;
  }

  const choose = (v: "granted" | "denied") => {
    try { window.localStorage.setItem(storageKey, v); } catch { /* non-fatal */ }
    setConsent(v);
  };

  return (
    <>
      {consent === "granted" && (
        <TrackingScripts facebookPixelId={facebookPixelId} googleAnalyticsId={googleAnalyticsId} />
      )}
      {loaded && consent === null && (
        <div
          role="dialog"
          aria-live="polite"
          className="fixed bottom-0 inset-x-0 z-[95] p-3 sm:p-4"
        >
          <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white shadow-xl p-4 sm:p-5">
            <p className="text-sm text-gray-700 leading-relaxed">{t("message")}</p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => choose("denied")}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
              >
                {t("decline")}
              </button>
              <button
                type="button"
                onClick={() => choose("granted")}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: primaryColor || "#111827" }}
              >
                {t("accept")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, Loader2, Building2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";
import { COUNTRIES } from "@/lib/regions";
// Type-only — keeps prisma (pulled in by the resolver) out of the client bundle.
import type { ResellerBranding } from "@/lib/reseller-branding";

export interface InviteContext {
  token: string;
  brandName: string;
  suggestedName: string | null;
  suggestedEmail: string | null;
  expired: boolean;
  used: boolean;
}

/** Read the reseller referral code that was persisted to a cookie on a prior
 *  /signup?ref= visit — so attribution survives if the owner navigates away
 *  and returns to /signup without the query string. */
function readRefCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)feefree_ref=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Read the import-to-try claim token persisted on a prior /signup?claim= visit
 *  (mirrors feefree_ref) so claiming survives navigating away and back. */
function readClaimCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)feefree_claim=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export interface ClaimContext {
  token: string;
  suggestedName: string | null;
  expired: boolean;
  used: boolean;
}

export function SignupForm({
  locale,
  inviteContext,
  refCode,
  claimContext,
  branding = null,
  brandedReferralCode = null,
}: {
  locale: string;
  inviteContext: InviteContext | null;
  /** Reseller referral code from ?ref= on the signup URL (if any). */
  refCode?: string | null;
  /** Import-to-try claim context from ?claim= on the signup URL (if any). */
  claimContext?: ClaimContext | null;
  /** Reseller-branded chrome (logo + title + brand colors), resolved server-side
   *  from the ?reseller= the proxy sets on a branded host. Null on the canonical
   *  platform domain — falls back to the default Fee Free Ordering chrome. */
  branding?: ResellerBranding | null;
  /** The reseller's referralCode (server-resolved) when signing up on a branded
   *  host. We persist it to the feefree_ref cookie AND send it in the register
   *  POST body so a host-derived signup attributes identically to a ?ref= link. */
  brandedReferralCode?: string | null;
}) {
  const t = useTranslations("marketing.signup");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // The brand's primary color skins the primary button + key accents. Emerald
  // (#10b981) is the platform fallback when no reseller / no color is set.
  const EMERALD = "#10b981";
  const brandColor = branding?.primaryColor || EMERALD;
  // Accent (secondary brand tone) — the "signing up under" banner + the sign-in link.
  // Falls back to the primary color, then to the default emerald.
  const brandAccent = branding?.accentColor || brandColor;
  // The display name for the "signing up under X" banner + logo alt text.
  const brandName = branding?.title || branding?.companyName || null;
  // Attribution code: prefer the host-derived reseller code, else the ?ref= URL
  // value. Used for BOTH the cookie write and the register POST body below.
  const effectiveRef = brandedReferralCode || refCode || null;

  // Persist the referral code to a SESSION cookie the moment the owner lands on
  // /signup?ref=<code> OR on a reseller's branded host (?reseller= → resolved
  // referralCode). Session-scoped (no max-age) so attribution survives them
  // wandering off and coming back to a bare /signup WITHIN THE SAME VISIT, but
  // does NOT linger. The old 30-day cookie meant a stale reseller-link click
  // (e.g. from testing) wrongly credited a later genuinely-DIRECT signup to that
  // reseller — Luigi hit exactly this (a direct signup showed "your partner is
  // PISU MARKETING"). Luigi 2026-07-01: shortened 30 days → session.
  // /api/auth/register reads the same feefree_ref cookie as a fallback, and the
  // submit below ALSO sends it in the body (works even with cookies disabled).
  // Branded-host code takes precedence over a stray ?ref=.
  // Fabrizio 2026-06-16; branded-host attribution Luigi 2026-06-23.
  useEffect(() => {
    if (effectiveRef && typeof document !== "undefined") {
      document.cookie = `feefree_ref=${encodeURIComponent(effectiveRef)}; path=/; samesite=lax`;
    }
  }, [effectiveRef]);

  // Same idea for the import-to-try claim token — persist it so claiming survives
  // a wander-off-and-back, and /api/auth/register reads it from the body below
  // (with this cookie as a fallback). 24h, matching the sandbox lifetime.
  useEffect(() => {
    if (claimContext?.token && typeof document !== "undefined") {
      document.cookie = `feefree_claim=${encodeURIComponent(claimContext.token)}; path=/; max-age=${60 * 60 * 24}; samesite=lax`;
    }
  }, [claimContext?.token]);

  // Pre-fill restaurant name + email from the invite (if any). The brand
  // owner suggested these when generating the invite; the recipient can edit.
  // Address + cuisine fields are new (Phase: better-onboarding-signup) so the
  // restaurant lands in /admin with Setup Wizard already at 30%+ complete —
  // not 0% with everything to fill in. Same data either way; just front-
  // loaded into the signup form so it gets done before the wizard guilt-
  // trips them on every page.
  const [form, setForm] = useState({
    restaurantName: inviteContext?.suggestedName ?? claimContext?.suggestedName ?? "",
    ownerName: "",
    email: inviteContext?.suggestedEmail ?? "",
    password: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "CA",
    cuisineType: "",
  });

  const inviteBlocked = inviteContext && (inviteContext.expired || inviteContext.used);
  const claimBlocked = claimContext && (claimContext.expired || claimContext.used);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.restaurantName || !form.email || !form.password) {
      toast.error(t("errorGeneric"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Pass the invite token through so the register route can link the
          // new Restaurant to the inviting brand via parentRestaurantId.
          invite: inviteContext?.token,
          // Forward the reseller referral code so the new restaurant is
          // attributed to the reseller. Priority: host-derived branded code →
          // ?ref= URL value → feefree_ref cookie. A branded-host signup thus
          // attributes identically to a ?ref= referral (the register route
          // maps referralCode → resellerProfileId, approved resellers only).
          ref: effectiveRef || readRefCookie(),
          // Import-to-try: claim token attaches the pre-imported sandbox restaurant
          // to this new account (URL value, cookie fallback). Register reuses it.
          claim: claimContext?.token || readClaimCookie(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorGeneric"));
      // Auto-sign-in so the owner lands straight in their setup wizard instead of being
      // bounced to /login to retype the same credentials they just chose. Login doesn't
      // require email verification (that only gates PUBLISHING), so this is safe. If
      // sign-in ever hiccups, fall back to the login page with the success flag so they
      // can still get in. Luigi 2026-06-23.
      const signInRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (signInRes?.ok && !signInRes.error) {
        router.push("/admin");
      } else {
        router.push("/login?registered=1");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Food-hero background — matches the login page. Reseller's image when branded, else the
          default FeeFree photo (wide for desktop + portrait for phones). */}
      {branding?.backgroundUrl ? (
        <img src={branding.backgroundUrl} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      ) : (
        <>
          <img src="/marketing/login-bg.jpg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 hidden h-full w-full object-cover sm:block" />
          <img src="/marketing/login-bg-mobile.jpg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover sm:hidden" />
        </>
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/25" />
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 my-8">
        <div className="text-center mb-6">
          {/* Header: reseller-branded (logo + title/companyName) when /signup is
              served on a reseller's branded host (?reseller= → server-resolved
              branding), otherwise the default Fee Free Ordering chrome. Mirrors
              LoginForm's skin block so login + signup look identical. */}
          {branding ? (
            <div className="inline-flex flex-col items-center gap-2 mb-4">
              {branding.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt={brandName ?? "Partner logo"}
                  className="max-h-12 max-w-[200px] object-contain"
                />
              )}
              {brandName && (
                <span className="text-gray-700 font-bold text-xl text-center">{brandName}</span>
              )}
            </div>
          ) : (
            <Link href="/" className="inline-flex items-center gap-2 text-emerald-500 font-bold text-xl mb-4">
              <ChefHat className="w-8 h-8" /> Fee Free Ordering
            </Link>
          )}
          {/* "You're signing up under {brand}" context banner — only on a
              branded host, so the owner knows which partner they're joining.
              Themed with the brand's primary color (light tint + accent). */}
          {branding && brandName && (
            <div
              className="rounded-xl p-3 mb-4 text-left"
              style={{ backgroundColor: `${brandAccent}14`, border: `1px solid ${brandAccent}33` }}
            >
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: brandAccent }} />
                <div className="text-xs leading-snug" style={{ color: brandAccent }}>
                  {tAuth("signingUpUnder", { brand: brandName })}
                </div>
              </div>
            </div>
          )}
          {inviteContext && !inviteBlocked && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-snug">
                  Setting up a new location under{" "}
                  <strong>{inviteContext.brandName}</strong>. You'll get your own login,
                  menu, orders, and payments — separate from {inviteContext.brandName} HQ.
                </div>
              </div>
            </div>
          )}
          {inviteBlocked && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 leading-snug">
                  {inviteContext.used
                    ? "This invite link has already been used. Ask the brand owner for a fresh link."
                    : "This invite link has expired. Ask the brand owner for a fresh link."}
                </div>
              </div>
            </div>
          )}
          {claimContext && !claimBlocked && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-snug">
                  You&apos;re claiming your imported menu
                  {claimContext.suggestedName ? <> — <strong>{claimContext.suggestedName}</strong></> : null}. Create your free
                  account and it goes live as your own restaurant — no re-import.
                </div>
              </div>
            </div>
          )}
          {claimBlocked && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 leading-snug">
                  {claimContext!.used
                    ? "This preview was already claimed. Sign up to create a fresh restaurant, or import your menu again."
                    : "This preview expired. Import your GloriaFood menu again to start a fresh preview."}
                </div>
              </div>
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            {inviteContext && !inviteBlocked
              ? `Set up ${inviteContext.suggestedName ?? "your location"}`
              : claimContext && !claimBlocked
                ? "Claim your restaurant"
                : t("title")}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ─── Your account ─────────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Your account
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("yourName")}</label>
                <input
                  type="text"
                  disabled={!!inviteBlocked}
                  placeholder="Mario Rossi"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("email")} *</label>
                <input
                  type="email"
                  required
                  disabled={!!inviteBlocked}
                  placeholder="you@yourrestaurant.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("password")} *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  disabled={!!inviteBlocked}
                  placeholder="At least 8 characters"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ─── Your restaurant ──────────────────────────────────── */}
          <div className="pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Your restaurant
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {inviteContext ? "Location name" : t("restaurantName")} *
                </label>
                <input
                  type="text"
                  required
                  disabled={!!inviteBlocked}
                  placeholder="Mario's Pizzeria"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  value={form.restaurantName}
                  onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    disabled={!!inviteBlocked}
                    placeholder="+1 (555) 555-1234"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuisine</label>
                  <input
                    type="text"
                    list="cuisine-options"
                    disabled={!!inviteBlocked}
                    placeholder="e.g. Italian"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                    value={form.cuisineType}
                    onChange={(e) => setForm({ ...form, cuisineType: e.target.value })}
                  />
                  <datalist id="cuisine-options">
                    <option value="Italian" />
                    <option value="Pizza" />
                    <option value="Chinese" />
                    <option value="Indian" />
                    <option value="Mexican" />
                    <option value="Thai" />
                    <option value="Japanese" />
                    <option value="Sushi" />
                    <option value="American" />
                    <option value="Mediterranean" />
                    <option value="Lebanese" />
                    <option value="Greek" />
                    <option value="Vietnamese" />
                    <option value="Korean" />
                    <option value="Burgers" />
                    <option value="Sandwiches" />
                    <option value="Salads" />
                    <option value="Bakery" />
                    <option value="Cafe" />
                    <option value="Breakfast" />
                    <option value="Seafood" />
                    <option value="Steakhouse" />
                    <option value="BBQ" />
                    <option value="Vegetarian / Vegan" />
                    <option value="Other" />
                  </datalist>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Address ──────────────────────────────────────────── */}
          <div className="pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Restaurant address
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
                <input
                  type="text"
                  disabled={!!inviteBlocked}
                  placeholder="123 Main Street"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    disabled={!!inviteBlocked}
                    placeholder="Milton"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State / Province</label>
                  <input
                    type="text"
                    disabled={!!inviteBlocked}
                    placeholder="ON"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP / Postal code</label>
                  <input
                    type="text"
                    disabled={!!inviteBlocked}
                    placeholder="L9T 2H6"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                    value={form.zip}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <select
                    disabled={!!inviteBlocked}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 bg-white"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!inviteBlocked}
            // Brand-colored on a reseller host (inline style so any hex works);
            // the emerald Tailwind classes are the platform fallback when no
            // branding color is set (branding null → brandColor === EMERALD).
            className={`w-full text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2 ${
              branding?.primaryColor ? "" : "bg-emerald-500 hover:bg-emerald-600"
            }`}
            style={branding?.primaryColor ? { backgroundColor: brandColor } : undefined}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? t("creating") : t("createAccount")}
          </button>
          <p className="text-[11px] text-gray-500 text-center leading-snug">
            Free forever. No credit card required.
            You can edit any of this later in your admin panel.
          </p>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          {t("hasAccount")}{" "}
          <Link
            href="/login"
            // On a branded host the sign-in link adopts the partner's primary
            // color (inline) so the login↔signup pair stays on-brand; emerald
            // fallback otherwise.
            className={`font-medium hover:underline ${branding?.primaryColor || branding?.accentColor ? "" : "text-emerald-500"}`}
            style={branding?.primaryColor || branding?.accentColor ? { color: brandAccent } : undefined}
          >
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}

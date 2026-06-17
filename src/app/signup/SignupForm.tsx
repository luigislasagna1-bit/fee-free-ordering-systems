"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, Loader2, Building2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";
import { COUNTRIES } from "@/lib/regions";

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

export function SignupForm({
  locale,
  inviteContext,
  refCode,
}: {
  locale: string;
  inviteContext: InviteContext | null;
  /** Reseller referral code from ?ref= on the signup URL (if any). */
  refCode?: string | null;
}) {
  const t = useTranslations("marketing.signup");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Persist the referral code to a 30-day cookie the moment the owner lands on
  // /signup?ref=<code>. Two reasons: (1) attribution survives if they wander
  // off and come back to a bare /signup, and (2) /api/auth/register reads the
  // same feefree_ref cookie as a fallback. The submit below ALSO sends it in
  // the body, so attribution works even with cookies disabled. Fabrizio 2026-06-16.
  useEffect(() => {
    if (refCode && typeof document !== "undefined") {
      document.cookie = `feefree_ref=${encodeURIComponent(refCode)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    }
  }, [refCode]);

  // Pre-fill restaurant name + email from the invite (if any). The brand
  // owner suggested these when generating the invite; the recipient can edit.
  // Address + cuisine fields are new (Phase: better-onboarding-signup) so the
  // restaurant lands in /admin with Setup Wizard already at 30%+ complete —
  // not 0% with everything to fill in. Same data either way; just front-
  // loaded into the signup form so it gets done before the wizard guilt-
  // trips them on every page.
  const [form, setForm] = useState({
    restaurantName: inviteContext?.suggestedName ?? "",
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
          // Forward the reseller referral code (from the URL, falling back to
          // the cookie) so the new restaurant is attributed to the reseller.
          ref: refCode || readRefCookie(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorGeneric"));
      setTimeout(() => router.push("/login?registered=1"), 1500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4 relative">
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 my-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-emerald-500 font-bold text-xl mb-4">
            <ChefHat className="w-8 h-8" /> Fee Free Ordering
          </Link>
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
          <h1 className="text-2xl font-bold text-gray-900">
            {inviteContext && !inviteBlocked
              ? `Set up ${inviteContext.suggestedName ?? "your location"}`
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
            className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
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
          <Link href="/login" className="text-emerald-500 font-medium hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}

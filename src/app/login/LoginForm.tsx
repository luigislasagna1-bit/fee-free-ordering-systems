"use client";
import { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Loader2, ChefHat } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";
import type { ResellerBranding } from "@/lib/reseller-branding";

// Sentinel that mirrors RESELLER_SCOPE_ERROR from src/lib/auth.ts. Kept
// here as a string literal so the client doesn't import server-only
// modules. If you change one, change both.
const RESELLER_SCOPE_ERROR = "reseller-scope-mismatch";

function LoginFormInner({
  locale,
  branding,
  resellerScopeId,
  referralCode,
}: {
  locale: string;
  branding: ResellerBranding | null;
  // Non-null when sign-in is happening on a reseller's branded domain
  // (resolved server-side from the ?reseller= query param the proxy
  // sets). We pass it into NextAuth's credentials so the authorize()
  // hook can enforce that only users belonging to this reseller's
  // scope (their own admin / their restaurants / their staff) can
  // authenticate here.
  resellerScopeId: string | null;
  // ResellerProfile.referralCode for this branded host (resolved server-side).
  // Currently unused directly — the reseller-aware "Sign up" link routes by
  // resellerScopeId (the branded /signup re-resolves + attributes by id).
  // Kept on the prop contract so the branded signup wiring has it available.
  referralCode?: string | null;
}) {
  const tAuth = useTranslations("auth");
  const tToasts = useTranslations("admin.toasts");
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  // Brand color theming: when the reseller set a primary color, apply it inline
  // to the most visible elements (primary sign-in button + key accent links),
  // falling back to the platform emerald (handled by the existing Tailwind
  // classes) when null. We only override the most prominent surfaces — the
  // remaining emerald utility classes stay as a sensible neutral fallback.
  const brandPrimary = branding?.primaryColor ?? null;
  // Accent = the secondary brand tone for the secondary links (forgot password, sign-up).
  // Falls back to the primary color, then to the default emerald, so it's always sensible.
  const brandAccent = branding?.accentColor ?? brandPrimary;
  // Reseller-aware "Sign up" link: on a branded host, route to the branded
  // signup carrying the reseller id so the proxy + branded /signup skin it and
  // attribute the new restaurant to this reseller. Bare /signup otherwise.
  const signupHref = resellerScopeId
    ? `/signup?reseller=${encodeURIComponent(resellerScopeId)}`
    : "/signup";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // BEFORE signing in, nuke any stale session/impersonation cookies the
      // browser might still be holding from a previous login. Otherwise
      // getSessionUser() can pick up the wrong session candidate when both
      // are present (we hit this 2026-05-22: stale superadmin cookie kept
      // bouncing a fresh restaurant_admin login back to /superadmin).
      // Best-effort — if this 500s for any reason, proceed anyway; the new
      // session cookie should still overwrite the old one on most browsers.
      await fetch("/api/auth/clear-session", { method: "POST" }).catch(() => {});
      // First check credentials with redirect:false so we can show inline
      // errors. If valid, do a full-page navigation to /admin — this is more
      // reliable than router.push() across mobile browsers (especially iOS
      // Safari) because it forces a fresh request that picks up the freshly
      // set HttpOnly session cookie.
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        // Pass the scope id when present so the server can enforce
        // reseller-scoped login. When null/empty, no scope is enforced
        // (canonical platform-domain sign-in).
        ...(resellerScopeId ? { resellerProfileId: resellerScopeId } : {}),
        redirect: false,
      });
      if (!result || result.error) {
        // The sentinel returned by authorize() arrives in result.error as
        // the literal string we threw. Detect it so we can show a
        // scope-specific message instead of the generic creds error —
        // "this is X's sign-in" is far less confusing than "wrong
        // password" when the issue is actually wrong portal.
        if (result?.error === RESELLER_SCOPE_ERROR) {
          const brandName =
            branding?.companyName ?? branding?.title ?? tAuth("thisPartner");
          throw new Error(tAuth("resellerScopeError", { brandName }));
        }
        throw new Error(tAuth("invalidCredentials"));
      }
      toast.success(tToasts("saved"));
      // Route by role. Pending/approved resellers go to /reseller (the layout +
      // page handle holding vs dashboard). Superadmins land on the superadmin
      // area. Everyone else (restaurant_admin, kitchen_staff) goes to /admin
      // where the layout sorts them out. Hard navigation so the freshly-set
      // session cookie is picked up by the server render of the destination.
      const session = await getSession();
      const role = (session?.user as any)?.role;
      const dest =
        role === "superadmin" ? "/superadmin"
        : role === "reseller_partner" || role === "pending_reseller" ? "/reseller"
        : "/admin";
      window.location.assign(dest);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Food-hero background: the reseller's uploaded image when branded, else the default
          FeeFree photo (wide for desktop + a portrait crop for phones). `isolate` + -z-10 keep
          it behind the card/switcher without touching their stacking. */}
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          {/* Header: reseller-branded when accessed via a verified Full-tier
              custom domain, default platform branding otherwise. The reseller's
              logo + title come from ResellerProfile (server-resolved via the
              ?reseller= query param the proxy sets on its custom-domain rewrite). */}
          {branding ? (
            <div className="inline-flex flex-col items-center gap-2 mb-5">
              {branding.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName ?? "Partner logo"}
                  className="max-h-12 max-w-[200px] object-contain"
                />
              )}
              <span className="text-gray-700 font-bold text-xl text-center">
                {branding.title ?? branding.companyName ?? ""}
              </span>
            </div>
          ) : (
            <Link href="/" className="inline-flex items-center gap-2 text-emerald-500 font-bold text-xl mb-5">
              <ChefHat className="w-7 h-7" /> Fee Free Ordering
            </Link>
          )}
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 font-semibold px-4 py-1.5 rounded-full text-sm mb-4">
            <LayoutDashboard className="w-4 h-4" /> {tAuth("adminLogin")}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{tAuth("signIn")}</h1>
          <p className="text-gray-500 text-sm mt-1">{tAuth("adminLoginHelp")}</p>
          {params.get("registered") && (
            <div className="mt-3 bg-green-50 text-green-700 text-sm p-3 rounded-lg border border-green-200">
              {tAuth("createAccount")}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tAuth("login")}</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              placeholder="you@restaurant.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">{tAuth("password")}</label>
              <a
                href="/forgot-password"
                className="text-xs text-emerald-600 hover:text-emerald-700"
                style={brandAccent ? { color: brandAccent } : undefined}
              >
                {tAuth("forgotPassword")}
              </a>
            </div>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            style={brandPrimary ? { backgroundColor: brandPrimary } : undefined}
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {loading ? tAuth("signingIn") : tAuth("signIn")}
          </button>
        </form>

        <div className="mt-5 border-t border-gray-100 pt-5 text-center space-y-3">
          <p className="text-gray-500 text-sm">
            {tAuth("dontHaveAccount")}{" "}
            <Link
              href={signupHref}
              className="text-emerald-500 font-medium hover:underline"
              style={brandPrimary ? { color: brandPrimary } : undefined}
            >
              {tAuth("signUp")}
            </Link>
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm text-gray-400">
            <Link
              href="/kitchen/login"
              className="inline-flex items-center gap-1 text-gray-600 font-medium hover:text-emerald-500 transition underline underline-offset-2"
            >
              {tAuth("kitchenLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginForm({
  locale,
  branding = null,
  resellerScopeId = null,
  referralCode = null,
}: {
  locale: string;
  branding?: ResellerBranding | null;
  resellerScopeId?: string | null;
  referralCode?: string | null;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
      <LoginFormInner locale={locale} branding={branding} resellerScopeId={resellerScopeId} referralCode={referralCode} />
    </Suspense>
  );
}

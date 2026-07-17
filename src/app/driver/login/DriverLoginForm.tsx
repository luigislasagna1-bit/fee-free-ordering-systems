"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Bike, Loader2, Store } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";
import { readPrefCookie, setPrefCookie } from "../shared/role-pref";

/**
 * UNIFIED login for the Fee Free Delivery app (v1.1 Phase 1, plan §2.2).
 *
 * ONE email+password form serves both roles. The client CASCADES the attempt
 * across the two independent NextAuth instances — zero auth-config changes:
 *   • DRIVER leg: signIn() on the driver basePath (this /driver tree is wrapped
 *     in the driver-scoped SessionProvider).
 *   • RESTAURANT leg: the manual CSRF+POST pattern DispatchLogout already runs
 *     in production against the admin instance, followed by a `no-store`
 *     session fetch to branch on role.
 *
 * Leg ORDER is device-memory-aware: a device that last used the restaurant
 * shell (ffd-role-pref=restaurant) runs the restaurant leg first, so repeat
 * owner logins never burn driver-scope rate-limit counters from shared
 * restaurant WiFi. `?as=restaurant|driver` pins a single leg (the escape hatch
 * for dual-credential accounts where the first leg would always win).
 *
 * ENUMERATION GUARD: when both legs miss, the toast is byte-identical no
 * matter which table matched nothing (feefreeApp.loginFailed). A rate-limit on
 * either leg shows the shared "too many attempts" copy. There is no
 * "which table is this email in" preflight endpoint, by design.
 */

type LegResult = "ok" | "invalid" | "rate-limited";

function DriverLoginFormInner({ locale }: { locale: string }) {
  const tAuth = useTranslations("auth");
  const t = useTranslations("driver");
  const tApp = useTranslations("feefreeApp");
  const params = useSearchParams();
  // ?as= pins a single leg; anything else means "cascade both".
  const asParam = params.get("as");
  const mode: "both" | "driver" | "restaurant" =
    asParam === "restaurant" ? "restaurant" : asParam === "driver" ? "driver" : "both";
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  /** DRIVER leg — driver-scoped NextAuth via the tree's SessionProvider. */
  async function tryDriver(): Promise<LegResult> {
    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    if (result && !result.error) return "ok";
    return result?.error === "login-rate-limited" ? "rate-limited" : "invalid";
  }

  /** RESTAURANT leg — manual POST against the ADMIN NextAuth instance.
   *  CSRF is fetched fresh IMMEDIATELY before the POST: both instances share
   *  the CSRF cookie and the other leg may have rotated it (load-bearing). */
  async function tryRestaurant(): Promise<LegResult | { dest: string }> {
    const { csrfToken } = await fetch("/api/auth/csrf", { cache: "no-store" }).then((r) => r.json());
    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken,
        email: form.email,
        password: form.password,
        callbackUrl: "/driver",
        json: "true",
      }),
    });
    const data = await res.json().catch(() => ({} as any));
    const urlStr: string = typeof data?.url === "string" ? data.url : "";
    if (!res.ok || urlStr.includes("error=")) {
      return urlStr.includes("login-rate-limited") ? "rate-limited" : "invalid";
    }
    // Fresh session (never cached) tells us WHO signed in — role decides home.
    const session = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    const user = session?.user as { role?: string; restaurantId?: string | null } | undefined;
    if (!user) return "invalid";
    if (user.role === "superadmin" || user.role === "platform_support") return { dest: "/superadmin/drivers" };
    if (user.role === "reseller_partner" || user.role === "pending_reseller") return { dest: "/reseller" };
    if (user.restaurantId) {
      setPrefCookie("restaurant");
      return { dest: "/driver" };
    }
    // Authenticated but no restaurant scope and no known area — safest landing
    // is the admin layout, which sorts residual roles out (never /login: loop rule).
    return { dest: "/admin" };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const legs: ("driver" | "restaurant")[] =
        mode === "driver"
          ? ["driver"]
          : mode === "restaurant"
            ? ["restaurant"]
            : readPrefCookie() === "restaurant"
              ? ["restaurant", "driver"]
              : ["driver", "restaurant"];

      let sawRateLimit = false;
      for (const leg of legs) {
        if (leg === "driver") {
          const r = await tryDriver();
          if (r === "ok") {
            setPrefCookie("driver");
            // Hard navigation so the fresh cookie is read by the server render
            // (soft-nav can race the cookie write on some mobile browsers).
            window.location.assign("/driver");
            return;
          }
          if (r === "rate-limited") sawRateLimit = true;
        } else {
          const r = await tryRestaurant();
          if (typeof r === "object") {
            window.location.assign(r.dest);
            return;
          }
          if (r === "rate-limited") sawRateLimit = true;
        }
      }
      // ONE byte-identical message whichever table missed (enumeration guard);
      // rate-limit gets its own copy so users know to wait, not retype.
      throw new Error(sawRateLimit ? tAuth("tooManyAttempts") : tApp("loginFailed"));
    } catch (err: any) {
      toast.error(err?.message ?? tApp("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen [min-height:100dvh] bg-gray-900 flex items-center justify-center px-4 relative overflow-y-auto"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="w-full max-w-md py-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500 rounded-2xl mb-3 shadow-lg shadow-emerald-500/30">
            {mode === "restaurant" ? <Store className="w-8 h-8 text-white" /> : <Bike className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-white">{t("loginTitle")}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {mode === "restaurant" ? tApp("restaurantModeBadge") : tApp("loginHelpUnified")}
          </p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{tAuth("login")}</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-500 transition"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{tAuth("password")}</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-500 transition"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-600 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2 text-base"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? tAuth("signingIn") : tAuth("signIn")}
            </button>
          </form>
        </div>

        {/* Escape hatch for dual-credential accounts (same email+password in
            both tables → the first leg always wins): pin the OTHER leg via
            ?as=. Low-key by design — the form itself serves both roles. */}
        <div className="mt-5 text-center">
          {mode === "restaurant" ? (
            <Link href="/driver/login?as=driver" className="text-sm text-emerald-400 hover:text-emerald-300 font-medium">
              {tApp("signInAsDriver")}
            </Link>
          ) : (
            <Link href="/driver/login?as=restaurant" className="text-sm text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1.5">
              <Store className="w-4 h-4" /> {tApp("signInAsRestaurant")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function DriverLoginForm({ locale }: { locale: string }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      }
    >
      <DriverLoginFormInner locale={locale} />
    </Suspense>
  );
}

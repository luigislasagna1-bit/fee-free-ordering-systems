"use client";
import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChefHat, Loader2, Monitor, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";
import { getNativeAppVersion } from "@/lib/native-app-version";

function KitchenLoginFormInner({ locale, getAppUrl }: { locale: string; getAppUrl?: string | null }) {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  // App version (e.g. "2.7") shown at the bottom — null in a browser / on a
  // pre-v2.7 app. `undefined` = still checking, so the "get the app" hint
  // can't flash for native users before the bridge answers. A1.
  const [appVersion, setAppVersion] = useState<string | null | undefined>(undefined);
  useEffect(() => { getNativeAppVersion().then(setAppVersion); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Nuke any stale session cookies before authenticating — same
      // reasoning as /login. See src/app/api/auth/clear-session/route.ts.
      await fetch("/api/auth/clear-session", { method: "POST" }).catch(() => {});
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (!result || result.error) throw new Error(tAuth("invalidCredentials"));
      // Hard navigation so the kitchen session cookie is read on the next
      // server render — soft-nav (router.push) can race the cookie write on
      // some mobile browsers (notably iOS Safari over a tunnel).
      window.location.assign("/kitchen");
    } catch (err: any) {
      toast.error(err.message);
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
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Monitor className="w-5 h-5 text-emerald-400" /> {tAuth("kitchenLogin")}
          </h1>
          <p className="text-gray-400 text-sm mt-1">{tAuth("kitchenLoginHelp")}</p>
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
                placeholder="you@restaurant.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-300">{tAuth("password")}</label>
                <a href="/forgot-password" className="text-xs text-emerald-400 hover:text-emerald-300">
                  {tAuth("forgotPassword")}
                </a>
              </div>
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

        {/* "Get the app" — only in a plain browser (native check resolved to
            null), never on the neutral reseller host (getAppUrl null from the
            server), never while the native bridge is still answering. */}
        {getAppUrl && appVersion === null && (
          <a
            href={getAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition"
          >
            <Smartphone className="w-3.5 h-3.5" /> {tAuth("kitchenGetAppHint")}
          </a>
        )}
        {appVersion && (
          <p className="mt-4 text-center text-[11px] text-gray-600">v{appVersion}</p>
        )}
      </div>
    </div>
  );
}

export function KitchenLoginForm({ locale, getAppUrl }: { locale: string; getAppUrl?: string | null }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    }>
      <KitchenLoginFormInner locale={locale} getAppUrl={getAppUrl} />
    </Suspense>
  );
}

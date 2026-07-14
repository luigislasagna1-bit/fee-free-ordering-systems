"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { Bike, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

function DriverLoginFormInner({ locale }: { locale: string }) {
  const tAuth = useTranslations("auth");
  const t = useTranslations("driver");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Clear any stale session cookies before authenticating (same as /kitchen).
      await fetch("/api/auth/clear-session", { method: "POST" }).catch(() => {});
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (!result || result.error) throw new Error(tAuth("invalidCredentials"));
      // Hard navigation so the driver session cookie is read on the next server
      // render (soft-nav can race the cookie write on some mobile browsers).
      window.location.assign("/driver");
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
            <Bike className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t("loginTitle")}</h1>
          <p className="text-gray-400 text-sm mt-1">{t("loginHelp")}</p>
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
                placeholder="you@driver.com"
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

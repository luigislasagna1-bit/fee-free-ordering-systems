"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, Loader2, Monitor, LayoutDashboard } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

function KitchenLoginFormInner({ locale }: { locale: string }) {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative">
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl mb-4 shadow-lg shadow-emerald-500/30">
            <ChefHat className="w-9 h-9 text-white" />
          </div>
          <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 text-emerald-400 font-semibold px-4 py-1.5 rounded-full text-sm mb-3">
            <Monitor className="w-4 h-4" /> {tAuth("kitchenLogin")}
          </div>
          <h1 className="text-3xl font-bold text-white">{tAuth("kitchenLogin")}</h1>
          <p className="text-gray-400 text-sm mt-1">{tAuth("kitchenLoginHelp")}</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-xl">
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

        <div className="mt-5 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            {tAuth("adminLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function KitchenLoginForm({ locale }: { locale: string }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    }>
      <KitchenLoginFormInner locale={locale} />
    </Suspense>
  );
}

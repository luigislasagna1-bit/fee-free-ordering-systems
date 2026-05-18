"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, Loader2, Building2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

export interface InviteContext {
  token: string;
  brandName: string;
  suggestedName: string | null;
  suggestedEmail: string | null;
  expired: boolean;
  used: boolean;
}

export function SignupForm({
  locale,
  inviteContext,
}: {
  locale: string;
  inviteContext: InviteContext | null;
}) {
  const t = useTranslations("marketing.signup");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Pre-fill restaurant name + email from the invite (if any). The brand
  // owner suggested these when generating the invite; the recipient can edit.
  const [form, setForm] = useState({
    restaurantName: inviteContext?.suggestedName ?? "",
    ownerName: "",
    email: inviteContext?.suggestedEmail ?? "",
    password: "",
    phone: "",
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4 relative">
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-orange-500 font-bold text-xl mb-4">
            <ChefHat className="w-8 h-8" /> Fee Free Ordering
          </Link>
          {inviteContext && !inviteBlocked && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 text-left">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-orange-900 leading-snug">
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {inviteContext ? "Location name" : t("restaurantName")} *
            </label>
            <input
              type="text"
              required
              disabled={!!inviteBlocked}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
              value={form.restaurantName}
              onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("yourName")}</label>
            <input
              type="text"
              disabled={!!inviteBlocked}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !!inviteBlocked}
            className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? t("creating") : t("createAccount")}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          {t("hasAccount")}{" "}
          <Link href="/login" className="text-orange-500 font-medium hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}

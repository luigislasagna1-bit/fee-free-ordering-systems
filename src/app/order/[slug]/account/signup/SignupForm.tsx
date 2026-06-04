"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function SignupForm({ slug, restaurantName }: { slug: string; restaurantName: string }) {
  const t = useTranslations("customer.signupForm");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/account/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("signUpFailed"));
        return;
      }
      router.replace(`/order/${slug}/account`);
    } catch {
      setError(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelName")}</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t("placeholderName")}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelEmail")}</label>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t("placeholderEmail")}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelPhone")}</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t("placeholderPhone")}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelPassword")}</label>
        <input
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t("placeholderPassword")}
        />
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("createAccount", { restaurantName })}
      </button>
    </form>
  );
}

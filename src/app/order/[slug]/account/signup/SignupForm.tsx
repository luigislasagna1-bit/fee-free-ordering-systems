"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PasswordInput } from "@/components/PasswordInput";

export function SignupForm({ slug, restaurantName }: { slug: string; restaurantName: string }) {
  const t = useTranslations("customer.signupForm");
  // Reuse the checkout flow's already-translated phone message — the native
  // minLength counts formatting chars, so "+1 (55)" would pass it and hit the
  // server's English-only 400; this check catches it in the user's language.
  const tToast = useTranslations("ordering.toasts");
  // Reuse the checkout consent label — already translated in all 38 locales.
  const tOrdering = useTranslations("ordering");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Marketing consent starts TICKED — opt-in by default, and an explicit
  // untick is the only way to opt out. Without this the account was created at
  // the schema default of FALSE, so every account holder was silently recorded
  // as opted-out, and checkout later pre-filled its own box from that stored
  // false and kept them there. Luigi 2026-07-31.
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", marketingConsent: true });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.phone.replace(/\D/g, "").length < 7) {
      setError(tToast("phoneInvalid"));
      return;
    }
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
          inputMode="tel"
          required
          minLength={7}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+()\-.\s]/g, "") })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t("placeholderPhone")}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelPassword")}</label>
        {/* Shared eye-toggle input (cms0gyexp #6). */}
        <PasswordInput
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full border border-gray-200 rounded-lg ps-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t("placeholderPassword")}
        />
      </div>
      {/* Same wording and shape as the checkout consent box, so the two agree. */}
      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.marketingConsent}
          onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })}
        />
        <span>{tOrdering("marketingConsentLabel")}</span>
      </label>
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

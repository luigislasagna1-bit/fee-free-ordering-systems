"use client";
import { useState } from "react";
import { Loader2, CheckCircle2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Per-restaurant "request reset link" form. POSTs to
 * /api/restaurants/[slug]/account/forgot-password and shows a vague
 * success screen — the API returns ok=true regardless of whether the
 * email is on file (anti-enumeration), so we can't tell the user
 * whether the email matched.
 */
export function ForgotPasswordForm({ slug }: { slug: string }) {
  const t = useTranslations("customer.forgotForm");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/account/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t("somethingWentWrong"));
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-6 text-center space-y-3 py-4">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
        <h2 className="text-lg font-bold text-gray-900">{t("checkYourInbox")}</h2>
        <p className="text-sm text-gray-600">
          {t("resetLinkSent")}
        </p>
        <p className="text-xs text-gray-500 mt-4">
          {t("didntSeeEmail")}{" "}
          <button
            type="button"
            onClick={() => { setSubmitted(false); setEmail(""); }}
            className="text-emerald-600 font-semibold hover:underline"
          >
            {t("tryDifferentEmail")}
          </button>.
        </p>
        <a
          href={`/order/${slug}/account/login`}
          className="block text-sm text-emerald-600 font-semibold hover:underline mt-4"
        >
          {t("backToSignIn")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {t("emailLabel")} <span className="text-red-500">*</span>
        </span>
        <div className="mt-1 relative">
          <Mail className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </label>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting || !email}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm transition flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {t("sending")}</>
        ) : (
          t("sendResetLink")
        )}
      </button>
    </form>
  );
}

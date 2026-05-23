"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> {tAuth("signIn")}
        </Link>

        {submitted ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
            <h1 className="text-xl font-bold text-gray-900">{tAuth("forgotPasswordTitle")}</h1>
            <p className="text-sm text-gray-600">{tAuth("resetLinkSent")}</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{tAuth("forgotPasswordTitle")}</h1>
            <p className="text-sm text-gray-500 mt-1">{tAuth("forgotPasswordHelp")}</p>

            <form onSubmit={submit} className="mt-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tCommon("email")}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {tAuth("sendResetLink")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

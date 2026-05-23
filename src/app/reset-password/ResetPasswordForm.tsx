"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

export function ResetPasswordForm({ locale }: { locale: string }) {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(tAuth("passwordMustMatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tAuth("invalidOrExpiredToken"));
      setDone(true);
      setTimeout(() => router.push("/login"), 2200);
    } catch (e: any) {
      setError(e.message || tAuth("invalidOrExpiredToken"));
    }
    setSubmitting(false);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
        <AuthLanguageSwitcher currentLocale={locale} />
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900">{tAuth("invalidOrExpiredToken")}</h1>
          <Link href="/forgot-password" className="inline-block mt-4 text-sm text-emerald-600 hover:underline">
            {tAuth("forgotPasswordTitle")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
      <AuthLanguageSwitcher currentLocale={locale} />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> {tAuth("signIn")}
        </Link>

        {done ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
            <h1 className="text-xl font-bold text-gray-900">{tAuth("passwordResetSuccess")}</h1>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{tAuth("resetPassword")}</h1>

            <form onSubmit={submit} className="mt-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tAuth("newPassword")}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    autoFocus
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2 top-2.5 p-1 text-gray-400 hover:text-gray-700">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tAuth("confirmPassword")}</label>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !password || !confirm}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {tAuth("resetPassword")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

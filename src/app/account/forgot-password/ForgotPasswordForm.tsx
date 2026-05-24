"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, Mail } from "lucide-react";

/**
 * Customer-side "request a password reset" form. Mirrors the
 * restaurant-owner ForgotPasswordForm at /forgot-password but talks to
 * /api/customer/forgot-password and lives at /account/forgot-password.
 *
 * Privacy posture: the API always returns ok=true regardless of whether
 * the email is on file (anti-enumeration). So the success screen we show
 * is intentionally vague — "if there's an account with this email, we
 * just sent you a link." Don't tell the user whether the email matched.
 */
export function ForgotPasswordForm() {
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
      const res = await fetch("/api/customer/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Something went wrong");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-6 text-center space-y-3 py-4">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
        <h2 className="text-lg font-bold text-gray-900">Check your inbox</h2>
        <p className="text-sm text-gray-600">
          If there&apos;s an account with that email, we just sent a reset link. It&apos;s valid for one hour.
        </p>
        <p className="text-xs text-gray-500 mt-4">
          Didn&apos;t see the email? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => { setSubmitted(false); setEmail(""); }}
            className="text-emerald-600 font-semibold hover:underline"
          >
            try a different email
          </button>
          .
        </p>
        <Link href="/account/login" className="block text-sm text-emerald-600 font-semibold hover:underline mt-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Email <span className="text-red-500">*</span>
        </span>
        <div className="mt-1 relative">
          <Mail className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
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
          <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
        ) : (
          "Send reset link"
        )}
      </button>

      <p className="text-center text-sm text-gray-600 pt-2">
        Remembered it?{" "}
        <Link href="/account/login" className="text-emerald-600 font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

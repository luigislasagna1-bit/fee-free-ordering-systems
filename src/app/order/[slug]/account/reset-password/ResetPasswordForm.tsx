"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Lock } from "lucide-react";

/**
 * New-password form. Submits to
 * /api/restaurants/[slug]/account/reset-password which validates the
 * token, updates passwordHash, burns the token, and signs the user
 * in via the same cookie the login endpoint uses. On success we
 * redirect to /order/[slug]/account so the customer lands on their
 * dashboard already authenticated.
 */
export function ResetPasswordForm({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/account/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Reset failed. Try requesting a new link.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      // Brief delay so the customer registers the success state before
      // we bounce them into the dashboard.
      setTimeout(() => router.replace(`/order/${slug}/account`), 800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mt-6 text-center space-y-3 py-4">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
        <h2 className="text-lg font-bold text-gray-900">Password updated</h2>
        <p className="text-sm text-gray-600">
          Signing you in…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          New password <span className="text-red-500">*</span>
        </span>
        <div className="mt-1 relative">
          <Lock className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
          <input
            type="password"
            required
            autoFocus
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Confirm password <span className="text-red-500">*</span>
        </span>
        <div className="mt-1 relative">
          <Lock className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type the password again"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </label>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting || !password || !confirm}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm transition flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
        ) : (
          "Update password"
        )}
      </button>

      <p className="text-center text-xs text-gray-500 pt-2">
        Reset links expire after one hour. If yours has expired, request a new one from the{" "}
        <a href={`/order/${slug}/account/forgot-password`} className="text-emerald-600 font-semibold hover:underline">
          forgot-password page
        </a>.
      </p>
    </form>
  );
}

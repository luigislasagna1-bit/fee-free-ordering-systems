"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";

/**
 * Customer-side "set a new password" form. Posts to
 * /api/customer/reset-password with { token, password }.
 *
 * After success we don't auto-sign-in (defense-in-depth in case the
 * reset email was intercepted). Show a confirmation + "Sign in" button.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (password !== confirm) {
      setError("The two passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/customer/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not reset password");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-6 text-center space-y-3 py-4">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
        <h2 className="text-lg font-bold text-gray-900">Password updated</h2>
        <p className="text-sm text-gray-600">
          You can now sign in with your new password.
        </p>
        <button
          type="button"
          onClick={() => router.push("/account/login")}
          className="mt-2 inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl text-sm transition"
        >
          Sign in
        </button>
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
          <input
            type={show ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full pl-3 pr-10 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Confirm new password <span className="text-red-500">*</span>
        </span>
        <input
          type={show ? "text" : "password"}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          className="mt-1 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
        />
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

      <p className="text-center text-sm text-gray-600 pt-2">
        <Link href="/account/login" className="text-emerald-600 font-semibold hover:underline">
          Cancel and sign in
        </Link>
      </p>
    </form>
  );
}

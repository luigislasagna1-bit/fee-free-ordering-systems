"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Sticky banner shown above the admin chrome when the logged-in owner
 * hasn't verified their email yet. Lets them resend the verification
 * email with one click.
 *
 * Renders nothing when `verified` is true — the layout passes the user's
 * emailVerifiedAt state down so this stays purely presentational.
 */
export function EmailVerificationBanner({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (verified) return null;

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/verify-email", { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error || "send_failed");
      } else {
        setSent(true);
      }
    } catch (e: any) {
      setError(e?.message || "send_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <p className="text-sm text-amber-900 truncate">
            <span className="font-semibold">Verify your email</span>
            {email && (
              <span className="text-amber-800"> &middot; we sent a link to <strong>{email}</strong></span>
            )}
            <span className="text-amber-800"> &middot; required before you can publish</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sent ? (
            <span className="text-xs font-medium text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Email sent — check your inbox
            </span>
          ) : (
            <>
              {error && <span className="text-xs text-red-700">{error}</span>}
              <button
                type="button"
                onClick={resend}
                disabled={busy}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 flex items-center gap-1"
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {busy ? "Sending…" : "Resend verification email"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

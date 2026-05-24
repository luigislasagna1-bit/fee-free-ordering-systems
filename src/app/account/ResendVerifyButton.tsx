"use client";
import { useState } from "react";
import { Loader2, Send, Check } from "lucide-react";

/**
 * "Resend verification email" button — used inside the not-yet-verified
 * banner on /account. Rate-limited server-side (5 / hour / IP) so we
 * don't need debouncing here, but we DO want optimistic UI so the user
 * sees feedback immediately + can't double-click.
 */
export function ResendVerifyButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function resend() {
    if (state === "sending") return;
    setState("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/customer/verify-email", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data?.error || `Failed (HTTP ${res.status})`);
        setState("error");
        return;
      }
      setState("sent");
      // Reset to idle after 8s so the user can request another resend if
      // the second email also gets stuck in spam.
      setTimeout(() => setState("idle"), 8000);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending" || state === "sent"}
        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
      >
        {state === "sending" && <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>}
        {state === "sent" && <><Check className="w-4 h-4" /> Sent — check your inbox</>}
        {(state === "idle" || state === "error") && <><Send className="w-4 h-4" /> Resend verification email</>}
      </button>
      {state === "error" && errorMsg && (
        <span className="text-xs text-red-700">{errorMsg}</span>
      )}
    </div>
  );
}

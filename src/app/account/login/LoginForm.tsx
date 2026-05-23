"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  /** Optional ?next=... param so /order/:slug?from=marketplace can deep-link
   *  unauthenticated customers through "/account/login?next=..." and bounce
   *  back after sign-in. Restricted to relative paths so this can't be
   *  abused for an open-redirect. */
  const nextRaw = search.get("next");
  const safeNext = nextRaw && nextRaw.startsWith("/") ? nextRaw : "/account";

  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Nuke any stale session cookies before authenticating — same
      // reasoning as /login. See src/app/api/auth/clear-session/route.ts.
      await fetch("/api/auth/clear-session", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Sign-in failed");
        setSubmitting(false);
        return;
      }
      router.push(safeNext);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Email <span className="text-red-500">*</span>
        </span>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="mt-1 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Password <span className="text-red-500">*</span>
        </span>
        <input
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="mt-1 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
        />
      </label>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm transition flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

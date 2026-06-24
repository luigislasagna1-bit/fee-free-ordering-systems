"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, CheckCircle2, Loader2, Trash2, AlertCircle, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Client-side generic-subdomain manager.
 *
 *   1. NOT CLAIMED — input + Save button. Live preview of full hostname.
 *   2. CLAIMED     — green badge + hostname pill + "Test the URL" link +
 *                    "Release" (red) action.
 *
 * Tier gate: if whiteLabelStatus !== "active", we still render the form
 * but the save button is disabled with an inline upsell. We keep the form
 * visible (not just a paywall) so the reseller can pick their slug while
 * they're thinking about subscribing — and so the upsell shows them
 * *exactly* what they'll get.
 */
export interface InitialState {
  subdomain: string | null;
  platformDomain: string;
  tier: "basic" | "full" | null;
  active: boolean;
}

export function GenericDomainClient({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(initial.subdomain);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const slug = input.trim().toLowerCase();
    if (!slug) {
      setError("Pick a subdomain.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reseller/domain/generic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save subdomain");
        return;
      }
      setCurrent(data.subdomain);
      setInput("");
      toast.success("Subdomain claimed");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!confirm(`Release ${current}.${initial.platformDomain}? Your branded login URL will stop working until you claim a new slug.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reseller/domain/generic", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not release subdomain");
        return;
      }
      setCurrent(null);
      toast.success("Subdomain released");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  // Live preview of the final hostname as the reseller types. Strips
  // anything that wouldn't be valid so they see immediate feedback —
  // no waiting on the server round-trip for "that's not allowed."
  const previewSlug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

  if (current) {
    // ── Claimed state ──────────────────────────────────────────────
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3" /> Live
          </div>
          {!initial.active && (
            <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
              <AlertCircle className="w-3 h-3" /> Subscription inactive
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">Your branded login URL</div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="bg-gray-100 px-3 py-2 rounded-lg text-sm font-semibold text-gray-900">
              {current}.{initial.platformDomain}
            </code>
            {initial.active && (
              <a
                href={`https://${current}.${initial.platformDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </a>
            )}
          </div>
        </div>

        {!initial.active && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            Your white-label subscription is inactive — this URL won&apos;t resolve until you{" "}
            <a href="/reseller/branding" className="font-bold underline">resubscribe</a>.
            Your claim on <code className="bg-white/70 px-1 rounded">{current}</code> is preserved.
          </div>
        )}

        <button
          onClick={release}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Release subdomain
        </button>
      </div>
    );
  }

  // ── Unclaimed state ────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="mb-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
          Pick your subdomain
        </label>
        <div className="flex items-stretch gap-0 rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-emerald-500 overflow-hidden">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="acme"
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="flex-1 px-3 py-2.5 text-sm focus:outline-none disabled:bg-gray-50 font-mono"
          />
          <div className="bg-gray-50 px-3 py-2.5 text-sm text-gray-500 border-l border-gray-300 font-mono">
            .{initial.platformDomain}
          </div>
        </div>
        {previewSlug && previewSlug !== input && (
          <p className="text-xs text-gray-500 mt-1.5">
            Will be saved as <code className="bg-gray-100 px-1 rounded font-semibold">{previewSlug}</code> (sanitized).
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>

      {/* Upsell when not subscribed */}
      {!initial.active && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Need the Branded plan ($19.99/mo).</strong> The generic subdomain is part of
          the Branded plan. Subscribe at{" "}
          <a href="/reseller/branding" className="font-bold underline">/reseller/branding</a> to claim a slug.
        </div>
      )}

      <button
        onClick={save}
        disabled={busy || !input.trim() || !initial.active}
        className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
        Claim subdomain
      </button>
    </div>
  );
}

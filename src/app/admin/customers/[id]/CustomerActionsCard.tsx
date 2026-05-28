"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Mail, StickyNote, Check } from "lucide-react";

/**
 * Combined "actions for this customer" card on the customer detail page.
 *
 * Two pieces today:
 *
 *   1. Quick-email button — opens mailto: in the owner's email client
 *      with a pre-filled subject. Lowest-friction way for the owner
 *      to reach out about a recent order, a complaint, or just to say
 *      hi. No in-app messaging required.
 *
 *   2. Internal notes — restaurant-side memo for this customer.
 *      Never shown to the customer; only the owner + their staff
 *      (anyone with admin access) sees it. Auto-saves on blur with a
 *      debounce so quick edits don't spam the API.
 */
export function CustomerActionsCard({
  customerId,
  customerName,
  customerEmail,
  restaurantName,
  initialNotes,
}: {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  restaurantName: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const NOTES_MAX = 2000;

  // Debounced auto-save on change. Fires 1.2s after the user stops
  // typing so we don't hammer the API mid-keystroke. The "Saved ✓"
  // indicator clears after a short delay so it's visible but not sticky.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Skip the initial mount — only save on actual user changes.
    if (notes === initialNotes) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to save notes");
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } catch {
        setError("Network error");
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notes, initialNotes, customerId]);

  const mailto = customerEmail
    ? `mailto:${encodeURIComponent(customerEmail)}` +
      `?subject=${encodeURIComponent(`About your order at ${restaurantName}`)}`
    : null;

  return (
    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <StickyNote className="w-5 h-5 text-amber-500" />
        Notes &amp; actions
      </h2>

      {/* Email customer button */}
      {customerEmail ? (
        <a
          href={mailto ?? "#"}
          className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
        >
          <Mail className="w-4 h-4" />
          Email {customerName.split(/\s+/)[0]}
        </a>
      ) : (
        <p className="mt-3 text-xs text-gray-500 italic">
          No email on file — can&apos;t send a direct message.
        </p>
      )}

      {/* Private notes */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-gray-700">
            Private notes (only your staff sees this)
          </label>
          <span className="text-[10px] text-gray-400">
            {notes.length}/{NOTES_MAX}
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
          rows={4}
          placeholder="e.g. Allergic to peanuts · VIP · Complained 2026-05-12 — comped a coupon · Prefers no contact"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
        />
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-gray-500">
            Auto-saves as you type. Customers never see this.
          </span>
          <span aria-live="polite">
            {saving ? (
              <span className="text-gray-500 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </span>
            ) : saved ? (
              <span className="text-emerald-600 inline-flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" /> Saved
              </span>
            ) : error ? (
              <span className="text-red-600">{error}</span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

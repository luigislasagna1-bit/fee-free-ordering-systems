"use client";
import { useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";

/**
 * Inline profile editor on /order/[slug]/account.
 *
 * Default state: read-only display (handled by the parent server
 * component). When the customer clicks "Edit", this component flips
 * into a small form. PATCHes /api/public/restaurant-customer/me. On
 * success it reloads the page so the parent re-renders with the
 * fresh values (no need to lift state up into the server component).
 *
 * Audit 2026-05-30 — Toast/Uber/DoorDash/Skip/Grubhub/Square all let
 * customers edit their own profile; we used to be read-only, which
 * meant a mistyped phone at signup was permanent.
 */
export function ProfileEditor({
  initialName,
  initialEmail,
  initialPhone,
}: {
  initialName: string;
  initialEmail: string | null;
  initialPhone: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/public/restaurant-customer/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Save failed (${res.status})`);
      }
      // Reload so the server component re-renders with the new values.
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" /> Edit profile
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
        <input
          type="tel"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          placeholder="(555) 555-5555"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Email (sign-in identity)</label>
        <input
          type="email"
          className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          value={initialEmail ?? ""}
          disabled
        />
        <p className="text-[10px] text-gray-400 mt-0.5">Contact the restaurant to change your sign-in email.</p>
      </div>
      {err && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { setEditing(false); setName(initialName); setPhone(initialPhone ?? ""); setErr(null); }}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

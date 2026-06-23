"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Palette } from "lucide-react";

/**
 * Editor for the reseller's login-page branding: brand colors
 * (primary + accent) and the custom login/signup title. All three skin
 * the reseller-branded auth pages (resolveResellerBranding) — the
 * primary color replaces the platform emerald on buttons/links, the
 * accent is the secondary brand tone, and the title is the headline
 * shown above the form.
 *
 * Colors are <input type="color"> + a synced hex text input so the
 * reseller can paste an exact brand hex. We persist only a valid
 * 6-digit hex; empty clears it (falls back to platform emerald). The
 * API re-validates, so the client check is purely a UX guard.
 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_PRIMARY = "#10b981"; // platform emerald — the fallback shown in the picker
const DEFAULT_ACCENT = "#34d399";

export function ColorsClient({
  initialTitle,
  initialPrimary,
  initialAccent,
  companyName,
}: {
  initialTitle: string;
  initialPrimary: string;
  initialAccent: string;
  companyName: string | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [primary, setPrimary] = useState(initialPrimary);
  const [accent, setAccent] = useState(initialAccent);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Empty is allowed (clears → platform default). A non-empty value must be a
  // full 6-digit hex before we let them save.
  const primaryValid = primary === "" || HEX_RE.test(primary);
  const accentValid = accent === "" || HEX_RE.test(accent);
  const canSave = primaryValid && accentValid;

  // The <input type="color"> always needs a concrete hex — fall back to the
  // platform default when the field is empty so the swatch shows something.
  const primarySwatch = HEX_RE.test(primary) ? primary : DEFAULT_PRIMARY;
  const accentSwatch = HEX_RE.test(accent) ? accent : DEFAULT_ACCENT;

  // Preview uses the chosen primary (or the platform default when unset/invalid).
  const previewColor = HEX_RE.test(primary) ? primary : DEFAULT_PRIMARY;
  const previewTitle = title.trim() || companyName || "Restaurant Login";

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandLoginTitle: title.trim(),
          brandPrimaryColor: primary.trim(),
          brandAccentColor: accent.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setSavedAt(Date.now());
    } catch {
      setError("Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Palette className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Login page</h1>
        <p className="text-sm text-gray-500">
          Set the headline and brand colors shown on your reseller-branded login and signup
          pages. The primary color replaces the platform green on buttons and links; the accent
          is your secondary brand tone.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Applies to the login/signup pages served on your branded domain. Leave a color blank to
          fall back to the platform default.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {/* Login title */}
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
          Login page title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          placeholder={companyName ? `${companyName} — Sign in` : "Sign in to your account"}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
        <div className="flex items-center justify-between mt-1.5 mb-6">
          <span className="text-[11px] text-gray-400">
            Headline above the sign-in form. Leave blank to use your company name.
          </span>
          <span className="text-[11px] text-gray-400">{title.length} / 100</span>
        </div>

        {/* Primary color */}
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
          Primary color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Primary color picker"
            value={primarySwatch}
            onChange={(e) => setPrimary(e.target.value)}
            className="h-10 w-12 rounded-lg border border-gray-200 bg-white p-1 cursor-pointer"
          />
          <input
            type="text"
            value={primary}
            onChange={(e) => setPrimary(e.target.value.trim())}
            placeholder={DEFAULT_PRIMARY}
            className={`w-32 border rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:outline-none ${
              primaryValid
                ? "border-gray-200 focus:ring-emerald-500"
                : "border-red-300 focus:ring-red-400"
            }`}
          />
          {primary !== "" && (
            <button
              type="button"
              onClick={() => setPrimary("")}
              className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {!primaryValid && (
          <p className="text-[11px] text-red-600 mt-1">Enter a hex value like {DEFAULT_PRIMARY}.</p>
        )}

        {/* Accent color */}
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mt-6 mb-2">
          Accent color <span className="text-gray-400 normal-case font-normal">(optional)</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Accent color picker"
            value={accentSwatch}
            onChange={(e) => setAccent(e.target.value)}
            className="h-10 w-12 rounded-lg border border-gray-200 bg-white p-1 cursor-pointer"
          />
          <input
            type="text"
            value={accent}
            onChange={(e) => setAccent(e.target.value.trim())}
            placeholder={DEFAULT_ACCENT}
            className={`w-32 border rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:outline-none ${
              accentValid
                ? "border-gray-200 focus:ring-emerald-500"
                : "border-red-300 focus:ring-red-400"
            }`}
          />
          {accent !== "" && (
            <button
              type="button"
              onClick={() => setAccent("")}
              className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {!accentValid && (
          <p className="text-[11px] text-red-600 mt-1">Enter a hex value like {DEFAULT_ACCENT}.</p>
        )}

        {/* Preview — a mock branded login card using the chosen primary color */}
        <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-3">
            Preview — your branded login page
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-5 max-w-xs mx-auto">
            <div className="text-base font-bold text-gray-900 mb-3 text-center">{previewTitle}</div>
            <div className="space-y-2 mb-4">
              <div className="h-9 rounded-md border border-gray-200 bg-gray-50" />
              <div className="h-9 rounded-md border border-gray-200 bg-gray-50" />
            </div>
            <button
              type="button"
              disabled
              className="w-full text-white text-sm font-semibold rounded-md py-2.5"
              style={{ backgroundColor: previewColor }}
            >
              Sign in
            </button>
            <div className="text-[11px] text-center mt-3" style={{ color: previewColor }}>
              Create an account
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={save}
            disabled={busy || !canSave}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save branding
          </button>
          {savedAt && !busy && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <strong>Tip:</strong> use your exact brand hex codes for a seamless look. The branded
        login and signup pages share these colors, so customers see one consistent brand from the
        first screen.
      </div>
    </div>
  );
}

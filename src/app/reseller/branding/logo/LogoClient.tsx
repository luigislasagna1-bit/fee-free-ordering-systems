"use client";

import { useState, useRef } from "react";
import { Loader2, Upload, CheckCircle2, Trash2, Image as ImageIcon } from "lucide-react";

/**
 * Logo upload UI. Two-step flow handled in one button:
 *   1. POST the file to /api/reseller/upload  → { url }
 *   2. PATCH /api/reseller/branding with { brandLogoUrl: url }
 *
 * Optimistic-update the preview as soon as #1 returns; the PATCH is
 * fast enough that the UI doesn't need a separate spinner for it.
 * Remove is the inverse — just PATCH brandLogoUrl: null.
 */
export function LogoClient({
  initialLogoUrl,
  initialLoginBgUrl,
}: {
  initialLogoUrl: string | null;
  initialLoginBgUrl: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Login/signup background image — independent upload, same two-step flow.
  const [bgUrl, setBgUrl] = useState<string | null>(initialLoginBgUrl);
  const [bgBusy, setBgBusy] = useState<"upload" | "remove" | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [bgSavedAt, setBgSavedAt] = useState<number | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  async function handleBgFile(file: File) {
    setBgBusy("upload");
    setBgError(null);
    try {
      // Step 1 — upload bytes
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/reseller/upload", {
        method: "POST",
        body: form,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setBgError(uploadData.error || "Upload failed");
        return;
      }

      // Step 2 — persist URL on the reseller profile
      const patchRes = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandLoginBgUrl: uploadData.url }),
      });
      if (!patchRes.ok) {
        const patchData = await patchRes.json().catch(() => ({}));
        setBgError(patchData.error || "Saved upload but couldn't update profile");
        return;
      }

      setBgUrl(uploadData.url);
      setBgSavedAt(Date.now());
    } catch {
      setBgError("Upload failed — check your connection and try again");
    } finally {
      setBgBusy(null);
    }
  }

  async function removeBg() {
    if (!confirm("Remove your login background? The default FeeFree background will be used.")) return;
    setBgBusy("remove");
    setBgError(null);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandLoginBgUrl: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBgError(data.error || "Could not remove background");
        return;
      }
      setBgUrl(null);
      setBgSavedAt(Date.now());
    } catch {
      setBgError("Could not remove background");
    } finally {
      setBgBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy("upload");
    setError(null);
    try {
      // Step 1 — upload bytes
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/reseller/upload", {
        method: "POST",
        body: form,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploadData.error || "Upload failed");
        return;
      }

      // Step 2 — persist URL on the reseller profile
      const patchRes = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandLogoUrl: uploadData.url }),
      });
      if (!patchRes.ok) {
        const patchData = await patchRes.json().catch(() => ({}));
        setError(patchData.error || "Saved upload but couldn't update profile");
        return;
      }

      setLogoUrl(uploadData.url);
      setSavedAt(Date.now());
    } catch {
      setError("Upload failed — check your connection and try again");
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    if (!confirm("Remove your logo? Emails will go back to text-only imprint.")) return;
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandLogoUrl: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not remove logo");
        return;
      }
      setLogoUrl(null);
      setSavedAt(Date.now());
    } catch {
      setError("Could not remove logo");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <ImageIcon className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Logo</h1>
        <p className="text-sm text-gray-500">
          Small logo shown above your imprint in the footer of transactional emails. Keeps your
          brand visible without overpowering the restaurant&apos;s own contact info.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          <strong>Not</strong> printed on physical receipts. Email surfaces only.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {/* Current logo preview / drop zone */}
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 flex items-center justify-center min-h-[140px]">
          {logoUrl ? (
            <div className="flex items-center gap-5 flex-wrap">
              <img
                src={logoUrl}
                alt="Reseller logo"
                className="max-h-20 max-w-[240px] object-contain bg-white border border-gray-200 rounded-lg p-2"
              />
              <div className="text-xs text-gray-500">
                <div className="mb-1 font-semibold text-gray-700">Logo uploaded</div>
                <div className="font-mono text-[10px] text-gray-400 truncate max-w-[280px]">
                  {logoUrl}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <div className="text-sm text-gray-600">No logo yet</div>
              <div className="text-xs text-gray-400 mt-1">PNG, JPG, WebP, or SVG · max 5 MB</div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Reset so the same file can be re-selected after an error.
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={removeLogo}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50 transition"
            >
              {busy === "remove" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remove
            </button>
          )}
          {savedAt && !busy && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Login background image uploader — mirrors the logo flow above */}
      <div className="mt-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Login background</h2>
        <p className="text-sm text-gray-500">
          Replaces the default FeeFree background on your branded login and signup pages with your
          own image.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Use a high-resolution photo — it fills the full screen behind the sign-in card.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {/* Current background preview / drop zone */}
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center min-h-[160px]">
          {bgUrl ? (
            <img
              src={bgUrl}
              alt="Login background"
              className="w-full max-h-56 object-cover"
            />
          ) : (
            <div className="text-center py-8">
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <div className="text-sm text-gray-600">Using the default FeeFree background</div>
              <div className="text-xs text-gray-400 mt-1">PNG, JPG, or WebP · max 5 MB</div>
            </div>
          )}
        </div>

        {bgError && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{bgError}</div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <input
            ref={bgInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleBgFile(f);
              // Reset so the same file can be re-selected after an error.
              if (bgInputRef.current) bgInputRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => bgInputRef.current?.click()}
            disabled={bgBusy !== null}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {bgBusy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {bgUrl ? "Replace background" : "Upload background"}
          </button>
          {bgUrl && (
            <button
              type="button"
              onClick={removeBg}
              disabled={bgBusy !== null}
              className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50 transition"
            >
              {bgBusy === "remove" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remove
            </button>
          )}
          {bgSavedAt && !bgBusy && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4 leading-relaxed">
          This replaces the default FeeFree background on your branded login and signup pages.
        </p>
      </div>

      {/* Email preview — shows where the logo lands */}
      <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-3">
          Preview — appears at the bottom of every transactional email
        </div>
        <div className="bg-white border border-gray-100 rounded-md p-4">
          <div className="text-sm text-gray-700 mb-3">[ email body content here … ]</div>
          <hr className="border-gray-200 mb-3" />
          {logoUrl && (
            <img
              src={logoUrl}
              alt="logo"
              className="max-h-6 max-w-[120px] object-contain mb-1.5 opacity-80"
            />
          )}
          <div className="text-[11px] text-gray-400 leading-relaxed">
            Powered by <strong className="text-gray-500">Your imprint text</strong>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
          Logo renders at ~24px tall above the &ldquo;Powered by&rdquo; line. The actual imprint text
          is configured on the <strong>Imprint</strong> page.
        </p>
      </div>

      <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <strong>Tip:</strong> use a transparent-background PNG or SVG. Email clients render the
        footer on white, but a transparent background means the logo will look right anywhere
        we display it later (branded login page, custom-domain landing, etc.).
      </div>
    </div>
  );
}

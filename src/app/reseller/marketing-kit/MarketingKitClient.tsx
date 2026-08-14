"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Download, FileText, Image as ImageIcon, QrCode, Loader2, Check, AlertTriangle, Info, Palette,
} from "lucide-react";
import { LOCALE_OPTIONS } from "@/lib/locales";
import { kitOfferableLocales } from "@/lib/reseller-kit/locales";

/**
 * The Marketing Kit editor.
 *
 * The preview is the SAME render endpoint at a lower resolution, not a browser re-creation of
 * the design. That is deliberate: a browser and satori are different layout engines and their
 * text wrapping genuinely differs, so a hand-built HTML preview would quietly disagree with
 * the file the partner downloads — worst of all in the languages where string lengths vary
 * most. What is on screen here IS the file.
 */

type Tier = "platform" | "debranded" | "branded";

interface TemplateMeta {
  id: string;
  sizes: string[];
  fields: string[];
  showsPlatformPricing: boolean;
}

interface Props {
  brand: {
    tier: Tier;
    brandName: string;
    primary: string;
    landingBrandMismatch: boolean;
    degradedReason: "no-company-name" | null;
  };
  referral: { url: string; displayUrl: string; kind: string; perishable: boolean };
  templates: TemplateMeta[];
  initialPrefs: {
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    accentColor: string;
    showPricing: boolean;
    outputLocale: string;
    overrides: Record<string, Record<string, string>>;
  };
}

const TEMPLATE_LABELS: Record<string, { name: string; blurb: string }> = {
  "flagship-onepager": {
    name: "Own Your Orders (full one-pager)",
    blurb: "The complete Fee Free flyer — comparison, what's included, what it costs. Your QR replaces the platform one.",
  },
  "whole-system": {
    name: "The Whole System",
    blurb: "Current, accurate rundown of what the platform actually does — including AI phone ordering and branded apps. Carries your brand.",
  },
  "own-your-orders": {
    name: "Own Your Orders",
    blurb: "The all-rounder. Headline, the 30%-vs-0% comparison, what's included, your QR.",
  },
  "fee-comparison": {
    name: "Everything You Need",
    blurb: "Nine-tile feature grid. Good for an owner who wants to see the whole product at once.",
  },
  "combine-dont-choose": {
    name: "Combine, Don't Choose",
    blurb: "The easy yes: keep the delivery apps for discovery, move repeat orders direct.",
  },
};

const SIZE_LABELS: Record<string, string> = {
  "a4-portrait": "A4",
  "letter-portrait": "US Letter",
};

/**
 * Only languages with a checked translation AND a script satori can shape correctly.
 * Offering a language we'd then render in English is worse than offering none — the partner
 * only finds out after printing.
 */
const offerableLocales: string[] = kitOfferableLocales();

export function MarketingKitClient({ brand, referral, templates, initialPrefs }: Props) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [activeId, setActiveId] = useState(templates[0]?.id ?? "");
  const [size, setSize] = useState(templates[0]?.sizes[0] ?? "a4-portrait");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const active = useMemo(() => templates.find((t) => t.id === activeId), [templates, activeId]);
  const objectUrlRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  const overridesFor = prefs.overrides[activeId] ?? {};

  /** Persist, then refresh the preview so the two can never disagree. */
  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/reseller/marketing-kit/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPreviewError(data.error || "Could not save");
        setSaveState("idle");
        return false;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch {
      setSaveState("idle");
      return false;
    }
  }, []);

  const refreshPreview = useCallback(async () => {
    if (!activeId) return;
    const seq = ++seqRef.current;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const qs = new URLSearchParams({
        asset: activeId, size, format: "png", preview: "1",
        locale: prefs.outputLocale, t: String(Date.now()),
      });
      const res = await fetch(`/api/reseller/marketing-kit/render?${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (seq === seqRef.current) {
          setPreviewError(
            data.error === "not_renderable_locale"
              ? "That language can't be printed yet."
              : data.error === "render_failed"
                ? "Couldn't build that preview. Try a different option."
                : data.error || "Preview unavailable",
          );
        }
        return;
      }
      const blob = await res.blob();
      if (seq !== seqRef.current) return; // a newer request already won
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objUrl;
      setPreviewUrl(objUrl);
    } catch {
      if (seq === seqRef.current) setPreviewError("Preview unavailable");
    } finally {
      if (seq === seqRef.current) setPreviewing(false);
    }
  }, [activeId, size, prefs.outputLocale]);

  // Debounced: the partner types, we wait for them to stop, then render once.
  useEffect(() => {
    const id = setTimeout(refreshPreview, 500);
    return () => clearTimeout(id);
  }, [refreshPreview, prefs.contactName, prefs.contactPhone, prefs.contactEmail, prefs.accentColor, prefs.showPricing, prefs.overrides]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function downloadHref(format: "png" | "pdf") {
    const qs = new URLSearchParams({ asset: activeId, size, format, locale: prefs.outputLocale });
    return `/api/reseller/marketing-kit/render?${qs}`;
  }

  function setField(key: keyof typeof prefs, value: string | boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function setOverride(field: string, value: string) {
    setPrefs((p) => ({
      ...p,
      overrides: { ...p.overrides, [activeId]: { ...(p.overrides[activeId] ?? {}), [field]: value } },
    }));
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Marketing Kit</h1>
          <p className="text-sm text-gray-500">
            Print-ready flyers with your brand and your referral QR already on them. Download,
            print, hand out.
          </p>
        </div>
        <a
          href="/api/reseller/marketing-kit/qr?format=png&size=1200"
          className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm transition"
        >
          <QrCode className="w-4 h-4" /> Just the QR code
        </a>
      </div>

      {/* Where the QR actually points — the single most important thing to get right. */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-gray-900">Every code on these leads here</h2>
        </div>
        <code className="block bg-gray-50 rounded-lg p-2 text-xs text-gray-700 break-all">
          {referral.url}
        </code>
        <p className="text-xs text-gray-500 mt-2">
          Restaurants signing up through it are attributed to you automatically.
          {referral.kind !== "platform" && (
            <> This is your own domain — it stays live while your Branded plan is active, and
            falls back to the main signup page (still credited to you) if it ever lapses.</>
          )}
        </p>
      </div>

      {brand.degradedReason === "no-company-name" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Add your company name</strong> in{" "}
            <Link href="/reseller/branding/imprint" className="underline font-semibold">
              Branding → Imprint
            </Link>{" "}
            and these flyers will carry your brand instead of ours.
          </p>
        </div>
      )}

      {brand.landingBrandMismatch && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex gap-2">
          <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-900 leading-relaxed">
            Your flyers are fully <strong>{brand.brandName}</strong> — but the signup page the QR
            opens still shows Fee Free Ordering.{" "}
            <Link href="/reseller/branding" className="underline font-semibold">
              Branded
            </Link>{" "}
            makes them match.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        {/* ── Left: pick + personalise ─────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Choose a flyer</h2>
            <div className="space-y-2">
              {templates.map((t) => {
                const meta = TEMPLATE_LABELS[t.id] ?? { name: t.id, blurb: "" };
                const isActive = t.id === activeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveId(t.id);
                      if (!t.sizes.includes(size)) setSize(t.sizes[0]);
                    }}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      isActive
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    <div className="text-sm font-bold text-gray-900">{meta.name}</div>
                    <div className="text-xs text-gray-500 leading-relaxed mt-0.5">{meta.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Your details</h2>
            <Field label="Your name" value={prefs.contactName}
              onChange={(v) => setField("contactName", v)}
              onBlur={() => save({ contactName: prefs.contactName })} />
            <Field label="Phone" value={prefs.contactPhone}
              onChange={(v) => setField("contactPhone", v)}
              onBlur={() => save({ contactPhone: prefs.contactPhone })} />
            <Field label="Email" value={prefs.contactEmail}
              onChange={(v) => setField("contactEmail", v)}
              onBlur={() => save({ contactEmail: prefs.contactEmail })} />

            {active?.fields.includes("headline") && (
              <Field
                label="Headline (optional)"
                placeholder="Leave blank for the default"
                value={overridesFor.headline ?? ""}
                onChange={(v) => setOverride("headline", v)}
                onBlur={() => save({ overrides: prefs.overrides })}
              />
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                <Palette className="w-3 h-3 inline mr-1" /> Accent colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={prefs.accentColor || brand.primary}
                  onChange={(e) => setField("accentColor", e.target.value)}
                  onBlur={() => save({ accentColor: prefs.accentColor })}
                  className="h-9 w-14 rounded border border-gray-300 bg-white p-1"
                />
                <button
                  type="button"
                  onClick={() => { setField("accentColor", ""); void save({ accentColor: "" }); }}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Reset
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Printed language
              </label>
              <select
                value={prefs.outputLocale}
                onChange={(e) => { setField("outputLocale", e.target.value); void save({ outputLocale: e.target.value }); }}
                disabled={offerableLocales.length < 2}
                className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                {LOCALE_OPTIONS.filter((o) => offerableLocales.includes(o.code)).map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                {offerableLocales.length < 2
                  ? "Printed flyers are English for now. Other languages are wired up and will appear here as each translation is checked — we'd rather show nothing than hand you a flyer labelled French that isn't."
                  : "The dashboard stays in English; this only changes the printed flyer."}
              </p>
            </div>

            {active?.showsPlatformPricing && brand.tier === "platform" && (
              <label className="flex items-start gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={prefs.showPricing}
                  onChange={(e) => { setField("showPricing", e.target.checked); void save({ showPricing: e.target.checked }); }}
                  className="mt-0.5"
                />
                <span>Show add-on prices (pulled live, so they can&apos;t go stale)</span>
              </label>
            )}

            <div className="h-4 text-xs text-emerald-700 font-semibold flex items-center gap-1">
              {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
              {saveState === "saved" && <><Check className="w-3 h-3" /> Saved</>}
            </div>
          </div>
        </div>

        {/* ── Right: preview + download ─────────────────────────── */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">Preview</h2>
              {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
            <div className="flex items-center gap-2">
              {(active?.sizes ?? []).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${
                    s === size ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {SIZE_LABELS[s] ?? s}
                </button>
              ))}
              <a
                href={downloadHref("pdf")}
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
              >
                <FileText className="w-4 h-4" /> PDF
              </a>
              <a
                href={downloadHref("png")}
                className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
              >
                <ImageIcon className="w-4 h-4" /> PNG
              </a>
            </div>
          </div>

          {previewError ? (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
              {previewError}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex justify-center min-h-[420px] items-center">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Flyer preview"
                  className="max-w-full max-h-[70vh] shadow-lg rounded"
                />
              ) : (
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Building your flyer…
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            <Download className="w-3 h-3 inline mr-1" />
            The PDF is A4 or Letter at print resolution with 3&nbsp;mm bleed. It&apos;s RGB, which
            every online and high-street print shop accepts — if a printer asks you for CMYK
            separations, email support and we&apos;ll produce that file for you.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, onBlur, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white"
      />
    </div>
  );
}

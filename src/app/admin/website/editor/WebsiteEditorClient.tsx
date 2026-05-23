"use client";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Loader2, RotateCcw, Save, Eye, EyeOff, Check } from "lucide-react";
import type {
  HostedSiteSettings,
  BuiltInSection,
  CustomSection,
} from "@/lib/hosted-site-settings";
import {
  MAX_CUSTOM_SECTIONS,
  MAX_CUSTOM_SECTION_TITLE_LEN,
  MAX_CUSTOM_SECTION_BODY_LEN,
  MAX_CTA_LABEL_LEN,
} from "@/lib/hosted-site-settings";

const SECTION_LABELS: Record<BuiltInSection, string> = {
  banner: "Banner image",
  about: "About",
  featuredMenu: "Featured menu",
  visit: "Visit (address, phone, hours)",
  map: "Embedded map",
  social: "Social links",
};

const POSITION_OPTIONS: Array<{ value: BuiltInSection; label: string }> = [
  { value: "banner", label: "After the banner / hero" },
  { value: "about", label: "After About" },
  { value: "featuredMenu", label: "After Featured menu" },
  { value: "visit", label: "After Visit + Hours" },
  { value: "map", label: "After the map" },
  { value: "social", label: "After social links" },
];

/**
 * Client-side editor that mirrors the HostedSiteSettings shape with
 * form controls. Stays purely local until "Save" is clicked, then PATCH
 * to /api/admin/website/settings. Server enforces the same limits the
 * UI enforces so a curl-bypass can't grow the payload past the caps.
 */
export function WebsiteEditorClient({
  initial,
  restaurantDefaults,
  previewUrl,
}: {
  initial: HostedSiteSettings;
  restaurantDefaults: { name: string; slogan: string | null; cuisineType: string | null };
  previewUrl: string;
}) {
  const [settings, setSettings] = useState<HostedSiteSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewKey, setPreviewKey] = useState(0); // bumps the iframe to refresh on save

  // Track if the in-memory settings differ from the last-saved baseline so
  // the Save button can show a "no changes" disabled state.
  const baselineKey = useMemo(() => JSON.stringify(initial), [initial]);
  const currentKey = useMemo(() => JSON.stringify(settings), [settings]);
  const dirty = baselineKey !== currentKey;

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/website/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to save");
        return;
      }
      setSettings(data.settings);
      setPreviewKey((k) => k + 1);
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [saving, settings]);

  const resetAll = useCallback(async () => {
    if (!confirm("Reset every customization back to defaults? This can't be undone.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/website/settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to reset");
        return;
      }
      setSettings(data.settings);
      setPreviewKey((k) => k + 1);
      toast.success("Reset to defaults");
    } finally {
      setResetting(false);
    }
  }, []);

  function toggleSection(key: BuiltInSection) {
    setSettings((s) => ({
      ...s,
      sections: { ...s.sections, [key]: !s.sections[key] },
    }));
  }

  function addCustomSection() {
    if (settings.customSections.length >= MAX_CUSTOM_SECTIONS) {
      toast.error(`Maximum ${MAX_CUSTOM_SECTIONS} custom sections.`);
      return;
    }
    const newSection: CustomSection = {
      id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: "New section",
      body: "",
      position: "about",
    };
    setSettings((s) => ({ ...s, customSections: [...s.customSections, newSection] }));
  }

  function updateCustomSection(id: string, patch: Partial<CustomSection>) {
    setSettings((s) => ({
      ...s,
      customSections: s.customSections.map((sec) =>
        sec.id === id ? { ...sec, ...patch } : sec
      ),
    }));
  }

  function removeCustomSection(id: string) {
    setSettings((s) => ({
      ...s,
      customSections: s.customSections.filter((sec) => sec.id !== id),
    }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,440px)] gap-5">
      {/* ─── Left column: forms ───────────────────────────────────────── */}
      <div className="space-y-5">
        {/* Header / hero */}
        <Card title="Header & hero" subtitle="Logo, title, and the buttons at the top of your page.">
          <ToggleRow
            label="Full-screen hero"
            help="Banner image fills the entire hero with a dark overlay, GloriaFood-style. Best for photographic banners (food shots, restaurant interior). Leave off if your banner is a logo or text graphic."
            value={settings.header.fullScreenHero}
            onChange={(v) =>
              setSettings((s) => ({ ...s, header: { ...s.header, fullScreenHero: v } }))
            }
          />
          <ToggleRow
            label="Show logo"
            help="Your uploaded logo overlapping the banner/hero."
            value={settings.header.showLogo}
            onChange={(v) =>
              setSettings((s) => ({ ...s, header: { ...s.header, showLogo: v } }))
            }
          />
          <ToggleRow
            label="Show cuisine type label"
            help={restaurantDefaults.cuisineType ? `Currently: "${restaurantDefaults.cuisineType}"` : "No cuisine set in profile yet."}
            value={settings.header.showCuisineLabel}
            onChange={(v) =>
              setSettings((s) => ({ ...s, header: { ...s.header, showCuisineLabel: v } }))
            }
          />
          <TextField
            label="Custom title"
            help={`Override the page title. Leave empty to use "${restaurantDefaults.name}".`}
            placeholder={restaurantDefaults.name}
            value={settings.header.customTitle ?? ""}
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                header: { ...s.header, customTitle: v.trim() === "" ? null : v },
              }))
            }
            maxLength={80}
          />
          <TextField
            label="Custom slogan"
            help={`Override the tagline under the title. Default: "${restaurantDefaults.slogan ?? "(none set)"}".`}
            placeholder={restaurantDefaults.slogan ?? "Delicious food made fresh daily"}
            value={settings.header.customSlogan ?? ""}
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                header: { ...s.header, customSlogan: v.trim() === "" ? null : v },
              }))
            }
            maxLength={120}
          />
        </Card>

        {/* Sections — visibility toggles */}
        <Card
          title="Sections"
          subtitle="Show or hide each section. Content for visible sections is pulled automatically from your menu, hours, and profile."
        >
          {(Object.entries(SECTION_LABELS) as Array<[BuiltInSection, string]>).map(
            ([key, label]) => (
              <ToggleRow
                key={key}
                label={label}
                value={settings.sections[key]}
                onChange={() => toggleSection(key)}
              />
            )
          )}
        </Card>

        {/* CTAs */}
        <Card title="Call-to-action buttons" subtitle="The hero buttons. The primary defaults to your order page; the secondary defaults to your reservation flow.">
          <div className="border-b border-gray-100 pb-4 mb-4">
            <ToggleRow
              label="Show Primary button"
              value={settings.cta.primary.enabled}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, primary: { ...s.cta.primary, enabled: v } },
                }))
              }
            />
            <TextField
              label="Primary label"
              placeholder="Order Online"
              value={settings.cta.primary.label}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, primary: { ...s.cta.primary, label: v } },
                }))
              }
              maxLength={MAX_CTA_LABEL_LEN}
            />
            <TextField
              label="Primary link"
              help="Defaults to your /order page. Override only if you want this button to go somewhere else."
              placeholder="/order/your-slug (default)"
              value={settings.cta.primary.href ?? ""}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, primary: { ...s.cta.primary, href: v.trim() === "" ? null : v } },
                }))
              }
              maxLength={200}
            />
          </div>
          <div>
            <ToggleRow
              label="Show Secondary button"
              help="Only shows when you accept reservations."
              value={settings.cta.secondary.enabled}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, secondary: { ...s.cta.secondary, enabled: v } },
                }))
              }
            />
            <TextField
              label="Secondary label"
              placeholder="Book a Table"
              value={settings.cta.secondary.label}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, secondary: { ...s.cta.secondary, label: v } },
                }))
              }
              maxLength={MAX_CTA_LABEL_LEN}
            />
            <TextField
              label="Secondary link"
              help="Defaults to /order?service=reservation."
              placeholder="(default)"
              value={settings.cta.secondary.href ?? ""}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, secondary: { ...s.cta.secondary, href: v.trim() === "" ? null : v } },
                }))
              }
              maxLength={200}
            />
          </div>
        </Card>

        {/* Custom sections */}
        <Card
          title="Your own sections"
          subtitle={`Add up to ${MAX_CUSTOM_SECTIONS} sections of your own — perfect for daily specials, the chef's story, or COVID hours notes.`}
        >
          {settings.customSections.length === 0 && (
            <p className="text-sm text-gray-500 mb-4 italic">
              No custom sections yet. Click + Add section to create one.
            </p>
          )}
          {settings.customSections.map((sec) => (
            <div key={sec.id} className="border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Custom section
                </span>
                <button
                  type="button"
                  onClick={() => removeCustomSection(sec.id)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
              <TextField
                label="Section title"
                value={sec.title}
                onChange={(v) => updateCustomSection(sec.id, { title: v })}
                maxLength={MAX_CUSTOM_SECTION_TITLE_LEN}
              />
              <TextAreaField
                label="Section content"
                help="Plain text. Line breaks are preserved."
                value={sec.body}
                onChange={(v) => updateCustomSection(sec.id, { body: v })}
                maxLength={MAX_CUSTOM_SECTION_BODY_LEN}
                rows={5}
              />
              <SelectField
                label="Place this section…"
                value={sec.position}
                onChange={(v) =>
                  updateCustomSection(sec.id, { position: v as BuiltInSection })
                }
                options={POSITION_OPTIONS}
              />
            </div>
          ))}
          {settings.customSections.length < MAX_CUSTOM_SECTIONS && (
            <button
              type="button"
              onClick={addCustomSection}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-orange-300 hover:text-orange-600 transition"
            >
              <Plus className="w-4 h-4" /> Add section ({settings.customSections.length}/{MAX_CUSTOM_SECTIONS})
            </button>
          )}
        </Card>

        {/* Action bar */}
        <div className="sticky bottom-4 bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex items-center justify-between gap-2 z-10">
          <button
            type="button"
            onClick={resetAll}
            disabled={resetting || saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset all
          </button>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 font-semibold">Unsaved changes</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white font-semibold text-sm shadow hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> {dirty ? "Save changes" : "All saved"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Right column: live preview iframe ────────────────────────── */}
      <div className="hidden lg:block">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Live preview
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <iframe
              key={previewKey}
              src={previewUrl}
              className="w-full h-[640px] border-0"
              title="Hosted site preview"
            />
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">
            Preview updates on save. To see live changes during edits, click
            Save then this panel will refresh automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Small form primitives ───────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer py-1">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {help && <div className="text-[11px] text-gray-500 mt-0.5">{help}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition ${
          value ? "bg-orange-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow translate-y-0.5 transition ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function TextField({
  label,
  help,
  placeholder,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300"
      />
      {help && <p className="text-[11px] text-gray-500 mt-1">{help}</p>}
    </div>
  );
}

function TextAreaField({
  label,
  help,
  value,
  onChange,
  maxLength,
  rows = 4,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 resize-y"
      />
      {help && <p className="text-[11px] text-gray-500 mt-1">{help}</p>}
      {maxLength && (
        <p className="text-[10px] text-gray-400 mt-0.5 text-right">
          {value.length} / {maxLength}
        </p>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

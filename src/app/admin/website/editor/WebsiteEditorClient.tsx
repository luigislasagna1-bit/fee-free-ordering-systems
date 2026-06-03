"use client";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Loader2, RotateCcw, Save, Eye, EyeOff, Check, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { ImageUpload } from "@/components/admin/ImageUpload";

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
  restaurantDefaults: {
    name: string;
    slogan: string | null;
    cuisineType: string | null;
    /** Current hero photo. Editable inline — uploads save immediately
     *  (separate endpoint from the settings PATCH because bannerUrl
     *  lives on the Restaurant row, not in hostedSiteSettings JSON). */
    bannerUrl: string | null;
    /** Current restaurant logo. Same inline-save pattern as banner. */
    logoUrl: string | null;
  };
  previewUrl: string;
}) {
  const t = useTranslations("admin.websiteEditor");
  const [settings, setSettings] = useState<HostedSiteSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewKey, setPreviewKey] = useState(0); // bumps the iframe to refresh on save
  // Banner + logo state — separate from `settings` because they save
  // through /api/restaurants/profile (not /api/admin/website/settings).
  // We track current value so the upload component can show the existing
  // photo + so we can mutate it without a full page reload.
  const [bannerUrl, setBannerUrl] = useState(restaurantDefaults.bannerUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(restaurantDefaults.logoUrl ?? "");

  const SECTION_LABELS: Record<BuiltInSection, string> = {
    banner: t("sectionBanner"),
    serviceSummary: t("sectionServiceSummary"),
    specialOffers: t("sectionSpecialOffers"),
    about: t("sectionAbout"),
    featuredMenu: t("sectionFeaturedMenu"),
    visit: t("sectionVisit"),
    map: t("sectionMap"),
    social: t("sectionSocial"),
  };

  const POSITION_OPTIONS: Array<{ value: BuiltInSection; label: string }> = [
    { value: "banner", label: t("positionAfterBanner") },
    { value: "serviceSummary", label: t("positionAfterServiceSummary") },
    { value: "specialOffers", label: t("positionAfterSpecialOffers") },
    { value: "about", label: t("positionAfterAbout") },
    { value: "featuredMenu", label: t("positionAfterFeaturedMenu") },
    { value: "visit", label: t("positionAfterVisit") },
    { value: "map", label: t("positionAfterMap") },
    { value: "social", label: t("positionAfterSocial") },
  ];

  /** Persist a single Restaurant field via /api/restaurants/profile.
   *  Used by the banner + logo uploads inside the website editor so
   *  the owner doesn't have to navigate to /admin/profile to change
   *  the hero photo — Luigi's UAT call-out 2026-05-24. */
  const saveProfileField = useCallback(
    async (field: "bannerUrl" | "logoUrl", value: string) => {
      try {
        const res = await fetch("/api/restaurants/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data?.error || t("errorFailedToSavePhoto"));
          return false;
        }
        setPreviewKey((k) => k + 1); // refresh the iframe preview
        toast.success(field === "bannerUrl" ? t("successHeroPhotoUpdated") : t("successLogoUpdated"));
        return true;
      } catch (e: any) {
        toast.error(e?.message || t("errorFailedToSavePhoto"));
        return false;
      }
    },
    [t],
  );

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
        toast.error(data?.error || t("errorFailedToSave"));
        return;
      }
      setSettings(data.settings);
      setPreviewKey((k) => k + 1);
      toast.success(t("successSaved"));
    } catch (e: any) {
      toast.error(e?.message || t("errorFailedToSave"));
    } finally {
      setSaving(false);
    }
  }, [saving, settings, t]);

  const resetAll = useCallback(async () => {
    if (!confirm(t("confirmResetAll"))) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/website/settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || t("errorFailedToReset"));
        return;
      }
      setSettings(data.settings);
      setPreviewKey((k) => k + 1);
      toast.success(t("successResetToDefaults"));
    } finally {
      setResetting(false);
    }
  }, [t]);

  function toggleSection(key: BuiltInSection) {
    setSettings((s) => ({
      ...s,
      sections: { ...s.sections, [key]: !s.sections[key] },
    }));
  }

  function addCustomSection() {
    if (settings.customSections.length >= MAX_CUSTOM_SECTIONS) {
      toast.error(t("errorMaxCustomSections", { max: MAX_CUSTOM_SECTIONS }));
      return;
    }
    const newSection: CustomSection = {
      id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: t("newSectionDefaultTitle"),
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
        <Card title={t("cardHeaderHeroTitle")} subtitle={t("cardHeaderHeroSubtitle")}>
          {/* Hero photo — uploads save immediately via /api/restaurants/profile.
              Lives at the top of the section so it's the first thing the
              owner sees — matches the visual prominence of the photo on
              the live page. */}
          <div className="border-b border-gray-100 pb-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-semibold text-gray-800">{t("heroPhotoLabel")}</label>
              <span className="text-xs text-gray-500">{t("heroPhotoHint")}</span>
            </div>
            <ImageUpload
              value={bannerUrl}
              aspectRatio="wide"
              onChange={async (url) => {
                setBannerUrl(url);
                await saveProfileField("bannerUrl", url);
              }}
            />
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              {t("heroPhotoTip")}
            </p>
          </div>

          {/* Logo — saved the same way as banner */}
          <div className="border-b border-gray-100 pb-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-semibold text-gray-800">{t("logoLabel")}</label>
              <span className="text-xs text-gray-500">{t("logoHint")}</span>
            </div>
            <ImageUpload
              value={logoUrl}
              aspectRatio="square"
              onChange={async (url) => {
                setLogoUrl(url);
                await saveProfileField("logoUrl", url);
              }}
            />
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              {t("logoTip")}
            </p>
          </div>

          <ToggleRow
            label={t("toggleFullScreenHero")}
            help={t("toggleFullScreenHeroHelp")}
            value={settings.header.fullScreenHero}
            onChange={(v) =>
              setSettings((s) => ({ ...s, header: { ...s.header, fullScreenHero: v } }))
            }
          />
          <ToggleRow
            label={t("toggleShowLogo")}
            help={t("toggleShowLogoHelp")}
            value={settings.header.showLogo}
            onChange={(v) =>
              setSettings((s) => ({ ...s, header: { ...s.header, showLogo: v } }))
            }
          />
          <ToggleRow
            label={t("toggleShowCuisineLabel")}
            help={
              restaurantDefaults.cuisineType
                ? t("toggleShowCuisineLabelHelpSet", { cuisineType: restaurantDefaults.cuisineType })
                : t("toggleShowCuisineLabelHelpUnset")
            }
            value={settings.header.showCuisineLabel}
            onChange={(v) =>
              setSettings((s) => ({ ...s, header: { ...s.header, showCuisineLabel: v } }))
            }
          />
          <TextField
            label={t("fieldCustomTitleLabel")}
            help={t("fieldCustomTitleHelp", { name: restaurantDefaults.name })}
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
            label={t("fieldCustomSloganLabel")}
            help={t("fieldCustomSloganHelp", { slogan: restaurantDefaults.slogan ?? t("sloganNoneSet") })}
            placeholder={restaurantDefaults.slogan ?? t("sloganPlaceholder")}
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
          title={t("cardSectionsTitle")}
          subtitle={t("cardSectionsSubtitle")}
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
        <Card title={t("cardCtaTitle")} subtitle={t("cardCtaSubtitle")}>
          <div className="border-b border-gray-100 pb-4 mb-4">
            <ToggleRow
              label={t("toggleShowPrimaryButton")}
              value={settings.cta.primary.enabled}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, primary: { ...s.cta.primary, enabled: v } },
                }))
              }
            />
            <TextField
              label={t("fieldPrimaryLabelLabel")}
              placeholder={t("fieldPrimaryLabelPlaceholder")}
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
              label={t("fieldPrimaryLinkLabel")}
              help={t("fieldPrimaryLinkHelp")}
              placeholder={t("fieldPrimaryLinkPlaceholder")}
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
              label={t("toggleShowSecondaryButton")}
              help={t("toggleShowSecondaryButtonHelp")}
              value={settings.cta.secondary.enabled}
              onChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  cta: { ...s.cta, secondary: { ...s.cta.secondary, enabled: v } },
                }))
              }
            />
            <TextField
              label={t("fieldSecondaryLabelLabel")}
              placeholder={t("fieldSecondaryLabelPlaceholder")}
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
              label={t("fieldSecondaryLinkLabel")}
              help={t("fieldSecondaryLinkHelp")}
              placeholder={t("fieldSecondaryLinkPlaceholder")}
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
          title={t("cardCustomSectionsTitle")}
          subtitle={t("cardCustomSectionsSubtitle", { max: MAX_CUSTOM_SECTIONS })}
        >
          {settings.customSections.length === 0 && (
            <p className="text-sm text-gray-500 mb-4 italic">
              {t("customSectionsEmpty")}
            </p>
          )}
          {settings.customSections.map((sec) => (
            <div key={sec.id} className="border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {t("customSectionBadge")}
                </span>
                <button
                  type="button"
                  onClick={() => removeCustomSection(sec.id)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("buttonRemove")}
                </button>
              </div>
              <TextField
                label={t("fieldSectionTitleLabel")}
                value={sec.title}
                onChange={(v) => updateCustomSection(sec.id, { title: v })}
                maxLength={MAX_CUSTOM_SECTION_TITLE_LEN}
              />
              <TextAreaField
                label={t("fieldSectionContentLabel")}
                help={t("fieldSectionContentHelp")}
                value={sec.body}
                onChange={(v) => updateCustomSection(sec.id, { body: v })}
                maxLength={MAX_CUSTOM_SECTION_BODY_LEN}
                rows={5}
              />
              <SelectField
                label={t("fieldSectionPositionLabel")}
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
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition"
            >
              <Plus className="w-4 h-4" /> {t("buttonAddSection", { current: settings.customSections.length, max: MAX_CUSTOM_SECTIONS })}
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
            {t("buttonResetAll")}
          </button>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 font-semibold">{t("unsavedChanges")}</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold text-sm shadow hover:bg-emerald-600 disabled:opacity-50 transition"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("buttonSaving")}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> {dirty ? t("buttonSaveChanges") : t("buttonAllSaved")}
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
            <Eye className="w-3.5 h-3.5" /> {t("livePreviewLabel")}
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <iframe
              key={previewKey}
              src={previewUrl}
              className="w-full h-[640px] border-0"
              title={t("iframeTitle")}
            />
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">
            {t("previewNote")}
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
          value ? "bg-emerald-500" : "bg-gray-300"
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
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300"
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
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 resize-y"
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
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300"
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

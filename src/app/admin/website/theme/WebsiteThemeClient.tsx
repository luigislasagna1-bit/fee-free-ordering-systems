"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Save, ExternalLink, Palette, Image, Layout, Eye } from "lucide-react";
import { type ThemeSettings, DEFAULT_THEME, parseTheme } from "@/lib/theme";
import { useTranslations } from "next-intl";

const DEFAULTS = DEFAULT_THEME;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
        />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="text-xs font-mono text-gray-500 bg-transparent border-none p-0 focus:outline-none w-24"
        />
      </div>
    </div>
  );
}

export function WebsiteThemeClient({ restaurant }: { restaurant: any }) {
  const t = useTranslations("admin.websiteThemeClient");
  const [theme, setTheme] = useState<ThemeSettings>(parseTheme(restaurant?.themeSettings));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) =>
    setTheme(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeSettings: JSON.stringify(theme) }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("toastSaved"));
    } catch {
      toast.error(t("toastFailed"));
    }
    setSaving(false);
  };

  const previewPrimary: React.CSSProperties = {
    backgroundColor: theme.backgroundColor,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {restaurant?.slug && (
            <a
              href={`/order/${restaurant.slug}`}
              target="_blank"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-500 transition"
            >
              <ExternalLink className="w-4 h-4" /> {t("previewLink")}
            </a>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition text-sm disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {saving ? t("saving") : t("saveTheme")}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Settings panels ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Colors */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide mb-5">
              <Palette className="w-4 h-4" /> {t("sectionColors")}
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <ColorField label={t("colorPrimary")} value={theme.primaryColor} onChange={v => set("primaryColor", v)} />
              <ColorField label={t("colorAccent")} value={theme.accentColor} onChange={v => set("accentColor", v)} />
              <ColorField label={t("colorBackground")} value={theme.backgroundColor} onChange={v => set("backgroundColor", v)} />
              <ColorField label={t("colorCard")} value={theme.cardBackground} onChange={v => set("cardBackground", v)} />
              <ColorField label={t("colorText")} value={theme.textColor} onChange={v => set("textColor", v)} />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setTheme(DEFAULTS)}
                className="text-xs text-gray-400 hover:text-gray-600 transition"
              >
                {t("resetDefaults")}
              </button>
            </div>
          </div>

          {/* Banner */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide mb-5">
              <Image className="w-4 h-4" /> {t("sectionBanner")}
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("bannerHeight")}</label>
                <div className="flex gap-2">
                  {(["sm", "md", "lg"] as const).map(h => (
                    <button
                      key={h}
                      onClick={() => set("bannerHeight", h)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition ${theme.bannerHeight === h ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {h === "sm" ? t("heightSmall") : h === "md" ? t("heightMedium") : t("heightLarge")}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("overlayOpacity", { value: theme.bannerOpacity })}
                </label>
                <input
                  type="range" min={0} max={90} step={5}
                  value={theme.bannerOpacity}
                  onChange={e => set("bannerOpacity", Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{t("opacityTransparent")}</span>
                  <span>{t("opacityDark")}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("imagePosition")}</label>
                <div className="flex gap-2">
                  {(["top", "center", "bottom"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => set("bannerPosition", p)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition capitalize ${theme.bannerPosition === p ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {p === "top" ? t("positionTop") : p === "center" ? t("positionCenter") : t("positionBottom")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Layout */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide mb-5">
              <Layout className="w-4 h-4" /> {t("sectionLayout")}
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("headerLayout")}</label>
                <div className="flex gap-2">
                  {(["left", "center"] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => set("headerLayout", l)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition capitalize ${theme.headerLayout === l ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {l === "left" ? t("headerLeft") : t("headerCentered")}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("menuLayout")}</label>
                <div className="flex gap-2">
                  {(["carousel", "grid", "list"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => set("menuLayout", m)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition ${theme.menuLayout === m ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {m === "carousel" ? t("menuCarousel") : m === "grid" ? t("menuGrid") : t("menuList")}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {t("menuLayoutHint")}
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700">{t("showCategoryImages")}</div>
                    <div className="text-xs text-gray-500">{t("showCategoryImagesHint")}</div>
                  </div>
                  <button
                    onClick={() => set("showCategoryImages", !theme.showCategoryImages)}
                    className={`w-12 h-6 rounded-full transition-colors ${theme.showCategoryImages ? "bg-emerald-500" : "bg-gray-300"}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${theme.showCategoryImages ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>
                {/* Sub-choice (Luigi 2026-07-03, expanded 2026-07-04): how a
                    category WITHOUT its own photo renders. With banners ON
                    there are 4 looks (solid band / plain / button card /
                    modern accent); with banners OFF the band isn't offered
                    (everything is header-style) but plain/button/modern still
                    apply — plain headers "blend in like nothing" (Luigi), so
                    owners can pick a clearly-tappable look. */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <label className="block text-xs font-semibold text-gray-600 mb-2">{t("categoryNoImageStyle")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(theme.showCategoryImages
                      ? (["band", "plain", "button", "modern"] as const)
                      : (["plain", "button", "modern"] as const)
                    ).map((s) => (
                      <button
                        key={s}
                        onClick={() => set("categoryNoImageStyle", s)}
                        className={`py-2 rounded-lg border-2 text-xs font-semibold transition ${theme.categoryNoImageStyle === s ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        {s === "band" ? t("categoryNoImageBand")
                          : s === "plain" ? t("categoryNoImagePlain")
                          : s === "button" ? t("categoryNoImageButton")
                          : t("categoryNoImageModern")}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t("categoryNoImageStyleHint")}</p>
                </div>
              </div>

              {/* Service-restricted dishes: hide vs show-with-label (Fabrizio
                  cmr803ovq). Applies to dishes AND categories that are
                  pickup-only / delivery-only when the customer picked the
                  other service. */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700">{t("serviceRestrictedTitle")}</label>
                <div className="text-xs text-gray-500 mb-2">{t("serviceRestrictedHint")}</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["hide", "label"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => set("serviceRestrictedDisplay", mode)}
                      className={`py-2 rounded-lg border-2 text-xs font-semibold transition ${theme.serviceRestrictedDisplay === mode ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {mode === "hide" ? t("serviceRestrictedHide") : t("serviceRestrictedLabel")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-gray-700">{t("collapsibleCategories")}</div>
                  <div className="text-xs text-gray-500">{t("collapsibleCategoriesHint")}</div>
                </div>
                <button
                  onClick={() => set("mobileCollapsibleCategories", !theme.mobileCollapsibleCategories)}
                  className={`w-12 h-6 rounded-full transition-colors ${theme.mobileCollapsibleCategories ? "bg-emerald-500" : "bg-gray-300"}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${theme.mobileCollapsibleCategories ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-gray-700">{t("reservationFullBg")}</div>
                  <div className="text-xs text-gray-500">{t("reservationFullBgHint")}</div>
                </div>
                <button
                  onClick={() => set("reservationFullBg", !theme.reservationFullBg)}
                  className={`w-12 h-6 rounded-full transition-colors ${theme.reservationFullBg ? "bg-emerald-500" : "bg-gray-300"}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${theme.reservationFullBg ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
              <Eye className="w-4 h-4" /> {t("sectionPreview")}
            </div>
            <div style={previewPrimary}>
              {/* Mini banner preview */}
              <div
                className="relative overflow-hidden flex items-end"
                style={{
                  height: theme.bannerHeight === "sm" ? 80 : theme.bannerHeight === "md" ? 110 : 140,
                  backgroundColor: theme.primaryColor,
                  backgroundImage: restaurant?.bannerUrl ? `url(${restaurant.bannerUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: theme.bannerPosition,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ backgroundColor: `rgba(0,0,0,${theme.bannerOpacity / 100})` }}
                />
                <div
                  className="relative px-3 pb-3 flex items-end gap-2"
                  style={{ width: "100%", justifyContent: theme.headerLayout === "center" ? "center" : "flex-start" }}
                >
                  {restaurant?.logoUrl && (
                    <img src={restaurant.logoUrl} alt="" className="w-10 h-10 rounded-xl border-2 border-white object-cover flex-shrink-0" />
                  )}
                  <div className="text-white text-left">
                    <div className="text-sm font-bold drop-shadow">{restaurant?.name || t("previewRestaurantName")}</div>
                    <div className="text-xs opacity-80">{t("previewSlogan")}</div>
                  </div>
                </div>
              </div>

              {/* Mini category pills */}
              <div className="flex gap-1.5 px-3 py-2 overflow-hidden" style={{ backgroundColor: theme.cardBackground }}>
                {[t("previewCat1"), t("previewCat2"), t("previewCat3")].map((c, i) => (
                  <span
                    key={c}
                    className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0"
                    style={i === 0 ? { backgroundColor: theme.primaryColor, color: "#fff" } : { backgroundColor: theme.backgroundColor, color: theme.textColor, border: "1px solid #e5e7eb" }}
                  >
                    {c}
                  </span>
                ))}
              </div>

              {/* Mini menu items */}
              {theme.menuLayout === "carousel" ? (
                <div className="flex gap-2 px-3 pb-3 overflow-hidden" style={{ backgroundColor: theme.backgroundColor }}>
                  {[t("previewItem1"), t("previewItem2"), t("previewItem3")].map(name => (
                    <div
                      key={name}
                      className="flex-shrink-0 rounded-xl overflow-hidden shadow-sm"
                      style={{ width: 90, backgroundColor: theme.cardBackground, border: "1px solid #e5e7eb" }}
                    >
                      <div style={{ height: 56, backgroundColor: "#f3f4f6" }} />
                      <div className="p-1.5">
                        <div className="text-xs font-semibold truncate" style={{ color: theme.textColor }}>{name}</div>
                        <div className="text-xs" style={{ color: theme.primaryColor }}>$12.99</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : theme.menuLayout === "list" ? (
                /* List (GloriaFood-style): small photo on the LEFT, text on
                   the right — mirrors ListCard on the live page. */
                <div className="flex flex-col gap-2 px-3 pb-3" style={{ backgroundColor: theme.backgroundColor }}>
                  {[t("previewItem1"), t("previewItem2"), t("previewItem3")].map(name => (
                    <div
                      key={name}
                      className="flex items-center gap-2 rounded-xl overflow-hidden shadow-sm p-1.5"
                      style={{ backgroundColor: theme.cardBackground, border: "1px solid #e5e7eb" }}
                    >
                      <div className="flex-shrink-0 rounded-lg" style={{ width: 40, height: 40, backgroundColor: "#f3f4f6" }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate" style={{ color: theme.textColor }}>{name}</div>
                        <div className="text-xs" style={{ color: theme.primaryColor }}>$12.99</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 px-3 pb-3" style={{ backgroundColor: theme.backgroundColor }}>
                  {[t("previewItem1"), t("previewItem2")].map(name => (
                    <div
                      key={name}
                      className="rounded-xl overflow-hidden shadow-sm"
                      style={{ backgroundColor: theme.cardBackground, border: "1px solid #e5e7eb" }}
                    >
                      <div style={{ height: 48, backgroundColor: "#f3f4f6" }} />
                      <div className="p-1.5">
                        <div className="text-xs font-semibold truncate" style={{ color: theme.textColor }}>{name}</div>
                        <div className="text-xs" style={{ color: theme.primaryColor }}>$12.99</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-3 text-center">
              {t("previewNote")} <a href={restaurant?.slug ? `/order/${restaurant.slug}` : "#"} target="_blank" className="text-emerald-500 underline">{t("previewLivePage")}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

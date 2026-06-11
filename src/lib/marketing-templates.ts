/**
 * Marketing Studio flyer templates (Luigi 2026-06-10). Template-based (v1): one
 * clean A-series portrait layout, three colour presets. The owner supplies a
 * headline + subtext + which smart link's QR to embed; branding (logo, name,
 * address, phone) + colours are pulled LIVE at render so a flyer always reflects
 * current branding. (Freeform canvas designer is deferred.)
 */
export type FlyerTemplateId = "bold" | "clean" | "brand";

export type FlyerTheme = {
  id: FlyerTemplateId;
  /** i18n key under admin.marketingStudio for the picker label. */
  nameKey: string;
  /** Background; "BRAND" → use the restaurant's primaryColor. */
  bg: string;
  /** Foreground text colour. */
  fg: string;
  /** Muted/secondary text colour. */
  muted: string;
};

export const FLYER_TEMPLATES: FlyerTheme[] = [
  { id: "bold", nameKey: "tplBold", bg: "#0f172a", fg: "#ffffff", muted: "#94a3b8" },
  { id: "clean", nameKey: "tplClean", bg: "#ffffff", fg: "#0f172a", muted: "#64748b" },
  { id: "brand", nameKey: "tplBrand", bg: "BRAND", fg: "#ffffff", muted: "rgba(255,255,255,0.8)" },
];

export function flyerTheme(id: string): FlyerTheme {
  return FLYER_TEMPLATES.find((t) => t.id === id) ?? FLYER_TEMPLATES[0];
}

export function isFlyerTemplate(id: unknown): id is FlyerTemplateId {
  return typeof id === "string" && FLYER_TEMPLATES.some((t) => t.id === id);
}

/** Resolve a theme's background to a concrete colour (brand → primaryColor). */
export function resolveFlyerBg(theme: FlyerTheme, primaryColor: string): string {
  return theme.bg === "BRAND" ? primaryColor || "#0f172a" : theme.bg;
}

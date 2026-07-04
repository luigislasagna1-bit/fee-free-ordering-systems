export type ThemeSettings = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackground: string;
  textColor: string;
  bannerHeight: "sm" | "md" | "lg";
  bannerOpacity: number;
  bannerPosition: "top" | "center" | "bottom";
  headerLayout: "left" | "center";
  showCategoryImages: boolean;
  /** How a category WITHOUT its own photo renders: "band" = the solid
   *  theme-colour banner (default with banners ON); "plain" = the classic
   *  text-only header; "button" = a clearly-tappable card like the item
   *  cards; "modern" = an accent-bar panel in the theme colour. With
   *  showCategoryImages OFF, "band" renders as "plain" (back-compat — OFF
   *  stores keep the classic look) while button/modern still apply.
   *  Luigi 2026-07-03/04 ("plain headers blend in like nothing"). */
  categoryNoImageStyle: "band" | "plain" | "button" | "modern";
  menuLayout: "carousel" | "grid" | "list";
  /** When true, menu categories collapse into a tappable accordion on MOBILE
   *  (GloriaFood-style) — each category starts collapsed and the customer
   *  expands the ones they want, with Expand all / Collapse all controls.
   *  Desktop is unaffected. Default false (categories always expanded). */
  mobileCollapsibleCategories: boolean;
  /** When true, the standalone reservation page uses the banner photo as a
   *  full-screen background behind the booking card (form floats over a dark
   *  overlay) instead of the default branded hero band at the top. Only takes
   *  effect when a banner is set. Fabrizio cmpxeacks. */
  reservationFullBg: boolean;
};

export const DEFAULT_THEME: ThemeSettings = {
  primaryColor: "#10b981",
  accentColor: "#059669",
  backgroundColor: "#f9fafb",
  cardBackground: "#ffffff",
  textColor: "#111827",
  bannerHeight: "md",
  bannerOpacity: 60,
  bannerPosition: "center",
  headerLayout: "left",
  showCategoryImages: true,
  categoryNoImageStyle: "band",
  menuLayout: "carousel",
  mobileCollapsibleCategories: false,
  reservationFullBg: false,
};

export function parseTheme(raw: string | null | undefined): ThemeSettings {
  try {
    return raw ? { ...DEFAULT_THEME, ...JSON.parse(raw) } : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function bannerHeightPx(h: ThemeSettings["bannerHeight"]): string {
  return h === "sm" ? "160px" : h === "md" ? "224px" : "300px";
}

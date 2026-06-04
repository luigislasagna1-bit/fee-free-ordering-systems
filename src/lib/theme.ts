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
  menuLayout: "carousel" | "grid" | "list";
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
  menuLayout: "carousel",
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

/**
 * Marketing Kit template contract (Luigi 2026-08-14).
 *
 * Templates are rendered by SATORI (via next/og), not by a browser, so they may only use the
 * CSS subset satori implements. `SatoriStyle` below is an allow-list: anything outside it is a
 * TypeScript error at compile time rather than a silently wrong flyer at print time. That
 * matters more than usual here, because satori's failure modes are quiet:
 *
 *   - `containerType` / `cqw` — NOT supported, and NOT an error either. The unit parser falls
 *     through to the raw number, so "9cqw" becomes 9px. This is exactly why
 *     src/app/admin/marketing-studio/FlyerCanvas.tsx cannot be reused: it would render as a
 *     pile of 9-pixel text in the corner of an A4 page with no warning at all.
 *   - `display: grid` — warns and falls back to flex, silently reflowing the design.
 *   - `z-index` — logs "`z-index` is currently not supported" and carries on; stacking is
 *     DOM order only.
 *
 * Two satori DEFAULTS also differ from the browser, so templates set both explicitly on every
 * box (there is a lint-ish test for this in render.test.ts):
 *   - `display` defaults to **flex** (the browser's is `block`)
 *   - `boxSizing` defaults to **border-box** (the browser's is `content-box`)
 */
import type { CSSProperties } from "react";

/**
 * The CSS properties satori actually implements. Verified against the compiled
 * satori bundled in next@16.2.4 (node_modules/next/dist/compiled/@vercel/og).
 * `gap` IS supported — the "no gap in satori" folklore is stale.
 */
export type SatoriStyle = Pick<
  CSSProperties,
  // layout
  | "display" | "flexDirection" | "flexWrap" | "flexGrow" | "flexShrink" | "flexBasis" | "flex"
  | "alignItems" | "alignSelf" | "alignContent" | "justifyContent"
  | "gap" | "rowGap" | "columnGap"
  | "position" | "top" | "right" | "bottom" | "left"
  | "margin" | "marginTop" | "marginRight" | "marginBottom" | "marginLeft"
  | "padding" | "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft"
  | "width" | "height" | "minWidth" | "minHeight" | "maxWidth" | "maxHeight"
  | "boxSizing" | "overflow" | "opacity"
  // paint
  | "backgroundColor" | "backgroundImage" | "backgroundSize" | "backgroundPosition"
  | "backgroundRepeat" | "backgroundClip"
  | "border" | "borderWidth" | "borderColor" | "borderStyle" | "borderRadius"
  | "borderTopLeftRadius" | "borderTopRightRadius"
  | "borderBottomLeftRadius" | "borderBottomRightRadius"
  | "borderTop" | "borderRight" | "borderBottom" | "borderLeft"
  | "boxShadow" | "textShadow" | "filter" | "transform" | "transformOrigin"
  // type
  | "color" | "fontFamily" | "fontSize" | "fontWeight" | "fontStyle"
  | "lineHeight" | "letterSpacing" | "textAlign" | "textTransform"
  | "textOverflow" | "whiteSpace" | "wordBreak" | "textDecoration"
  | "objectFit" | "objectPosition" | "direction"
>;

/** Physical/pixel geometry for one asset, plus unit helpers. */
export interface Geom {
  /** Full canvas in px INCLUDING bleed. */
  w: number;
  h: number;
  /** Trim box in px (what survives the guillotine). */
  trimW: number;
  trimH: number;
  /** Bleed in px on each edge. */
  bleed: number;
  dpi: number;
  /** millimetres → px at this dpi. */
  mm: (n: number) => number;
  /** points → px at this dpi. */
  pt: (n: number) => number;
  /**
   * Design units → px. The design grid is 1000 units wide whatever the physical size, so a
   * template's proportions are written once and hold at every size and dpi.
   */
  u: (n: number) => number;
}

/** Everything a template needs to draw itself. Fully resolved — no fetching inside a template. */
export interface KitRenderContext {
  geom: Geom;
  brand: import("./brand").KitBrand;
  /** Partner-entered contact block. Already trimmed, emoji-stripped and length-capped. */
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  /** Partner copy overrides (headline etc.), already sanitised. */
  overrides: Record<string, string | undefined>;
  /** The QR, already rendered to a data URI. Templates never fetch. */
  qrDataUri: string;
  /** Printable URL line under the QR ("acme.com/signup"). */
  qrCaption: string;
  /** Logo as a data URI, or null when absent/unusable → templates draw a monogram. */
  logoDataUri: string | null;
  /** Locale-resolved copy. `t(key)` never throws; a missing key yields the English fallback. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
  /** True for ar/he — templates must set direction:"rtl" AND mirror their own layout. */
  rtl: boolean;
  /** Optional live pricing rows; empty when the price block is off (the default). */
  priceRows: { label: string; price: string }[];
}

export type KitAudience = "recruit-restaurant" | "diner" | "recruit-partner";

/** Which personalisation inputs a template exposes in the editor. */
export type KitField =
  | "headline" | "subhead" | "offerLine"
  | "contactName" | "contactPhone" | "contactEmail" | "contactWebsite"
  | "accentColor" | "showPricing";

export interface KitSize {
  id: string;
  kind: "print" | "screen";
  /** Trim size. Print sizes are in mm; screen sizes carry px directly. */
  trimMm?: { w: number; h: number };
  px?: { w: number; h: number };
  bleedMm: number;
  dpi: number;
  /** n-up sheet composition, done in pdf-lib — satori only ever renders ONE unit. */
  sheet?: {
    page: "a4p" | "letterp";
    cols: number;
    rows: number;
    marginMm: number;
    marks: "crop" | "none";
  };
}

export interface KitTemplate {
  /** Stable id — part of the render cache key, so never rename one in place. */
  id: string;
  audience: KitAudience;
  /** Size ids this template supports (first is the default). */
  sizes: string[];
  /** i18n namespace root under `resellerKit.templates.` */
  copyKey: string;
  fields: KitField[];
  /** Competitor wordmarks appear → country-gated + globally kill-switchable. */
  hasThirdPartyMarks: boolean;
  /** Prints platform prices → suppressed unless the pricing gate passes. */
  showsPlatformPricing: boolean;
  /**
   * Brand tiers this template may render under. `["platform"]` FORCES platform branding —
   * used by the partner-recruiting asset, where de-branding would imply the applicant is
   * joining the reseller's own programme rather than ours.
   */
  brandTiers: import("./brand").KitBrandTier[];
  render: (ctx: KitRenderContext) => React.ReactElement;
}

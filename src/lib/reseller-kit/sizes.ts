/**
 * Physical sizes for Marketing Kit assets, and the mm/pt/design-unit maths.
 *
 * DPI IS CHOSEN PER SIZE so that NO SINGLE satori canvas exceeds ~4 megapixels. That ceiling
 * is the whole reason n-up sheets are composed in pdf-lib rather than rendered by satori: a
 * 10-up business-card sheet drawn as one A4 canvas at 300 dpi would be 9.1 MP, while the same
 * sheet built from ONE 0.75 MP card image placed ten times is trivial — and its crop marks
 * come out as real vector lines instead of rasterised pixels.
 *
 * Measured on this machine (2026-08-14 spike): A4 + bleed @200 dpi = 1701×2386 = 4.06 MP,
 * 259 ms, 0.09 MB PNG, +7.9 MB RSS. 200 dpi for a full page is a deliberate call — every
 * element is drawn as vector outlines rasterised at 1701 px of real detail (nothing is
 * upscaled), which is comfortably above what office and online print services need.
 */
import type { Geom, KitSize } from "./types";

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

/** Design grid: every template is authored 1000 units wide, whatever the physical size. */
export const DESIGN_WIDTH_UNITS = 1000;

export const KIT_SIZES: Record<string, KitSize> = {
  "a4-portrait": {
    id: "a4-portrait", kind: "print",
    trimMm: { w: 210, h: 297 }, bleedMm: 3, dpi: 200,
  },
  "letter-portrait": {
    id: "letter-portrait", kind: "print",
    trimMm: { w: 215.9, h: 279.4 }, bleedMm: 3, dpi: 200,
  },
  "a5-leavebehind": {
    id: "a5-leavebehind", kind: "print",
    trimMm: { w: 148, h: 210 }, bleedMm: 3, dpi: 250,
  },
  "doorhanger": {
    id: "doorhanger", kind: "print",
    trimMm: { w: 108, h: 279 }, bleedMm: 3, dpi: 250,
  },
  "business-card-back": {
    id: "business-card-back", kind: "print",
    trimMm: { w: 88.9, h: 50.8 }, bleedMm: 3, dpi: 300,
    sheet: { page: "a4p", cols: 2, rows: 5, marginMm: 8, marks: "crop" },
  },
  "sticker-76": {
    id: "sticker-76", kind: "print",
    trimMm: { w: 76, h: 76 }, bleedMm: 2, dpi: 300,
    sheet: { page: "a4p", cols: 2, rows: 3, marginMm: 12, marks: "crop" },
  },
  "table-tent": {
    id: "table-tent", kind: "print",
    trimMm: { w: 102, h: 76 }, bleedMm: 3, dpi: 300,
  },
  "counter-card": {
    id: "counter-card", kind: "print",
    trimMm: { w: 127, h: 178 }, bleedMm: 3, dpi: 250,
  },
  "social-square": {
    id: "social-square", kind: "screen",
    px: { w: 1080, h: 1080 }, bleedMm: 0, dpi: 72,
  },
  "social-story": {
    id: "social-story", kind: "screen",
    px: { w: 1080, h: 1920 }, bleedMm: 0, dpi: 72,
  },
};

export function kitSize(id: string): KitSize | null {
  return KIT_SIZES[id] ?? null;
}

export function isKitSize(id: unknown): id is string {
  return typeof id === "string" && id in KIT_SIZES;
}

/** Build the geometry + unit helpers for a size. */
export function geomFor(size: KitSize): Geom {
  const dpi = size.dpi;
  const mm = (n: number) => Math.round((n / MM_PER_INCH) * dpi);
  const pt = (n: number) => Math.round((n / PT_PER_INCH) * dpi);

  if (size.kind === "screen" && size.px) {
    const { w, h } = size.px;
    return {
      w, h, trimW: w, trimH: h, bleed: 0, dpi, mm, pt,
      u: (n: number) => Math.round((n / DESIGN_WIDTH_UNITS) * w),
    };
  }

  const trim = size.trimMm!;
  const bleed = mm(size.bleedMm);
  const trimW = mm(trim.w);
  const trimH = mm(trim.h);
  const w = trimW + bleed * 2;
  const h = trimH + bleed * 2;
  return {
    w, h, trimW, trimH, bleed, dpi, mm, pt,
    // Design units scale off the TRIM width, not the bleed box, so the same design
    // proportions hold whether or not a size carries bleed.
    u: (n: number) => Math.round((n / DESIGN_WIDTH_UNITS) * trimW),
  };
}

/** Megapixels of a size's full canvas — used by the guard test that enforces the ~4 MP cap. */
export function megapixels(size: KitSize): number {
  const g = geomFor(size);
  return (g.w * g.h) / 1_000_000;
}

/** Page dimensions in PDF points for the n-up sheet pages. */
export const SHEET_PAGES_PT: Record<"a4p" | "letterp", { w: number; h: number }> = {
  a4p: { w: (210 / MM_PER_INCH) * PT_PER_INCH, h: (297 / MM_PER_INCH) * PT_PER_INCH },
  letterp: { w: 8.5 * PT_PER_INCH, h: 11 * PT_PER_INCH },
};

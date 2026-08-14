/**
 * Marketing Kit render core (Luigi 2026-08-14).
 *
 * PNG:  satori (via next/og) renders exactly ONE unit — one flyer, one card, one sticker.
 * PDF:  pdf-lib embeds that same PNG and does all page composition — n-up grids, crop marks,
 *       folds, rotation.
 *
 * The PDF and the PNG are therefore the SAME PIXELS by construction; they cannot drift.
 *
 * ⚠️ NEVER RETURN AN `ImageResponse` DIRECTLY. Its constructor builds a ReadableStream whose
 * start() calls render() with no try/catch, and `super()` sets `content-type: image/png` and
 * the 200 status BEFORE anything renders. Verified on 2026-08-14:
 *
 *     status before reading body: 200 image/png
 *     THREW on arrayBuffer(): u2 is not iterable
 *
 * So a WebP logo, a flaky emoji CDN, or an OOM would all be delivered to the partner as an
 * HTTP 200 containing a corrupt file. Consuming the body with `arrayBuffer()` is what makes
 * the failure catchable — every render in this file goes through renderToPngBuffer().
 */
import { ImageResponse } from "next/og";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import type { KitRenderContext, KitSize, KitTemplate } from "./types";
import { geomFor, SHEET_PAGES_PT, MM_PER_INCH, PT_PER_INCH } from "./sizes";
import { fontsForLocale } from "./fonts";

/** Bump to invalidate every cached render after a template or engine change. */
export const RENDER_ENGINE_VERSION = 1;

export class KitRenderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "KitRenderError";
  }
}

/**
 * Render a satori element to PNG bytes. THE only place ImageResponse is constructed.
 * Consumes the stream so a render failure rejects instead of masquerading as a 200.
 */
export async function renderToPngBuffer(
  element: React.ReactElement,
  width: number,
  height: number,
  locale: string,
): Promise<Buffer> {
  // Walk the tree for its text so the fonts can be subsetted to exactly the glyphs used.
  // This is the single biggest performance lever in the pipeline — see fonts.ts.
  const fonts = await fontsForLocale(locale, collectText(element));
  try {
    const res = new ImageResponse(element, {
      width,
      height,
      // Omit `fonts` entirely when nothing loaded — passing [] makes satori throw.
      ...(fonts.length > 0 ? { fonts } : {}),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("renderer produced an empty image");
    return buf;
  } catch (err) {
    throw new KitRenderError(
      `Failed to render asset (${width}x${height}, locale ${locale})`,
      err,
    );
  }
}

/**
 * Every string in a React element tree, concatenated. Used only to compute which glyphs a
 * render needs; order and duplication don't matter.
 */
export function collectText(node: unknown, depth = 0): string {
  if (depth > 40 || node == null || node === false || node === true) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => collectText(n, depth + 1)).join(" ");
  const el = node as { props?: { children?: unknown } };
  if (el.props && "children" in el.props) return collectText(el.props.children, depth + 1);
  return "";
}

/** Render one template at one size. */
export async function renderAssetPng(
  template: KitTemplate,
  size: KitSize,
  ctx: KitRenderContext,
): Promise<Buffer> {
  const g = geomFor(size);
  return renderToPngBuffer(template.render(ctx), g.w, g.h, ctx.locale);
}

const mmToPt = (n: number) => (n / MM_PER_INCH) * PT_PER_INCH;

/**
 * Wrap a single rendered unit as a one-per-page PDF at its true physical size (bleed
 * included), so a print shop receives a correctly-sized page rather than a scaled image.
 */
export async function wrapPngAsPdf(png: Buffer, size: KitSize): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);

  let wPt: number;
  let hPt: number;
  if (size.kind === "screen" && size.px) {
    // Screen assets have no physical size; map 1px → 1pt so the page is at least sane.
    wPt = size.px.w;
    hPt = size.px.h;
  } else {
    const trim = size.trimMm!;
    wPt = mmToPt(trim.w + size.bleedMm * 2);
    hPt = mmToPt(trim.h + size.bleedMm * 2);
  }

  const page = pdf.addPage([wPt, hPt]);
  page.drawImage(image, { x: 0, y: 0, width: wPt, height: hPt });
  setTrimBox(pdf, page, wPt, hPt, mmToPt(size.bleedMm));
  return Buffer.from(await pdf.save());
}

/**
 * Compose an n-up sheet: ONE embedded image placed cols×rows on a single page, with crop
 * marks drawn as real vector lines in the margin.
 *
 * This is why satori only ever renders one unit. A 10-up business-card sheet rasterised as a
 * single A4 canvas at 300 dpi would be 9.1 MP; built this way the same sheet costs one
 * 0.75 MP render and the marks come out as hairlines rather than pixels. Measured
 * 2026-08-14: 233 ms, 0.01 MB PDF.
 */
export async function composeSheetPdf(png: Buffer, size: KitSize): Promise<Buffer> {
  const sheet = size.sheet;
  if (!sheet) return wrapPngAsPdf(png, size);

  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);
  const pageSize = SHEET_PAGES_PT[sheet.page];
  const page = pdf.addPage([pageSize.w, pageSize.h]);

  const trim = size.trimMm!;
  const bleedPt = mmToPt(size.bleedMm);
  // The image includes bleed on all sides; place it so the TRIM box lands on the grid.
  const cellW = mmToPt(trim.w);
  const cellH = mmToPt(trim.h);
  const imgW = cellW + bleedPt * 2;
  const imgH = cellH + bleedPt * 2;

  const gridW = cellW * sheet.cols;
  const gridH = cellH * sheet.rows;
  const originX = (pageSize.w - gridW) / 2;
  const originY = (pageSize.h - gridH) / 2;

  const markLen = mmToPt(4);
  const markGap = mmToPt(1.5);
  const markColor = rgb(0, 0, 0);
  const markThickness = 0.25;

  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const x = originX + c * cellW;
      const y = originY + r * cellH;
      page.drawImage(image, { x: x - bleedPt, y: y - bleedPt, width: imgW, height: imgH });
    }
  }

  if (sheet.marks === "crop") {
    // Marks go OUTSIDE the grid only, so they never print across a neighbouring card.
    for (let c = 0; c <= sheet.cols; c++) {
      const x = originX + c * cellW;
      drawLine(page, x, originY - markGap, x, originY - markGap - markLen, markColor, markThickness);
      drawLine(page, x, originY + gridH + markGap, x, originY + gridH + markGap + markLen, markColor, markThickness);
    }
    for (let r = 0; r <= sheet.rows; r++) {
      const y = originY + r * cellH;
      drawLine(page, originX - markGap, y, originX - markGap - markLen, y, markColor, markThickness);
      drawLine(page, originX + gridW + markGap, y, originX + gridW + markGap + markLen, y, markColor, markThickness);
    }
  }

  return Buffer.from(await pdf.save());
}

/**
 * Table tent: the same face printed twice on one page, the second rotated 180° so the card
 * reads correctly from both sides once folded, with a dashed fold line between them.
 * Done in pdf-lib rather than satori so we never depend on how satori composes a paint-time
 * transform.
 */
export async function composeTentPdf(png: Buffer, size: KitSize): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);
  const trim = size.trimMm!;
  const faceW = mmToPt(trim.w);
  const faceH = mmToPt(trim.h);
  const page = pdf.addPage([faceW, faceH * 2]);

  // Upright face on the bottom half.
  page.drawImage(image, { x: 0, y: 0, width: faceW, height: faceH });
  // pdf-lib rotates about the given origin, so a 180° placement is offset by (w, h).
  page.drawImage(image, {
    x: faceW,
    y: faceH * 2,
    width: faceW,
    height: faceH,
    rotate: degrees(180),
  });
  drawDashedLine(page, 0, faceH, faceW, faceH);
  return Buffer.from(await pdf.save());
}

type AnyPage = ReturnType<PDFDocument["addPage"]>;

function drawLine(
  page: AnyPage, x1: number, y1: number, x2: number, y2: number,
  color: ReturnType<typeof rgb>, thickness: number,
) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

function drawDashedLine(page: AnyPage, x1: number, y1: number, x2: number, y2: number) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    color: rgb(0.7, 0.7, 0.7),
    thickness: 0.5,
    dashArray: [4, 4],
  });
}

/**
 * Tag the page's TrimBox/BleedBox so a print shop's imposition software knows where the cut
 * line is. Best-effort: pdf-lib exposes this only through the raw object graph, so a failure
 * here must never cost the partner their download.
 */
function setTrimBox(pdf: PDFDocument, page: AnyPage, wPt: number, hPt: number, bleedPt: number) {
  if (bleedPt <= 0) return;
  try {
    const ctx = pdf.context;
    const trim = ctx.obj([bleedPt, bleedPt, wPt - bleedPt, hPt - bleedPt]);
    const bleedBox = ctx.obj([0, 0, wPt, hPt]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (page as any).node;
    node.set(ctx.obj("TrimBox"), trim);
    node.set(ctx.obj("BleedBox"), bleedBox);
  } catch {
    /* Nice-to-have only — the page is still the right physical size without it. */
  }
}

/** Build the PDF appropriate to a size: n-up sheet, folded tent, or a single page. */
export async function buildPdf(png: Buffer, size: KitSize): Promise<Buffer> {
  if (size.sheet) return composeSheetPdf(png, size);
  if (size.id === "table-tent") return composeTentPdf(png, size);
  return wrapPngAsPdf(png, size);
}

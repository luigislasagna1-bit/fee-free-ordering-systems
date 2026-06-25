/**
 * Shared response builder for /api/admin/reports/[section]/export endpoints.
 *
 * Every export endpoint runs the same query the report page renders,
 * formats the result as a 2D array of CsvCells, and hands it off here
 * to be serialized + wrapped in a NextResponse with the right headers.
 *
 * Keeping this in one place means:
 *   - All exports get the UTF-8 BOM (Excel-compatible) automatically.
 *   - Filename convention (`<slug>-<report>-<from>-<to>.<ext>`) is
 *     enforced in one spot — change it here, every export follows.
 *   - The XLS-vs-CSV switch is reduced to a query param the user
 *     picks in the ExportMenu, with no per-route branching.
 *
 * Auth + restaurant-scope checks are NOT inside this helper — every
 * export route MUST verify `getSessionUser().restaurantId` itself
 * before calling here. The helper trusts the caller has already
 * validated authority.
 */

import { NextResponse } from "next/server";
import { toCsv, csvFilename, type CsvCell } from "@/lib/reports/csv";

export interface ExportPayload {
  /** Restaurant slug for the filename — e.g. "luigis-lasagna-pizzeria". */
  restaurantSlug: string;
  /** Short slug for THIS report — e.g. "sales-trend" — also lands in
   *  the filename. Keep stable; restaurants will save the files with
   *  these names. */
  reportSlug: string;
  /** Inclusive date-range start, used in the filename + a header row
   *  comment so the downloaded file is self-describing. */
  fromISO: string;
  /** Inclusive date-range end. */
  toISO: string;
  /** "xls", "csv", or "pdf". CSV/XLS share the same CSV body downloaded
   *  as a file (Excel happily opens a .xls that's actually CSV). "pdf"
   *  instead returns a print-ready HTML view that auto-opens the browser
   *  print dialog → "Save as PDF" — so the same `rows` become a PDF with
   *  the user's own system fonts (every script renders, no font bundling). */
  format: "csv" | "xls" | "pdf";
  /** First row should be the column headers; subsequent rows are data. */
  rows: CsvCell[][];
  /** Optional metadata lines prepended above the headers (e.g. "Range:
   *  May 19 - May 25" / "Generated: 2026-05-25 18:00"). Each entry
   *  becomes a one-cell row at the top of the file. Useful for
   *  audit trails when emails contain the export. */
  metadata?: string[];
}

/** Serialize the payload to a downloadable CSV/XLS response (or a
 *  print-ready HTML view for PDF). */
export function buildExportResponse(payload: ExportPayload): NextResponse {
  if (payload.format === "pdf") return buildPrintableHtmlResponse(payload);

  const allRows: CsvCell[][] = [];
  if (payload.metadata) {
    for (const m of payload.metadata) allRows.push([m]);
    allRows.push([]); // blank row separator between metadata and data
  }
  for (const row of payload.rows) allRows.push(row);

  const body = toCsv(allRows);
  const filename = csvFilename({
    restaurantSlug: payload.restaurantSlug,
    reportSlug: payload.reportSlug,
    fromISO: payload.fromISO,
    toISO: payload.toISO,
    ext: payload.format,
  });
  // Excel for Windows wants application/vnd.ms-excel for .xls; using
  // text/csv for .csv keeps Mac Numbers + Google Sheets happy.
  const contentType = payload.format === "xls"
    ? "application/vnd.ms-excel; charset=utf-8"
    : "text/csv; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Reports never want to be cached — fresh data per click.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/** Read `?format=` from the URL, defaulting to "csv". The ExportMenu
 *  always sets one explicitly, but defensive default keeps direct
 *  link-sharing from breaking. */
export function pickFormat(url: URL): "csv" | "xls" | "pdf" {
  const v = url.searchParams.get("format");
  return v === "xls" ? "xls" : v === "pdf" ? "pdf" : "csv";
}

/** Escape a value for safe interpolation into HTML. */
function escHtml(v: CsvCell): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Does this cell read as a number (so it should right-align)? Tolerates
 *  currency symbols, thousands separators, %, and parenthesised negatives. */
function isNumericCell(v: CsvCell): boolean {
  const s = String(v ?? "").trim();
  if (!s) return false;
  const stripped = s.replace(/[\s,%()$€£¥₹\-+]/g, "").replace(/[A-Za-z]{1,3}\$?/g, (m) => (/^\d/.test(m) ? m : ""));
  return /^\d+(\.\d+)?$/.test(stripped);
}

/**
 * Build a print-ready HTML document from the SAME `rows` the CSV export uses.
 *
 * Why HTML→print instead of a server-generated PDF: the report data (customer
 * names, item names) and the column headers can be in ANY of our 38 locales'
 * scripts — Arabic, Hebrew, CJK, Thai, Devanagari, … A server PDF would need
 * every script's font bundled + RTL shaping. Letting the browser print → "Save
 * as PDF" reuses the user's own system fonts, so every script renders correctly
 * with zero font bundling, and the full (unpaginated) dataset is included.
 *
 * The view auto-opens the print dialog on load; a visible button is the
 * fallback if the browser blocks programmatic printing.
 */
function buildPrintableHtmlResponse(payload: ExportPayload): NextResponse {
  const meta = payload.metadata ?? [];
  const title = meta[0] ?? payload.reportSlug;
  const subLines = meta.slice(1);
  const rows = payload.rows;
  const headerRow = rows[0] ?? [];
  const bodyRows = rows.slice(1);

  const thead = headerRow.length
    ? `<thead><tr>${headerRow.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr></thead>`
    : "";
  const tbody = `<tbody>${bodyRows
    .map((r) => {
      const isTotal = String(r[0] ?? "").trim().toLowerCase() === "total";
      const cells = r.map((c) => `<td class="${isNumericCell(c) ? "num" : ""}">${escHtml(c)}</td>`).join("");
      return `<tr${isTotal ? ' class="total"' : ""}>${cells}</tr>`;
    })
    .join("")}</tbody>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 32px; }
  .toolbar { margin: 0 0 20px; }
  .toolbar button { font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: 1px solid #047857; background: #059669; color: #fff; cursor: pointer; }
  .toolbar button:hover { background: #047857; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .sub { color: #6b7280; font-size: 12px; margin: 1px 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 18px; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; white-space: nowrap; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #f3f4f6; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  @media print {
    body { margin: 0; }
    .toolbar { display: none; }
    @page { margin: 14mm; }
  }
</style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
  <h1>${escHtml(title)}</h1>
  ${subLines.map((s) => `<div class="sub">${escHtml(s)}</div>`).join("\n  ")}
  <table>${thead}${tbody}</table>
  <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},300);});</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

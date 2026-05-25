/**
 * Tiny dependency-free CSV writer for the Reports system.
 *
 * We deliberately don't pull in papaparse or xlsx — every report
 * exports the same flat tabular shape (rows of cells, header row at
 * the top), and the GloriaFood UI offers Export XLS / Export CSV
 * both. Their "XLS" is just a CSV with a .xls extension in practice
 * (Excel happily opens CSV); we match that behavior to keep our
 * bundle small.
 *
 * If we ever need true XLSX (multi-sheet, formulas, formatting) we'll
 * swap in `exceljs` here behind the same `toCsv` signature.
 */

export type CsvCell = string | number | boolean | null | undefined | Date;

export interface CsvOptions {
  /** Column delimiter. Defaults to "," — switch to ";" for European
   *  Excel locales that don't honor sep= hints. */
  delimiter?: string;
  /** When true, prepend the UTF-8 BOM so Excel detects encoding
   *  correctly for non-ASCII characters (é, ñ, ü, emoji). Default true
   *  since our restaurants frequently have accented menu names. */
  bom?: boolean;
}

/**
 * Serialize a 2D array of cells into a CSV string.
 *   - The first row should be the headers.
 *   - Cells with a delimiter, quote, or newline are quoted, with inner
 *     quotes doubled per RFC 4180.
 *   - `Date` values render as ISO 8601 in UTC (Excel parses these
 *     reliably across locales — the user's restaurant TZ is encoded
 *     in the display formatting on the report page itself, not in the
 *     export).
 *   - `null` / `undefined` render as empty cells.
 *   - `boolean` renders as "true"/"false".
 */
export function toCsv(rows: CsvCell[][], opts: CsvOptions = {}): string {
  const delim = opts.delimiter ?? ",";
  const bom = opts.bom !== false;
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(row.map((cell) => formatCell(cell, delim)).join(delim));
  }
  // Excel is strict about CRLF; using \r\n keeps Windows / Mac / Linux
  // Excel all happy. Trailing newline is optional but customary.
  const body = lines.join("\r\n") + "\r\n";
  return (bom ? "﻿" : "") + body;
}

function formatCell(cell: CsvCell, delim: string): string {
  if (cell === null || cell === undefined) return "";
  let s: string;
  if (cell instanceof Date) {
    s = cell.toISOString();
  } else if (typeof cell === "boolean") {
    s = cell ? "true" : "false";
  } else if (typeof cell === "number") {
    // Format finite numbers using locale-neutral string. Infinity/NaN
    // become empty cells (Excel chokes on them in CSV anyway).
    if (!isFinite(cell)) return "";
    s = String(cell);
  } else {
    s = cell;
  }
  // Quote when the cell contains the delimiter, a quote, CR, or LF.
  // Inner quotes are doubled per RFC 4180.
  if (s.includes(delim) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a sensible default filename for an export. Pattern:
 *   "<restaurant-slug>-<report>-<from>-<to>.csv"
 * e.g. "luigis-lasagna-pizzeria-sales-trend-2026-05-19-2026-05-25.csv"
 *
 * Slug is lowercased + non-alphanumerics replaced with "-" so the
 * file is safe to download on Windows / macOS / Linux.
 */
export function csvFilename(parts: {
  restaurantSlug: string;
  reportSlug: string;
  fromISO: string;
  toISO: string;
  ext?: "csv" | "xls";
}): string {
  const ext = parts.ext ?? "csv";
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${safe(parts.restaurantSlug)}-${safe(parts.reportSlug)}-${parts.fromISO}-${parts.toISO}.${ext}`;
}

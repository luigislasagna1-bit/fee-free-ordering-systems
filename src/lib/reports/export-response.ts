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
  /** "xls" or "csv". Affects the filename extension + Content-Type.
   *  Both formats use the same CSV body — Excel happily opens a .xls
   *  that's actually CSV. We match GloriaFood's behavior here. */
  format: "csv" | "xls";
  /** First row should be the column headers; subsequent rows are data. */
  rows: CsvCell[][];
  /** Optional metadata lines prepended above the headers (e.g. "Range:
   *  May 19 - May 25" / "Generated: 2026-05-25 18:00"). Each entry
   *  becomes a one-cell row at the top of the file. Useful for
   *  audit trails when emails contain the export. */
  metadata?: string[];
}

/** Serialize the payload to a downloadable CSV/XLS response. */
export function buildExportResponse(payload: ExportPayload): NextResponse {
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
export function pickFormat(url: URL): "csv" | "xls" {
  const v = url.searchParams.get("format");
  return v === "xls" ? "xls" : "csv";
}

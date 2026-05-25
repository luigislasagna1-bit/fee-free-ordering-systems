"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

/**
 * Bottom-right Export trigger on every report. Matches the GloriaFood
 * Promotions Stats screenshot: a small download-icon button that pops
 * up "Export XLS" and "Export CSV" choices.
 *
 * The actual CSV is built on the SERVER (the report page knows its
 * data shape) and exposed as `/api/admin/reports/<route>/export?...`.
 * This component just wires the two download links — the server route
 * sets the right `Content-Disposition` and `Content-Type` so the
 * browser saves with a sensible filename.
 *
 * Why both XLS and CSV when our XLS is really just CSV with a .xls
 * extension? Owners are split — some have Excel set to default-open
 * .csv as plain text, others have it intercept .xls. Offering both
 * matches the GloriaFood UX and saves a support ticket.
 */
export function ExportMenu({
  /** Server endpoint that returns the CSV body. The component appends
   *  `?format=csv` or `?format=xls` and any query params the user
   *  currently has set (date range, view mode, etc) get preserved
   *  by the caller — the menu itself doesn't add them. */
  exportUrl,
  /** Search-param string from the current page (e.g. "preset=last_7"),
   *  forwarded verbatim so the export honors the active filters. */
  currentQuery,
  /** When true, render the trigger as a small icon-only button (the
   *  default — matches GloriaFood). When false, render with a label
   *  for places where there's room. */
  compact = true,
}: {
  exportUrl: string;
  currentQuery: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Compose the export URL with the current filters + chosen format.
  const buildHref = (format: "csv" | "xls") => {
    const sp = new URLSearchParams(currentQuery);
    sp.set("format", format);
    return `${exportUrl}?${sp.toString()}`;
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? "w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-300 transition"
        }
        aria-label="Export"
        title="Export"
      >
        <Download className="w-4 h-4" />
        {!compact && "Export"}
      </button>

      {open && (
        // Pops UP and to the LEFT so it doesn't fall off the right edge
        // of the report card on small screens. Matches the GloriaFood
        // placement (their menu appears above the icon).
        <div className="absolute right-0 bottom-full mb-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-36 overflow-hidden">
          <a
            href={buildHref("xls")}
            download
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            onClick={() => setOpen(false)}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            Export XLS
          </a>
          <a
            href={buildHref("csv")}
            download
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            onClick={() => setOpen(false)}
          >
            <FileText className="w-4 h-4 text-blue-500" />
            Export CSV
          </a>
        </div>
      )}
    </div>
  );
}

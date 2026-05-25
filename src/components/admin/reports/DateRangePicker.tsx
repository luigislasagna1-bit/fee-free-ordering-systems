"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { toISODate, formatRangeLabel, parseDateRange, type Preset } from "@/lib/reports/date-range";

/**
 * Top-right date-range selector that every report page shares.
 *
 * Behavior matches the GloriaFood screenshots:
 *   - One trigger button on the page header showing the current range.
 *   - Popover with the three "Last N days" presets + a Custom option.
 *   - Custom opens a two-month side-by-side calendar with Apply / Cancel.
 *   - "Show previous period" toggle next to the picker (the dashed
 *     comparison line) is a SEPARATE component because not every report
 *     supports it (e.g. Connectivity Health doesn't).
 *
 * State lives in the URL (?preset=last_7 / ?preset=custom&from=...&to=...)
 * so the picker survives refresh + share-links. The picker reads its
 * initial state from `searchParams` via the same parser the server
 * components use — no client/server drift.
 */
export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Re-parse from query string on every render so back/forward navigation
  // updates the displayed range without a manual sync.
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => { params[k] = v; });
  const current = parseDateRange(params);

  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Outside-click close. Custom panel stays open while picking dates;
  // it closes on Apply/Cancel or when the user clicks Outside.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  /** Apply a preset and close the popover. */
  const applyPreset = (preset: Exclude<Preset, "custom">) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("preset", preset);
    sp.delete("from");
    sp.delete("to");
    router.push(`${pathname}?${sp.toString()}`);
    setOpen(false);
    setShowCustom(false);
  };

  /** Apply a custom range and close the popover. */
  const applyCustom = (from: Date, to: Date) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("preset", "custom");
    sp.set("from", toISODate(from));
    sp.set("to", toISODate(to));
    router.push(`${pathname}?${sp.toString()}`);
    setOpen(false);
    setShowCustom(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span>{formatRangeLabel(current)}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && !showCustom && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg w-56 overflow-hidden">
          {[
            { key: "last_7",  label: "Last 7 days" },
            { key: "last_14", label: "Last 14 days" },
            { key: "last_28", label: "Last 28 days" },
          ].map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key as Exclude<Preset, "custom">)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${
                current.preset === p.key ? "text-emerald-600 font-semibold" : "text-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="border-t border-gray-100" />
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${
              current.preset === "custom" ? "text-emerald-600 font-semibold" : "text-gray-700"
            }`}
          >
            Custom range…
          </button>
        </div>
      )}

      {open && showCustom && (
        <CustomRangePanel
          initialFrom={current.from}
          initialTo={current.to}
          onCancel={() => { setShowCustom(false); }}
          onApply={applyCustom}
        />
      )}
    </div>
  );
}

/**
 * Two-month side-by-side calendar matching the GloriaFood screenshot.
 * Week starts Monday (the screenshot's column order Mon-Sun).
 *
 * Selection rules:
 *   1. First click sets `from` and clears `to`.
 *   2. Second click sets `to` if it's >= from, otherwise swaps and uses
 *      the click as the new `from`.
 *   3. Hovering between clicks previews the range with a lighter
 *      highlight (omitted for keyboard simplicity — pure click model).
 *   4. Apply submits the range; Cancel closes without changing the URL.
 */
function CustomRangePanel({
  initialFrom,
  initialTo,
  onCancel,
  onApply,
}: {
  initialFrom: Date;
  initialTo: Date;
  onCancel: () => void;
  onApply: (from: Date, to: Date) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfMonth(initialFrom));
  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);

  const handleClick = (d: Date) => {
    if (!from || (from && to)) {
      // Start a new range.
      setFrom(d);
      setTo(null);
      return;
    }
    // We have a `from` and no `to` — second click completes the range.
    if (d.getTime() < from.getTime()) {
      // Backwards click → reset `from` to the new earlier date.
      setFrom(d);
      setTo(null);
      return;
    }
    setTo(d);
  };

  const next = new Date(anchor);
  next.setMonth(next.getMonth() + 1);

  return (
    <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-[640px] max-w-[calc(100vw-32px)]">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => {
            const prev = new Date(anchor);
            prev.setMonth(prev.getMonth() - 1);
            setAnchor(prev);
          }}
          className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded text-sm"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="flex gap-12">
          <div className="text-sm font-semibold text-gray-700">{monthLabel(anchor)}</div>
          <div className="text-sm font-semibold text-gray-700">{monthLabel(next)}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            const n = new Date(anchor);
            n.setMonth(n.getMonth() + 1);
            setAnchor(n);
          }}
          className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded text-sm"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <MonthGrid month={anchor}  from={from} to={to} onClick={handleClick} />
        <MonthGrid month={next}    from={from} to={to} onClick={handleClick} />
      </div>

      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!from || !to}
          onClick={() => from && to && onApply(from, to)}
          className="px-3 py-1.5 text-sm bg-emerald-500 text-white font-semibold rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function MonthGrid({
  month, from, to, onClick,
}: {
  month: Date;
  from: Date | null;
  to: Date | null;
  onClick: (d: Date) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstOfMonth = new Date(year, m, 1);
  // Week starts Monday — convert JS getDay() (Sun=0) so Monday=0.
  const startCol = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map((d) => (
          <div key={d} className="text-[10px] font-semibold text-gray-400 text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const inRange = !!(from && to && cell.getTime() >= from.getTime() && cell.getTime() <= to.getTime());
          const isFrom = !!(from && sameDay(cell, from));
          const isTo   = !!(to   && sameDay(cell, to));
          const endpoint = isFrom || isTo;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onClick(cell)}
              className={[
                "text-xs h-8 w-full rounded transition",
                endpoint
                  ? "bg-emerald-500 text-white font-semibold"
                  : inRange
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

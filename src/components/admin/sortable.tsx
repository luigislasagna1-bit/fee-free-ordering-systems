"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

/**
 * Shared click-to-sort primitives for admin tables (Luigi 2026-07-19:
 * "sort things by clicking on a title, like Luigi Bucks — the ENTIRE
 * admin panel").
 *
 * Design rules, applied everywhere so every table feels identical:
 *   - Click a header: ascending → descending → back to the page's
 *     natural order (third click clears).
 *   - Nulls/blanks sort LAST in either direction (a guest with no
 *     signup date never floats above real dates).
 *   - Strings compare locale-aware + numeric ("#12" < "#100"); ISO date
 *     strings compare correctly as plain strings.
 *   - Purely client-side: for lists that already ship all rows to the
 *     browser (the dominant admin pattern). Server-paged lists need
 *     query-param sorting instead — do NOT bolt this on there.
 *
 * No new i18n: the affordance is the icon + aria-sort attribute.
 */

export type SortDir = "asc" | "desc";
export type SortValue = string | number | boolean | null | undefined;
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

export function useSortableRows<T>(rows: T[], accessors: SortAccessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // Latest accessors via ref so callers can declare them inline without
  // re-sorting every render (identity-stable deps below).
  const accRef = useRef(accessors);
  accRef.current = accessors;

  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else setSortKey(null);
  };

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const acc = accRef.current[sortKey];
    if (!acc) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      const aBlank = av == null || av === "";
      const bBlank = bv == null || bv === "";
      if (aBlank && bBlank) return 0;
      if (aBlank) return 1; // blanks last, both directions
      if (bBlank) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (typeof av === "boolean" && typeof bv === "boolean") return ((av ? 1 : 0) - (bv ? 1 : 0)) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggleSort };
}

/** A sortable <th>. Renders a button with the active-direction arrow (or a
 *  muted both-ways arrow when inactive) and the correct aria-sort. */
export function SortableTh({ label, sortId, sortKey, sortDir, onToggle, className }: {
  label: React.ReactNode;
  sortId: string;
  sortKey: string | null;
  sortDir: SortDir;
  onToggle: (key: string) => void;
  className?: string;
}) {
  const active = sortKey === sortId;
  return (
    <th
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={className ?? "text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase"}
    >
      <button
        type="button"
        onClick={() => onToggle(sortId)}
        className={`inline-flex items-center gap-1 uppercase transition ${active ? "text-gray-900" : "hover:text-gray-700"}`}
      >
        {label}
        {active
          ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
}

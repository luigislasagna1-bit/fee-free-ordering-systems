"use client";
import { useTranslations, useLocale } from "next-intl";
import { Eye, EyeOff, CalendarClock } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";

/**
 * GloriaFood-style scheduled-visibility editor, shared by the menu item and
 * category modals (Luigi 2026-06-12). Emits a `visibility` payload the menu
 * API understands (see lib/menu-visibility.buildVisibilityData):
 *   { mode, until, startDate, endDate, days, from, to }
 *
 * Modes: null (always visible) | hide_from_menu | hide_until |
 *        show_only_from (recurring days+time) | show_from_until (date period).
 */
export type VisibilityValue = {
  mode: string | null;
  until: string | null;       // datetime-local string (hide_until)
  startDate: string | null;   // datetime-local (show_from_until)
  endDate: string | null;
  days: number[] | null;      // show_only_from
  from: string | null;        // "HH:MM"
  to: string | null;
};

export const EMPTY_VISIBILITY: VisibilityValue = {
  mode: null, until: null, startDate: null, endDate: null, days: null, from: null, to: null,
};

/** Build the editor value from a menu item/category row's flat columns. */
export function visibilityFromRow(row: any): VisibilityValue {
  const toLocal = (d: any): string | null => {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    // datetime-local wants "YYYY-MM-DDTHH:MM" in local time.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  let days: number[] | null = null;
  if (row?.visibleDays) {
    try { const a = JSON.parse(row.visibleDays); if (Array.isArray(a)) days = a.map(Number); } catch { /* */ }
  }
  return {
    mode: row?.visibilityMode ?? null,
    until: toLocal(row?.visibleUntil),
    startDate: toLocal(row?.visibleStartDate),
    endDate: toLocal(row?.visibleEndDate),
    days,
    from: row?.visibleFrom ?? null,
    to: row?.visibleTo ?? null,
  };
}

function dowLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, d) => fmt.format(new Date(2023, 0, 1 + d)));
}

export function VisibilityEditor({ value, onChange }: { value: VisibilityValue; onChange: (v: VisibilityValue) => void }) {
  const t = useTranslations("admin.visibilityEditor");
  const locale = useLocale();
  const dayNames = dowLabels(locale);
  const set = (patch: Partial<VisibilityValue>) => onChange({ ...value, ...patch });

  const isHide = value.mode === "hide_from_menu" || value.mode === "hide_until";
  const isShow = value.mode === "show_only_from" || value.mode === "show_from_until";
  const days = value.days ?? [0, 1, 2, 3, 4, 5, 6];
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    set({ days: next.length === 7 ? null : next });
  };
  const input = "border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <label className="block text-sm font-medium text-gray-700">{t("title")}</label>
        <HelpTip text={t("help")} />
      </div>

      {/* Top-level choice: Always / Hide / Show */}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => set({ mode: null })}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-sm font-medium transition ${!value.mode ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
          <Eye className="w-4 h-4" /> {t("always")}
        </button>
        <button type="button" onClick={() => set({ mode: "hide_from_menu" })}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-sm font-medium transition ${isHide ? "border-rose-400 bg-rose-50 text-rose-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
          <EyeOff className="w-4 h-4" /> {t("hide")}
        </button>
        <button type="button" onClick={() => set({ mode: "show_only_from" })}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-sm font-medium transition ${isShow ? "border-sky-400 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
          <CalendarClock className="w-4 h-4" /> {t("show")}
        </button>
      </div>

      {/* HIDE sub-options */}
      {isHide && (
        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={value.mode === "hide_from_menu"} onChange={() => set({ mode: "hide_from_menu" })} />
            {t("hideFromMenu")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 flex-wrap">
            <input type="radio" checked={value.mode === "hide_until"} onChange={() => set({ mode: "hide_until" })} />
            {t("hideUntil")}
            {value.mode === "hide_until" && (
              <input type="datetime-local" className={input} value={value.until ?? ""} onChange={(e) => set({ until: e.target.value || null })} />
            )}
          </label>
        </div>
      )}

      {/* SHOW sub-options */}
      {isShow && (
        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={value.mode === "show_only_from"} onChange={() => set({ mode: "show_only_from" })} />
            {t("showOnlyFrom")}
          </label>
          {value.mode === "show_only_from" && (
            <div className="pl-6 space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {dayNames.map((label, d) => (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${days.includes(d) ? "bg-sky-500 border-sky-500 text-white" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">{t("from")}</span>
                <input type="time" className={input} value={value.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} />
                <span className="text-xs text-gray-500">{t("to")}</span>
                <input type="time" className={input} value={value.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} />
                <span className="text-[11px] text-gray-400">{t("timeOptional")}</span>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={value.mode === "show_from_until"} onChange={() => set({ mode: "show_from_until" })} />
            {t("showFromUntil")}
          </label>
          {value.mode === "show_from_until" && (
            <div className="pl-6 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">{t("from")}</span>
              <input type="datetime-local" className={input} value={value.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || null })} />
              <span className="text-xs text-gray-500">{t("to")}</span>
              <input type="datetime-local" className={input} value={value.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || null })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

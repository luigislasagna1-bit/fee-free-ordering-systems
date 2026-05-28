"use client";
import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { Save, Clock, Copy, Calendar, Plus, Trash2, Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatHour } from "@/lib/restaurant-hours";

/**
 * Opening Hours admin.
 *
 * Features (added 2026-05-24 after UAT):
 *   - 12h vs 24h display format toggle (saved on Restaurant.hoursFormat).
 *     Underlying storage is ALWAYS 24h HH:MM; this only flips RENDER.
 *   - "Copy to all days" bulk-set: pick a day, copy its hours to every
 *     other day in one click. Optionally also overwrite only the days
 *     currently marked closed (the common "weekend = different hours,
 *     weekdays = identical" pattern).
 *   - Overnight hours: each day row has a "closes next day" toggle that
 *     re-interprets closeTime as belonging to the following calendar
 *     day. Used by bars / late-night spots that open 5pm → 2am.
 *   - Holidays: separate section for one-off date closures. The
 *     restaurant is treated as closed regardless of the weekly schedule
 *     on those dates. Past dates auto-prune from view.
 */

type HoursRow = {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  closesNextDay?: boolean;
};

type Holiday = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string | null;
};

type Format = "12h" | "24h";

export function HoursClient({
  hours: initial,
  hoursFormat: initialFormat,
  holidays: initialHolidays,
}: {
  hours: HoursRow[];
  hoursFormat: Format;
  holidays: Holiday[];
}) {
  const tSidebar = useTranslations("admin.sidebar");
  const tHours = useTranslations("admin.hours");
  const tInfo = useTranslations("info");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");

  const [format, setFormat] = useState<Format>(initialFormat);
  const [hours, setHours] = useState<HoursRow[]>(
    [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const found = initial.find((h) => h.dayOfWeek === i);
      return found
        ? {
            dayOfWeek: i,
            isOpen: found.isOpen,
            openTime: found.openTime,
            closeTime: found.closeTime,
            closesNextDay: !!found.closesNextDay,
          }
        : { dayOfWeek: i, isOpen: false, openTime: "09:00", closeTime: "21:00", closesNextDay: false };
    }),
  );
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState<number | null>(null);

  function update<K extends keyof HoursRow>(day: number, field: K, value: HoursRow[K]) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === day ? { ...h, [field]: value } : h)));
  }

  /**
   * Copy one day's hours to every other day. If scopeClosed is true,
   * only overwrite days currently marked closed — useful for "I have
   * Mon-Fri the same and weekend custom" pattern.
   */
  function copyFromDay(sourceDay: number, scope: "all" | "closed_only") {
    const src = hours.find((h) => h.dayOfWeek === sourceDay);
    if (!src) return;
    setHours((prev) =>
      prev.map((h) => {
        if (h.dayOfWeek === sourceDay) return h;
        if (scope === "closed_only" && h.isOpen) return h;
        return {
          ...h,
          isOpen: src.isOpen,
          openTime: src.openTime,
          closeTime: src.closeTime,
          closesNextDay: !!src.closesNextDay,
        };
      }),
    );
    setBulkMenuOpen(null);
    toast.success(
      scope === "all"
        ? `Copied ${dayLabel(sourceDay)} to all other days`
        : `Copied ${dayLabel(sourceDay)} to closed days`,
    );
  }

  function dayLabel(dow: number) {
    try {
      return tInfo(`days.${dow}` as never);
    } catch {
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
    }
  }

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/restaurants/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, hoursFormat: format }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(tToasts("saved"));
      // Nudge the setup-walkthrough pill to re-evaluate immediately —
      // saving opening hours often completes a required step, and the
      // owner expects the "Next: …" pill to advance within a beat.
      try { window.dispatchEvent(new Event("ffo:setup-progress-changed")); } catch { /* noop */ }
    } catch {
      toast.error(tToasts("saveFailed"));
    }
    setLoading(false);
  }

  async function addHoliday() {
    if (!newHolidayDate) return;
    setLoading(true);
    try {
      const res = await fetch("/api/restaurants/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newHolidayDate, name: newHolidayName }),
      });
      if (!res.ok) throw new Error("Failed");
      const { holiday } = await res.json();
      setHolidays((prev) => {
        const filtered = prev.filter((h) => h.id !== holiday.id);
        return [
          ...filtered,
          {
            id: holiday.id,
            date: typeof holiday.date === "string" ? holiday.date.slice(0, 10) : new Date(holiday.date).toISOString().slice(0, 10),
            name: holiday.name,
          },
        ].sort((a, b) => a.date.localeCompare(b.date));
      });
      setNewHolidayDate("");
      setNewHolidayName("");
      toast.success("Holiday added");
    } catch {
      toast.error("Failed to add holiday");
    }
    setLoading(false);
  }

  async function removeHoliday(id: string) {
    try {
      const res = await fetch(`/api/restaurants/holidays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  }

  // Today's calendar date (for the min= attr on the holiday picker —
  // adding a holiday in the past is meaningless).
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{tSidebar("openingHours")}</h1>
        <div className="flex items-center gap-3">
          {/* 12h / 24h toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFormat("12h")}
              className={
                format === "12h"
                  ? "px-3 py-1.5 bg-emerald-500 text-white"
                  : "px-3 py-1.5 text-gray-700 hover:bg-gray-50"
              }
            >
              12h (1:00 PM)
            </button>
            <button
              type="button"
              onClick={() => setFormat("24h")}
              className={
                format === "24h"
                  ? "px-3 py-1.5 bg-emerald-500 text-white"
                  : "px-3 py-1.5 text-gray-700 hover:bg-gray-50"
              }
            >
              24h (13:00)
            </button>
          </div>
          <button
            onClick={save}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition text-sm disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {loading ? tCommon("loading") : tCommon("saveChanges")}
          </button>
        </div>
      </div>

      {/* Weekly schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          {tInfo("openingHours")}
        </div>
        {hours.map((h) => (
          <div
            key={h.dayOfWeek}
            className="px-4 sm:px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50"
          >
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              <div className="w-20 sm:w-28 font-medium text-gray-900">{dayLabel(h.dayOfWeek)}</div>
              <button
                onClick={() => update(h.dayOfWeek, "isOpen", !h.isOpen)}
                aria-label={h.isOpen ? "Mark closed" : "Mark open"}
                className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                  h.isOpen ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
                    h.isOpen ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
              {h.isOpen ? (
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  {/* <input type="time"> shows AM/PM or 24h based on the
                      browser's locale, not anything the page can directly
                      control. The cleanest cross-browser nudge is the
                      `lang` attribute — Chromium honors en-GB to force
                      24h display, and en-US to force 12h. The internal
                      VALUE is always 24h HH:MM regardless (HTML spec).
                      Safari is locale-bound and ignores lang here, which
                      we accept until we move to a custom picker. */}
                  <input
                    type="time"
                    lang={format === "24h" ? "en-GB" : "en-US"}
                    value={h.openTime}
                    onChange={(e) => update(h.dayOfWeek, "openTime", e.target.value)}
                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-gray-400 text-sm">{tCommon("to")}</span>
                  <input
                    type="time"
                    lang={format === "24h" ? "en-GB" : "en-US"}
                    value={h.closeTime}
                    onChange={(e) => update(h.dayOfWeek, "closeTime", e.target.value)}
                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {/* Format hint — show what they typed in the current display format */}
                  <span className="text-[11px] text-gray-400 hidden sm:inline">
                    ({formatHour(h.openTime, format)} – {formatHour(h.closeTime, format)})
                  </span>
                </div>
              ) : (
                <span className="text-gray-400 text-sm">{tHours("closedDay")}</span>
              )}

              {/* Bulk-apply menu */}
              <div className="ml-auto flex items-center gap-2 relative">
                <button
                  type="button"
                  onClick={() => setBulkMenuOpen(bulkMenuOpen === h.dayOfWeek ? null : h.dayOfWeek)}
                  className="text-gray-500 hover:text-emerald-700 text-xs font-medium inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-emerald-50 transition"
                  title="Copy these hours to other days"
                >
                  <Copy className="w-3.5 h-3.5" /> Apply to…
                </button>
                {bulkMenuOpen === h.dayOfWeek && (
                  <div className="absolute top-full right-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => copyFromDay(h.dayOfWeek, "all")}
                      className="block w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 text-gray-800"
                    >
                      Apply to <strong>all other days</strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyFromDay(h.dayOfWeek, "closed_only")}
                      className="block w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 text-gray-800 border-t border-gray-100"
                    >
                      Apply only to <strong>currently-closed days</strong>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Overnight-hours toggle — only shown when day is open */}
            {h.isOpen && (
              <div className="mt-2 ml-20 sm:ml-32 pl-4 border-l-2 border-gray-100">
                <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!h.closesNextDay}
                    onChange={(e) => update(h.dayOfWeek, "closesNextDay", e.target.checked)}
                    className="rounded text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>
                    Closes <strong>next day</strong>
                  </span>
                  <span className="text-gray-400">
                    (e.g. open until 2 AM the following morning)
                  </span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Holidays */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span className="font-medium text-gray-700">Holidays &amp; one-off closures</span>
          <span className="text-gray-400 text-xs ml-1">
            — restaurant treated as closed on these dates regardless of the weekly schedule
          </span>
        </div>

        {/* Add new */}
        <div className="p-4 border-b border-gray-100 bg-amber-50/40">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Date
              </label>
              <input
                type="date"
                min={todayIso}
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="Christmas Day"
                maxLength={80}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={addHoliday}
              disabled={!newHolidayDate || loading}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* List */}
        {holidays.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            No upcoming holidays. Add one above to close on a specific date.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {holidays.map((h) => (
              <li key={h.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{formatHolidayDate(h.date)}</div>
                  {h.name && <div className="text-xs text-gray-500 mt-0.5">{h.name}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => removeHoliday(h.id)}
                  className="text-gray-400 hover:text-red-600 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition"
                  title="Remove holiday"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "2026-12-25" → "Friday, December 25, 2026" */
function formatHolidayDate(yyyymmdd: string): string {
  try {
    // Parse as local-midnight (NOT UTC) so the date doesn't shift when
    // toLocaleDateString applies the user's zone. The date the user
    // typed into the picker is canonically a calendar date, not an
    // instant.
    const [y, m, d] = yyyymmdd.split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return yyyymmdd;
  }
}

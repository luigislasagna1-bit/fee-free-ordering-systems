"use client";
import { useState, useMemo, useEffect } from "react";
import toast from "react-hot-toast";
import { Save, Clock, Copy, Calendar, Plus, Trash2, Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatHour } from "@/lib/restaurant-hours";

/**
 * Text-based time input that honors the page's 12h/24h preference.
 *
 * Why not <input type="time">: the native time picker's display format is
 * bound to the browser's OS locale (Windows en-US → AM/PM) regardless of
 * any attribute we set on the element. We can't actually honor the user's
 * 12h/24h toggle with the native widget — the lang trick doesn't reliably
 * override the OS setting. So we replace it with a controlled text input.
 *
 * Internal storage stays HH:MM 24h (the same format Restaurant.openTime
 * persists), so nothing downstream changes. The component normalizes the
 * user's typed string on blur:
 *   - "9"        → "09:00"
 *   - "9:5"      → "09:05"
 *   - "21:30"    → "21:30"
 *   - "9pm"      → "21:00" (12h mode)
 *   - "9 pm"     → "21:00"
 *   - garbage    → leaves the previous value
 */
function TimeTextInput({
  value,
  format,
  onChange,
}: {
  value: string;           // HH:MM 24h (canonical)
  format: "12h" | "24h";
  onChange: (next: string) => void;
}) {
  // Local draft so the user can type freely without us re-normalizing
  // their keystroke. Normalized on blur via parseToHHMM.
  const [draft, setDraft] = useState<string>(() => display(value, format));

  // When the canonical value or format flips externally (e.g. user
  // changed days, saved, or toggled 12h↔24h), refresh the draft so
  // we show the right thing.
  useEffect(() => { setDraft(display(value, format)); }, [value, format]);

  function commit() {
    const parsed = parseToHHMM(draft);
    if (parsed) {
      onChange(parsed);
      setDraft(display(parsed, format));
    } else {
      // Bad input — snap back to whatever's saved.
      setDraft(display(value, format));
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder={format === "24h" ? "HH:MM" : "9:00 AM"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-24 sm:w-28 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
    />
  );
}

/** Render canonical HH:MM 24h for display in either format. */
function display(canonical: string, format: "12h" | "24h"): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(canonical);
  if (!m) return canonical;
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (format === "24h") {
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h = h - 12;
  return `${h}:${min} ${ampm}`;
}

/**
 * Parse a free-form time string into HH:MM 24h. Returns null if no
 * confident parse. Accepts:
 *   "9"       → 09:00
 *   "21"      → 21:00
 *   "9:30"    → 09:30
 *   "21:30"   → 21:30
 *   "9pm"     → 21:00
 *   "9:00 PM" → 21:00
 *   "12am"    → 00:00
 *   "12pm"    → 12:00
 */
function parseToHHMM(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return null;
  const m = /^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/i.exec(raw);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] as "AM" | "PM" | undefined;
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (min < 0 || min > 59) return null;
  if (ampm) {
    // 12h mode
    if (h < 1 || h > 12) return null;
    if (ampm === "AM") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else {
    // 24h mode (no AM/PM)
    if (h < 0 || h > 23) return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

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
  hours: (HoursRow & { service?: string | null })[];
  hoursFormat: Format;
  holidays: Holiday[];
}) {
  const tSidebar = useTranslations("admin.sidebar");
  const tHours = useTranslations("admin.hours");
  const tInfo = useTranslations("info");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");

  const [format, setFormat] = useState<Format>(initialFormat);
  // Service-tabbed hours state. "default" = the legacy null-service
  // row set (regular opening hours, used as a fallback for any
  // service without a specific override). pickup/delivery/reservation
  // are optional overrides — they're only persisted when the owner
  // explicitly enables them via the tab UI. GloriaFood-parity.
  type ServiceKey = "default" | "pickup" | "delivery" | "reservation";
  const SERVICE_DB_VALUE: Record<ServiceKey, string | null> = {
    default: null, pickup: "pickup", delivery: "delivery", reservation: "reservation",
  };
  const initialByService: Record<ServiceKey, HoursRow[]> = (() => {
    const out: Record<ServiceKey, HoursRow[]> = {
      default: [], pickup: [], delivery: [], reservation: [],
    };
    for (const key of ["default", "pickup", "delivery", "reservation"] as ServiceKey[]) {
      const dbVal = SERVICE_DB_VALUE[key];
      out[key] = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const found = (initial as any[]).find(
          (h) => h.dayOfWeek === i && (h.service ?? null) === dbVal,
        );
        return found
          ? {
              dayOfWeek: i,
              isOpen: found.isOpen,
              openTime: found.openTime,
              closeTime: found.closeTime,
              closesNextDay: !!found.closesNextDay,
            }
          : { dayOfWeek: i, isOpen: false, openTime: "09:00", closeTime: "21:00", closesNextDay: false };
      });
    }
    return out;
  })();
  const [hoursByService, setHoursByService] = useState<Record<ServiceKey, HoursRow[]>>(initialByService);
  // Active editing tab.
  const [activeTab, setActiveTab] = useState<ServiceKey>("default");
  // Which per-service overrides are "enabled" (have at least one row in
  // the DB on initial load). When disabled, the tab UI is hidden and
  // we don't persist those rows on save.
  const initialEnabledTabs = new Set<ServiceKey>(["default"]);
  for (const key of ["pickup", "delivery", "reservation"] as ServiceKey[]) {
    const dbVal = SERVICE_DB_VALUE[key];
    if ((initial as any[]).some((h) => (h.service ?? null) === dbVal)) initialEnabledTabs.add(key);
  }
  const [enabledTabs, setEnabledTabs] = useState<Set<ServiceKey>>(initialEnabledTabs);
  // Shim: legacy code references `hours` (= the active tab's array).
  const hours = hoursByService[activeTab];
  const setHours = (updater: (prev: HoursRow[]) => HoursRow[]) => {
    setHoursByService((prev) => ({ ...prev, [activeTab]: updater(prev[activeTab]) }));
  };
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState<number | null>(null);

  function update<K extends keyof HoursRow>(day: number, field: K, value: HoursRow[K]) {
    // Writes go into the currently-active tab's rows. Per-service tab
    // changes don't leak into the default tab.
    setHoursByService((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((h) => (h.dayOfWeek === day ? { ...h, [field]: value } : h)),
    }));
  }

  /**
   * Copy one day's hours to every other day. If scopeClosed is true,
   * only overwrite days currently marked closed — useful for "I have
   * Mon-Fri the same and weekend custom" pattern.
   */
  function copyFromDay(sourceDay: number, scope: "all" | "closed_only") {
    const src = hoursByService[activeTab].find((h) => h.dayOfWeek === sourceDay);
    if (!src) return;
    setHoursByService((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((h) => {
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
    }));
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
      // Build the payload: include the active "default" tab rows always,
      // plus any enabled per-service tabs. The API tags each row with
      // its service column so the DB ends up with a per-(service,day)
      // row. Tabs that aren't enabled are NOT sent, so flipping a tab
      // off later would leave stale rows in the DB — out of scope for
      // this initial UI; an explicit "Remove service overrides"
      // button can come later if owners need it.
      const payloadHours: any[] = [];
      for (const key of ["default", "pickup", "delivery", "reservation"] as ServiceKey[]) {
        if (!enabledTabs.has(key)) continue;
        for (const h of hoursByService[key]) {
          payloadHours.push({ ...h, service: SERVICE_DB_VALUE[key] });
        }
      }
      const res = await fetch("/api/restaurants/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: payloadHours, hoursFormat: format }),
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

      {/* Service tabs (Luigi 2026-05-31, GloriaFood parity).
          Default tab is the existing "open hours" set used by any
          service without an override. Pickup/Delivery/Reservation
          are opt-in overrides — owners enable a service by clicking
          its tab, get a fresh-copy editor, and save. The customer
          page falls back to the default row when no override exists. */}
      <div className="flex flex-wrap gap-2 bg-white rounded-xl border border-gray-100 p-2">
        {(["default", "pickup", "delivery", "reservation"] as ServiceKey[]).map((key) => {
          const enabled = enabledTabs.has(key);
          const isActive = activeTab === key;
          const labels: Record<ServiceKey, string> = {
            default: "Default (all services)",
            pickup: "Pickup",
            delivery: "Delivery",
            reservation: "Reservation",
          };
          return (
            <div key={key} className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (!enabled) setEnabledTabs((prev) => new Set(prev).add(key));
                  setActiveTab(key);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? "bg-emerald-500 text-white"
                    : enabled
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-white text-gray-400 border border-dashed border-gray-300 hover:bg-gray-50"
                }`}
              >
                {labels[key]}
                {!enabled && <span className="ml-1.5 opacity-70">+ Add</span>}
              </button>
              {/* Allow removing an override tab (but not default). */}
              {enabled && key !== "default" && (
                <button
                  type="button"
                  onClick={() => {
                    setEnabledTabs((prev) => {
                      const next = new Set(prev);
                      next.delete(key);
                      return next;
                    });
                    if (activeTab === key) setActiveTab("default");
                  }}
                  aria-label={`Remove ${labels[key]} override`}
                  className="ml-1 text-gray-400 hover:text-gray-700 text-xs"
                  title="Remove override (stale rows stay in the DB until you Save with the tab re-enabled)"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Weekly schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          {activeTab === "default"
            ? tInfo("openingHours")
            : `Hours for ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} only`}
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
                  {/* Custom-controlled text inputs instead of the native
                      <input type="time">. The native picker's display
                      format is hard-bound to the OS locale (Windows in
                      en-US → AM/PM) and ignores the lang hint reliably,
                      so we can't actually honor the "24h" toggle with
                      the native widget. Text inputs give us full
                      control: store HH:MM 24h internally, display in
                      the chosen format, normalize on blur. */}
                  <TimeTextInput
                    value={h.openTime}
                    format={format}
                    onChange={(v) => update(h.dayOfWeek, "openTime", v)}
                  />
                  <span className="text-gray-400 text-sm">{tCommon("to")}</span>
                  <TimeTextInput
                    value={h.closeTime}
                    format={format}
                    onChange={(v) => update(h.dayOfWeek, "closeTime", v)}
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

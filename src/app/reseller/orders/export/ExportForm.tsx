"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { EXPORT_FIELDS, DEFAULT_EXPORT_FIELDS, type ExportFieldId } from "@/lib/reseller/export-fields";

/**
 * "Export orders" — mirrors GloriaFood's dedicated export screen: time range,
 * restaurant, type + status checkboxes, a selectable field grid, and a
 * CSV/Excel choice. Submitting hits the export API, which re-derives the same
 * filters server-side (the form is convenience, the route is the authority).
 */
const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7", label: "Last 7 days" },
  { value: "last_14", label: "Last 14 days" },
  { value: "last_28", label: "Last 28 days" },
];

const TYPES = [
  { value: "delivery", label: "Delivery" },
  { value: "pickup", label: "Pickup" },
  { value: "table_reservation", label: "Table reservation" },
  { value: "reservation_preorder", label: "Reservation & Pre-order" },
  { value: "on_premise", label: "On premise" },
  { value: "catering", label: "Catering" },
];

const STATUSES = [
  { value: "accepted", label: "Accepted" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "missed", label: "Missed" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Canceled" },
];

function Check({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "hover:text-gray-900"} text-gray-700`}
    >
      <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-white text-[10px] ${on ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
        {on ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

export function ExportForm({
  restaurants,
  exportUrl,
  backUrl,
}: {
  restaurants: { id: string; name: string }[];
  exportUrl: string;
  backUrl: string;
}) {
  const sp = useSearchParams();
  const [preset, setPreset] = useState(sp.get("preset") || "last_28");
  const [restaurant, setRestaurant] = useState(sp.get("restaurant") || "");
  const [types, setTypes] = useState<string[]>(TYPES.map((t) => t.value));
  const [statuses, setStatuses] = useState<string[]>(STATUSES.map((s) => s.value));
  const [fields, setFields] = useState<ExportFieldId[]>(DEFAULT_EXPORT_FIELDS);
  const [format, setFormat] = useState<"csv" | "xls">("xls");

  const toggle = <T extends string>(list: T[], v: T, set: (n: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const href = (() => {
    const u = new URLSearchParams();
    u.set("preset", preset);
    if (restaurant) u.set("restaurant", restaurant);
    // All types selected = no filter (cheaper query, same result).
    if (types.length > 0 && types.length < TYPES.length) u.set("type", types.join(","));
    // The feed takes a single status; only send one when exactly one is chosen.
    if (statuses.length === 1) u.set("status", statuses[0]);
    u.set("fields", fields.join(","));
    u.set("format", format);
    const q = sp.get("q");
    if (q) u.set("q", q);
    return `${exportUrl}?${u.toString()}`;
  })();

  const col = "space-y-2.5";
  const third = Math.ceil(EXPORT_FIELDS.length / 3);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-4xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Select time</h2>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className="text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white">
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {restaurants.length > 1 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Restaurant</h2>
          <select value={restaurant} onChange={(e) => setRestaurant(e.target.value)} className="text-sm rounded-lg border border-gray-300 px-3 py-2 bg-white min-w-[16rem]">
            <option value="">All restaurants.</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Type</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {TYPES.map((t) => (
            <Check key={t.value} on={types.includes(t.value)} label={t.label} onClick={() => toggle(types, t.value, setTypes)} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Status</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {STATUSES.map((s) => (
            <Check key={s.value} on={statuses.includes(s.value)} label={s.label} onClick={() => toggle(statuses, s.value, setStatuses)} />
          ))}
        </div>
        {statuses.length > 1 && statuses.length < STATUSES.length && (
          <p className="text-xs text-amber-700 mt-2">
            Selecting more than one status exports every status — pick exactly one to filter, or leave them all on.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Select fields</h2>
          <div className="text-sm">
            <button type="button" className="text-sky-600 hover:underline" onClick={() => setFields(EXPORT_FIELDS.map((f) => f.id))}>Select all</button>
            <span className="mx-2 text-gray-300">|</span>
            <button type="button" className="text-sky-600 hover:underline" onClick={() => setFields([])}>Deselect all</button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-2.5">
          {[0, 1, 2].map((c) => (
            <div key={c} className={col}>
              {EXPORT_FIELDS.slice(c * third, (c + 1) * third).map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <Check on={fields.includes(f.id)} label={f.label} onClick={() => toggle(fields, f.id, setFields)} />
                  <span className="text-[10px] text-gray-400">#{EXPORT_FIELDS.findIndex((x) => x.id === f.id) + 1}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Select format</h2>
        <div className="flex gap-6">
          <Check on={format === "csv"} label="CSV" onClick={() => setFormat("csv")} />
          <Check on={format === "xls"} label="Excel (Only Microsoft Excel)" onClick={() => setFormat("xls")} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <a
          href={fields.length ? href : undefined}
          aria-disabled={fields.length === 0}
          className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${fields.length ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-300 cursor-not-allowed"}`}
        >
          Export as selected
        </a>
        <a href={backUrl} className="text-sm text-gray-600 hover:text-gray-900">Back to Orders List</a>
      </div>
    </div>
  );
}

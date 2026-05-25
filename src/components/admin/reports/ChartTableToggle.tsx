"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LineChart, Table as TableIcon } from "lucide-react";

/**
 * Top-right view-mode toggle that pairs with the DateRangePicker on
 * every chart-capable report. Mirrors the GloriaFood "Chart | Table"
 * pill (see Sales Trend + Promotions Stats screenshots).
 *
 * State lives in `?view=chart|table`. Default is chart since the
 * dashboard-style screenshots all default to a visualization. Falls
 * back gracefully when the page doesn't honor the param (we just
 * ignore it).
 */
export function ChartTableToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("view") === "table" ? "table" : "chart";

  const setView = (view: "chart" | "table") => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("view", view);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {[
        { key: "chart" as const, label: "Chart", Icon: LineChart },
        { key: "table" as const, label: "Table", Icon: TableIcon },
      ].map(({ key, label, Icon }) => {
        const active = current === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition",
              active ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:text-gray-800",
            ].join(" ")}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { ImpersonateButton } from "./ImpersonateButton";

export type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isTest: boolean;
  publishedAt: string | null;
  createdAt: string;
  lastOrderAt: string | null;
  orders: number;
  customers: number;
  menuItems: number;
  paidAddOnCount: number;
  paidAddOnNames: string[];
};

/** Sort keys — these are the columns that have clickable headers. */
type SortKey =
  | "name"
  | "joined"
  | "orders"
  | "customers"
  | "lastOrder"
  | "addOns"
  | "tier";

type Filter = {
  tier: "all" | "paid" | "free";
  status: "all" | "live" | "setup";
  active: "all" | "active" | "paused";
  test: "all" | "real" | "test";
  search: string;
};

const DEFAULT_FILTER: Filter = {
  tier: "all",
  status: "all",
  active: "all",
  test: "real",        // hide demo-* restaurants by default — real ops view
  search: "",
};

/**
 * Sortable + filterable restaurants table.
 *
 * Filtering is client-side over the full dataset because the list is
 * tiny (sub-1000 even at scale). When that crosses a few thousand we'll
 * need to push filters into the SQL query.
 *
 * Filters survive interactions via local state only — not URL params yet.
 * That's intentional: superadmin is a low-traffic surface and most
 * operators interact in a single session.
 */
export function RestaurantsTable({ rows }: { rows: RestaurantRow[] }) {
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visible = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (filter.tier === "paid" && r.paidAddOnCount === 0) return false;
      if (filter.tier === "free" && r.paidAddOnCount > 0) return false;
      if (filter.status === "live" && !r.publishedAt) return false;
      if (filter.status === "setup" && r.publishedAt) return false;
      if (filter.active === "active" && !r.isActive) return false;
      if (filter.active === "paused" && r.isActive) return false;
      if (filter.test === "real" && r.isTest) return false;
      if (filter.test === "test" && !r.isTest) return false;
      if (q) {
        const hay = `${r.name} ${r.slug} ${r.email ?? ""} ${r.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const cmp = (a: RestaurantRow, b: RestaurantRow): number => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "joined":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "orders":
          return a.orders - b.orders;
        case "customers":
          return a.customers - b.customers;
        case "lastOrder": {
          // Null → -Infinity so they sort to the bottom on desc / top on asc.
          const av = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : -Infinity;
          const bv = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : -Infinity;
          return av - bv;
        }
        case "addOns":
          return a.paidAddOnCount - b.paidAddOnCount;
        case "tier":
          // Paid > Free for desc, names within same tier as tiebreak.
          if (a.paidAddOnCount > 0 && b.paidAddOnCount === 0) return 1;
          if (a.paidAddOnCount === 0 && b.paidAddOnCount > 0) return -1;
          return a.name.localeCompare(b.name);
      }
    };
    out = [...out].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
    return out;
  }, [rows, filter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // Numeric/date sorts default to desc (biggest/newest first);
      // name sort defaults to asc (A→Z).
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  function resetFilters() {
    setFilter(DEFAULT_FILTER);
  }

  const hasActiveFilters =
    filter.tier !== "all" ||
    filter.status !== "all" ||
    filter.active !== "all" ||
    filter.test !== "real" ||
    filter.search.trim().length > 0;

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search by name, slug, email, phone"
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        <FilterPills
          label="Tier"
          value={filter.tier}
          onChange={(v) => setFilter((f) => ({ ...f, tier: v as Filter["tier"] }))}
          options={[
            { v: "all", label: "All" },
            { v: "paid", label: "Paid" },
            { v: "free", label: "Free" },
          ]}
        />
        <FilterPills
          label="Status"
          value={filter.status}
          onChange={(v) => setFilter((f) => ({ ...f, status: v as Filter["status"] }))}
          options={[
            { v: "all", label: "All" },
            { v: "live", label: "Live" },
            { v: "setup", label: "Setup" },
          ]}
        />
        <FilterPills
          label="Active"
          value={filter.active}
          onChange={(v) => setFilter((f) => ({ ...f, active: v as Filter["active"] }))}
          options={[
            { v: "all", label: "All" },
            { v: "active", label: "Active" },
            { v: "paused", label: "Paused" },
          ]}
        />
        <FilterPills
          label="Test"
          value={filter.test}
          onChange={(v) => setFilter((f) => ({ ...f, test: v as Filter["test"] }))}
          options={[
            { v: "real", label: "Hide" },
            { v: "all", label: "Show" },
            { v: "test", label: "Only test" },
          ]}
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline ml-auto"
          >
            Reset
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Showing <strong className="text-gray-900">{visible.length}</strong> of {rows.length} restaurants
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th col="name" label="Restaurant" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Live</th>
                <Th col="tier" label="Tier" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <Th col="addOns" label="Add-ons" align="right" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <Th col="orders" label="Orders" align="right" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <Th col="customers" label="Customers" align="right" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <Th col="lastOrder" label="Last order" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Ordering Page</th>
                <Th col="joined" label="Joined" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center px-4 py-12 text-gray-500">
                    {rows.length === 0 ? (
                      <>
                        <div className="font-semibold text-gray-700 mb-1">No restaurants in the database</div>
                        <p className="text-sm">New restaurants appear here automatically when an owner registers at{" "}
                          <a href="/signup" className="text-emerald-500 hover:underline">/signup</a>.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-gray-700 mb-1">No restaurants match these filters</div>
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="text-sm text-emerald-600 hover:underline mt-1"
                        >
                          Reset filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const isPaid = r.paidAddOnCount > 0;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/superadmin/restaurants/${r.id}`} className="font-semibold text-blue-600 hover:underline flex items-center flex-wrap">
                          {r.name}
                          {r.isTest && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">TEST</span>
                          )}
                          {!r.isActive && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">PAUSED</span>
                          )}
                        </Link>
                        <div className="text-xs text-gray-400">{r.email || r.phone || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        {r.publishedAt ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">LIVE</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">SETUP</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPaid ? (
                          <span
                            className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700"
                            title={r.paidAddOnNames.join(", ")}
                          >
                            PAID
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                            FREE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" title={r.paidAddOnNames.join(", ")}>
                        <span className={r.paidAddOnCount === 0 ? "text-gray-300" : "text-gray-900 font-semibold"}>
                          {r.paidAddOnCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.orders}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.customers}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {r.lastOrderAt ? formatDate(r.lastOrderAt) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/order/${r.slug}`} target="_blank" className="text-emerald-500 hover:underline text-xs">
                          /order/{r.slug}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <ImpersonateButton restaurantId={r.id} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  col,
  label,
  align,
  activeKey,
  dir,
  onToggle,
}: {
  /** This column's identity in the sort key union. */
  col: SortKey;
  label: string;
  align?: "left" | "right";
  /** The column the table is currently sorted by. */
  activeKey: SortKey;
  dir: "asc" | "desc";
  onToggle: (k: SortKey) => void;
}) {
  const active = activeKey === col;
  const Arrow = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(col)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 transition ${
          active ? "text-gray-900" : ""
        }`}
      >
        {label}
        <Arrow className="w-3 h-3 opacity-60" />
      </button>
    </th>
  );
}

function FilterPills({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {options.map((o) => {
          const active = o.v === value;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                active ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

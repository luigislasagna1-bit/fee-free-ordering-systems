"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Users, Mail, Phone, KeyRound, ChevronRight, Search, Download } from "lucide-react";

/**
 * Client-side filter + search for the /admin/customers list.
 *
 * The server (page.tsx) loads ALL customers — typically a few hundred
 * to a few thousand per restaurant. We filter in the browser so the
 * filter chips + search are instantly responsive without round-trips.
 * If a restaurant ever crosses ~10k customers we'd swap this for
 * server-side filtering with a search-as-you-type debounce, but
 * that's well past launch.
 *
 * Filter chips:
 *   All — every customer
 *   Signed up — Customer.passwordHash != null (has a per-restaurant account)
 *   Guests — Customer.passwordHash == null (placed orders without signup)
 *
 * Search matches name / email / phone (case-insensitive substring).
 */

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
  hasAccount: boolean;
  /** Customer.marketingConsent — drives the "Marketing" column badge
   *  and the matching CSV column. True = opted in (default-checked at
   *  checkout was left ticked, OR toggled on from /account). */
  marketingConsent: boolean;
};

type FilterKey = "all" | "signed_up" | "guests";

export function CustomersClient({ customers }: { customers: CustomerRow[] }) {
  const t = useTranslations("admin.customersList");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => ({
    all: customers.length,
    signed_up: customers.filter((c) => c.hasAccount).length,
    guests: customers.filter((c) => !c.hasAccount).length,
  }), [customers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter === "signed_up" && !c.hasAccount) return false;
      if (filter === "guests" && c.hasAccount) return false;
      if (q) {
        const hay = `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [customers, filter, query]);

  /**
   * Build a CSV from the CURRENTLY visible rows and trigger a browser
   * download. Includes name / email / phone / orders / spend / signup
   * date / has-account flag — matches the GloriaFood export layout.
   * Empty strings for missing fields. CSV-escapes any double-quotes
   * or commas in the source data via standard RFC 4180.
   */
  const exportCsv = () => {
    const esc = (v: string | number | null | undefined) => {
      if (v == null) return "";
      const s = String(v);
      // RFC 4180: wrap in quotes if contains comma, quote, or newline; double up any internal quotes.
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Name", "Email", "Phone", "Total orders", "Total spent", "Signup date", "Has account", "Marketing consent"];
    const lines = [header.join(",")];
    for (const c of visible) {
      lines.push([
        esc(c.name),
        esc(c.email),
        esc(c.phone),
        esc(c.totalOrders),
        esc(c.totalSpent.toFixed(2)),
        esc(c.createdAt.slice(0, 10)),
        esc(c.hasAccount ? "yes" : "no"),
        esc(c.marketingConsent ? "yes" : "no"),
      ].join(","));
    }
    // Prefix with UTF-8 BOM so Excel reads accented characters correctly
    // — Italian/French/Spanish restaurants always have non-ASCII names.
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `customers-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-gray-500">
            {visible.length === customers.length
              ? t("totalCount", { n: customers.length })
              : t("filteredCount", { visible: visible.length, total: customers.length })}
          </span>
          {/* GloriaFood parity: one-click CSV export of the visible
              (filtered + searched) customer set. The owner can switch
              the filter chip first (e.g. "Signed up only") and export
              just that segment. */}
          <button
            type="button"
            onClick={exportCsv}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" /> {t("exportCsv")}
          </button>
        </div>
      </div>

      {/* Filter chips + search bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {([
            { key: "all" as const, label: t("filterAll"), count: counts.all },
            { key: "signed_up" as const, label: t("filterSignedUp"), count: counts.signed_up },
            { key: "guests" as const, label: t("filterGuests"), count: counts.guests },
          ]).map((chip) => (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                filter === chip.key
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {chip.label} <span className="opacity-70">({chip.count})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-gray-50 border border-gray-200 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            {customers.length === 0 ? (
              <p>{t("emptyNoCustomers")}</p>
            ) : (
              <p>{t("emptyNoMatch")}</p>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: card layout */}
            <ul className="divide-y divide-gray-100 md:hidden">
              {visible.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/customers/${c.id}`} className="block p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 truncate">{c.name}</span>
                          {c.hasAccount && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                              <KeyRound className="w-2.5 h-2.5" />{t("badgeAccount")}
                            </span>
                          )}
                          {c.marketingConsent ? (
                            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                              {t("badgeMarketing")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                              {t("badgeOptedOut")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t("ordersSince", { n: c.totalOrders, date: formatDate(c.createdAt) })}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-gray-900">{formatCurrency(c.totalSpent)}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("totalSpentLabel")}</div>
                      </div>
                    </div>
                    {(c.email || c.phone) && (
                      <div className="mt-2 flex flex-col gap-1 text-xs text-gray-600">
                        {c.email && (
                          <span className="inline-flex items-center gap-1.5 truncate">
                            <Mail className="w-3 h-3 flex-shrink-0 text-gray-400" />
                            <span className="truncate">{c.email}</span>
                          </span>
                        )}
                        {c.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />
                            {c.phone}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {[
                      { key: "colName", label: t("colName") },
                      { key: "colEmail", label: t("colEmail") },
                      { key: "colPhone", label: t("colPhone") },
                      { key: "colOrders", label: t("colOrders") },
                      { key: "colTotalSpent", label: t("colTotalSpent") },
                      { key: "colMarketing", label: t("colMarketing") },
                      { key: "colFirstOrder", label: t("colFirstOrder") },
                      { key: "colActions", label: "" },
                    ].map((h) => (
                      <th key={h.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-2 hover:text-emerald-700">
                          {c.name}
                          {c.hasAccount && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                              <KeyRound className="w-2.5 h-2.5" />{t("badgeAccount")}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.totalOrders}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(c.totalSpent)}</td>
                      <td className="px-4 py-3">
                        {c.marketingConsent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                            {t("badgeOptedIn")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            {t("badgeOptedOut")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/customers/${c.id}`} className="text-emerald-600 hover:text-emerald-700">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Helpful pointer for owners who came here looking for analytics */}
      <p className="mt-4 text-xs text-gray-500">
        {t.rich("analyticsHint", {
          link: (chunks) => (
            <Link href="/admin/reports/list/clients" className="text-emerald-600 font-semibold hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}

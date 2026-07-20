"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { escCsv } from "@/lib/csv";
import { useCurrencyFormat } from "@/lib/currency-context";
import { useSortableRows, SortableTh } from "@/components/admin/sortable";
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
  /** When the customer created their ACCOUNT — null for guests. Distinct
   *  from createdAt (row creation = first order). Luigi 2026-07-19. */
  signedUpAt: string | null;
  hasAccount: boolean;
  /** Customer.marketingConsent — drives the "Marketing" column badge
   *  and the matching CSV column. True = opted in (default-checked at
   *  checkout was left ticked, OR toggled on from /account). */
  marketingConsent: boolean;
  /** RewardAccount.balance for this restaurant (0 = no wallet). */
  rewardBalance: number;
};

type FilterKey = "all" | "signed_up" | "guests";

export function CustomersClient({ customers, rewardsEnabled, rewardLabel }: {
  customers: CustomerRow[];
  /** Master rewards toggle — the balance column only renders when ON
   *  (feature-gated visibility standing rule). */
  rewardsEnabled: boolean;
  /** The restaurant's own label ("Luigi Bucks", "Pizza Bucks", …) — a
   *  configured business value, shown verbatim as the column header. */
  rewardLabel: string;
}) {
  const formatCurrency = useCurrencyFormat();
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

  // Click-to-sort on every column (Luigi 2026-07-19); no sort = the page's
  // natural biggest-spender-first order. Applies to the CSV export too, so
  // what you see is what you download.
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows(visible, {
    name: (c) => c.name,
    email: (c) => c.email,
    phone: (c) => c.phone,
    orders: (c) => c.totalOrders,
    spent: (c) => c.totalSpent,
    rewards: (c) => c.rewardBalance,
    marketing: (c) => c.marketingConsent,
    firstOrder: (c) => c.createdAt,
    signedUp: (c) => c.signedUpAt,
  });

  /**
   * Build a CSV from the CURRENTLY visible rows and trigger a browser
   * download. Includes name / email / phone / orders / spend / signup
   * date / has-account flag — matches the GloriaFood export layout.
   * Empty strings for missing fields. CSV-escapes any double-quotes
   * or commas in the source data via standard RFC 4180.
   */
  const exportCsv = () => {
    // "First order date" = row creation (the old "Signup date" column was
    // mislabeled — it always held createdAt); "Signed up date" = the real
    // account-creation date, blank for guests. The wallet column always
    // exports (stable CSV shape) under the restaurant's own reward label.
    const header = ["Name", "Email", "Phone", "Total orders", "Total spent", `${rewardLabel} balance`, "First order date", "Signed up date", "Has account", "Marketing consent"];
    const lines = [header.join(",")];
    for (const c of sorted) {
      lines.push([
        escCsv(c.name),
        escCsv(c.email),
        escCsv(c.phone),
        escCsv(c.totalOrders),
        escCsv(c.totalSpent.toFixed(2)),
        escCsv(c.rewardBalance.toFixed(2)),
        escCsv(c.createdAt.slice(0, 10)),
        escCsv(c.signedUpAt ? c.signedUpAt.slice(0, 10) : ""),
        escCsv(c.hasAccount ? "yes" : "no"),
        escCsv(c.marketingConsent ? "yes" : "no"),
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
              {sorted.map((c) => (
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
                        {rewardsEnabled && c.rewardBalance > 0 && (
                          <>
                            <div className="font-semibold text-violet-700 text-sm mt-1">{formatCurrency(c.rewardBalance)}</div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider">{rewardLabel}</div>
                          </>
                        )}
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
                      { id: "name", label: t("colName") },
                      { id: "email", label: t("colEmail") },
                      { id: "phone", label: t("colPhone") },
                      { id: "orders", label: t("colOrders") },
                      { id: "spent", label: t("colTotalSpent") },
                      // The restaurant's own wallet label ("Luigi Bucks") —
                      // configured value, shown verbatim; column hidden when
                      // the rewards master toggle is off.
                      ...(rewardsEnabled ? [{ id: "rewards", label: rewardLabel }] : []),
                      { id: "marketing", label: t("colMarketing") },
                      { id: "firstOrder", label: t("colFirstOrder") },
                      // Reuses the already-translated "Signed up" chip string.
                      { id: "signedUp", label: t("filterSignedUp") },
                    ].map((h) => (
                      <SortableTh key={h.id} sortId={h.id} label={h.label} sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    ))}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((c) => (
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
                      {rewardsEnabled && (
                        <td className="px-4 py-3">
                          {c.rewardBalance > 0 ? (
                            <span className="font-semibold text-violet-700">{formatCurrency(c.rewardBalance)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
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
                      <td className="px-4 py-3 text-gray-500">{c.signedUpAt ? formatDate(c.signedUpAt) : "—"}</td>
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

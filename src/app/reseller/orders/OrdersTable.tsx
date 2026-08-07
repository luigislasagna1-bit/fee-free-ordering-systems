"use client";

import { useEffect, useState } from "react";
import { ChevronUp, Columns3, Loader2 } from "lucide-react";

/**
 * The partner / superadmin Orders List table.
 *
 * Rows arrive PRE-FORMATTED from the server: each restaurant has its own
 * timezone and currency, so "Placed at" and "Total" must be rendered per row
 * against that restaurant's settings — never a single page-wide locale.
 *
 * Two client-only behaviours live here:
 *   • the column chooser (the table icon, top-right) persisted to localStorage
 *   • inline row expansion with Order detail / Order items tabs, lazy-loaded
 */

export type ViewRow = {
  id: string;
  kind: "order" | "reservation";
  ref: string;
  name: string;
  companyName: string;
  address: string;
  placedTime: string;
  placedDate: string;
  status: string;
  statusLabel: string;
  typeLabel: string;
  totalLabel: string | null;
  paymentLabel: string | null;
  fulfilmentTime: string | null;
  fulfilmentDate: string | null;
};

export type TableLabels = {
  colName: string; colCompany: string; colOrderId: string; colPlacedAt: string;
  colStatus: string; colType: string; colTotal: string; colPayment: string; colFulfilment: string;
  columnsLabel: string; emptyState: string; notApplicable: string;
  tabDetail: string; tabItems: string; showLess: string;
  lblStatus: string; lblPlacedAt: string; lblConfirmedAt: string; lblFulfilledAt: string;
  lblOrderType: string; lblPayment: string; lblTotal: string;
  lblSubtotal: string; lblTax: string; lblTip: string; lblDelivery: string;
  lblGuests: string; lblDeposit: string; lblPreOrder: string; lblCode: string; lblNotes: string;
  loading: string; loadError: string;
};

type ColumnId = "name" | "company" | "orderId" | "placedAt" | "status" | "type" | "total" | "payment" | "fulfilment";

/** Name / Status / Type are always on — they're what makes a row identifiable. */
const ALWAYS_ON: ColumnId[] = ["name", "status", "type"];
const COLUMN_ORDER: ColumnId[] = ["name", "company", "orderId", "placedAt", "status", "type", "total", "payment", "fulfilment"];
const STORAGE_KEY = "ffos.ordersList.columns.v1";

const DOT: Record<string, string> = {
  accepted: "bg-emerald-500", completed: "bg-emerald-500",
  pending: "bg-amber-500", missed: "bg-orange-500",
  rejected: "bg-red-500", cancelled: "bg-red-500",
  seated: "bg-blue-500", no_show: "bg-gray-400",
};

type DetailLine = { qty: number; name: string; modifiers: string[]; amount: string };
type DetailPayload = {
  kind: "order" | "reservation";
  status: string;
  placedAt: string | null;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  typeLabel: string;
  paymentLabel: string | null;
  totalLabel: string | null;
  lines: DetailLine[];
  totals: { label: string; amount: string; bold?: boolean }[];
  meta: { label: string; value: string }[];
};

export function OrdersTable({ rows, labels }: { rows: ViewRow[]; labels: TableLabels }) {
  const [visible, setVisible] = useState<ColumnId[]>(COLUMN_ORDER);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"detail" | "items">("detail");
  const [detail, setDetail] = useState<Record<string, DetailPayload | "loading" | "error">>({});

  // Restore the saved column set once on mount (never during SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ColumnId[];
        if (Array.isArray(saved) && saved.length) {
          setVisible(COLUMN_ORDER.filter((c) => ALWAYS_ON.includes(c) || saved.includes(c)));
        }
      }
    } catch {
      /* corrupt value — fall back to all columns */
    }
  }, []);

  const toggle = (c: ColumnId) => {
    if (ALWAYS_ON.includes(c)) return;
    const next = visible.includes(c) ? visible.filter((x) => x !== c) : COLUMN_ORDER.filter((x) => visible.includes(x) || x === c);
    setVisible(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const open = async (row: ViewRow) => {
    if (expanded === row.id) { setExpanded(null); return; }
    setExpanded(row.id);
    setTab("detail");
    if (detail[row.id] && detail[row.id] !== "error") return;
    setDetail((d) => ({ ...d, [row.id]: "loading" }));
    try {
      const res = await fetch(`/api/reseller/orders/${row.id}?kind=${row.kind}`);
      if (!res.ok) throw new Error(String(res.status));
      const payload = (await res.json()) as DetailPayload;
      setDetail((d) => ({ ...d, [row.id]: payload }));
    } catch {
      setDetail((d) => ({ ...d, [row.id]: "error" }));
    }
  };

  const head: Record<ColumnId, string> = {
    name: labels.colName, company: labels.colCompany, orderId: labels.colOrderId,
    placedAt: labels.colPlacedAt, status: labels.colStatus, type: labels.colType,
    total: labels.colTotal, payment: labels.colPayment, fulfilment: labels.colFulfilment,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
              {visible.map((c) => (
                <th key={c} className={`py-3 px-4 font-semibold ${c === "total" ? "text-right" : ""}`}>{head[c]}</th>
              ))}
              <th className="py-3 px-2 w-10 relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-label={labels.columnsLabel}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                >
                  <Columns3 className="w-4 h-4" />
                </button>
                {pickerOpen && (
                  <>
                    <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setPickerOpen(false)} />
                    <div className="absolute right-2 top-11 z-20 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 normal-case tracking-normal">
                      {COLUMN_ORDER.map((c) => {
                        const locked = ALWAYS_ON.includes(c);
                        const on = visible.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            disabled={locked}
                            onClick={() => toggle(c)}
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left ${locked ? "opacity-50 cursor-default" : "hover:bg-gray-50"}`}
                          >
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-white text-[10px] ${on ? (locked ? "bg-gray-400 border-gray-400" : "bg-emerald-500 border-emerald-500") : "border-gray-300"}`}>
                              {on ? "✓" : ""}
                            </span>
                            <span className="text-gray-700">{head[c]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={visible.length + 1} className="py-8 px-4 text-center text-gray-400 italic">{labels.emptyState}</td></tr>
            )}
            {rows.map((r) => {
              const isOpen = expanded === r.id;
              const d = detail[r.id];
              return (
                <tr key={r.id} className="border-b border-gray-50 align-top">
                  <td colSpan={visible.length + 1} className="p-0">
                    <button
                      type="button"
                      onClick={() => open(r)}
                      aria-expanded={isOpen}
                      className={`w-full text-left transition ${isOpen ? "bg-gray-50/60" : "hover:bg-gray-50/50"}`}
                    >
                      <table className="w-full text-sm">
                        <tbody>
                          <tr>
                            {visible.map((c) => (
                              <td key={c} className={`py-3 px-4 ${c === "total" ? "text-right" : ""}`}>
                                {c === "name" && (
                                  <>
                                    <div className="font-semibold text-gray-900">{r.name}</div>
                                    {r.address && <div className="text-xs text-gray-500 mt-0.5">{r.address}</div>}
                                  </>
                                )}
                                {c === "company" && <span className="text-gray-600">{r.companyName}</span>}
                                {c === "orderId" && <span className="font-mono text-xs text-gray-700">{r.ref}</span>}
                                {c === "placedAt" && (
                                  <>
                                    <div className="text-gray-800">{r.placedTime}</div>
                                    <div className="text-xs text-gray-500">{r.placedDate}</div>
                                  </>
                                )}
                                {c === "status" && (
                                  <span className="inline-flex items-center gap-2 text-gray-800">
                                    <span className={`w-2 h-2 rounded-full ${DOT[r.status] ?? "bg-gray-400"}`} />
                                    {r.statusLabel}
                                  </span>
                                )}
                                {c === "type" && <span className="text-gray-600">{r.typeLabel}</span>}
                                {c === "total" && <span className="font-medium text-gray-900">{r.totalLabel ?? "—"}</span>}
                                {c === "payment" && <span className="text-gray-600">{r.paymentLabel ?? "—"}</span>}
                                {c === "fulfilment" && (
                                  r.fulfilmentTime ? (
                                    <>
                                      <div className="text-gray-800">{r.fulfilmentTime}</div>
                                      {r.fulfilmentDate && <div className="text-xs text-gray-500">{r.fulfilmentDate}</div>}
                                    </>
                                  ) : <span className="text-gray-400">{labels.notApplicable}</span>
                                )}
                              </td>
                            ))}
                            <td className="py-3 px-2 w-10" />
                          </tr>
                        </tbody>
                      </table>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4">
                        <div className="flex justify-center -mt-1 mb-2">
                          <button type="button" onClick={() => setExpanded(null)} className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-gray-400 hover:text-gray-600">
                            <ChevronUp className="w-3 h-3" /> {labels.showLess}
                          </button>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white">
                          <div className="flex gap-5 px-5 pt-3 border-b border-gray-100">
                            {(["detail", "items"] as const).map((tb) => (
                              <button
                                key={tb}
                                type="button"
                                onClick={() => setTab(tb)}
                                className={`pb-2 text-sm transition border-b-2 ${tab === tb ? "border-sky-500 text-sky-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                              >
                                {tb === "detail" ? labels.tabDetail : labels.tabItems}
                              </button>
                            ))}
                          </div>
                          <div className="p-5">
                            {d === "loading" && (
                              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{labels.loading}</div>
                            )}
                            {d === "error" && <div className="text-sm text-red-600">{labels.loadError}</div>}
                            {d && d !== "loading" && d !== "error" && (
                              tab === "detail" ? <DetailTab d={d} labels={labels} /> : <ItemsTab d={d} labels={labels} />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

function DetailTab({ d, labels }: { d: DetailPayload; labels: TableLabels }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
      <div>
        <div className="text-xs text-gray-500">{labels.lblStatus}</div>
        <div className="text-sm text-gray-900 mt-0.5 inline-flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${DOT[d.status] ?? "bg-gray-400"}`} />
          {d.status}
        </div>
      </div>
      {d.placedAt && <Field label={labels.lblPlacedAt} value={d.placedAt} />}
      {d.confirmedAt && <Field label={labels.lblConfirmedAt} value={d.confirmedAt} />}
      {d.fulfilledAt && <Field label={labels.lblFulfilledAt} value={d.fulfilledAt} />}
      <Field label={labels.lblOrderType} value={d.typeLabel} />
      {d.paymentLabel && <Field label={labels.lblPayment} value={d.paymentLabel} />}
      {d.totalLabel && <Field label={labels.lblTotal} value={d.totalLabel} />}
      {d.meta.map((m) => <Field key={m.label} label={m.label} value={m.value} />)}
    </div>
  );
}

function ItemsTab({ d, labels }: { d: DetailPayload; labels: TableLabels }) {
  if (d.lines.length === 0 && d.totals.length === 0) {
    return <div className="text-sm text-gray-400 italic">{labels.emptyState}</div>;
  }
  return (
    <div>
      {d.lines.map((l, i) => (
        <div key={i} className={`flex items-start justify-between gap-6 py-2.5 px-2 -mx-2 rounded ${l.amount.trim().startsWith("0") || l.qty === 0 ? "bg-emerald-50/40" : ""}`}>
          <div className="min-w-0">
            <div className="text-sm text-gray-900">
              <span className="text-gray-500 mr-3">{l.qty} x</span>{l.name}
            </div>
            {l.modifiers.length > 0 && (
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                {l.modifiers.map((m, j) => (
                  <span key={j}>{j > 0 && <span className="mx-2 text-gray-300">•</span>}{m}</span>
                ))}
              </div>
            )}
          </div>
          <div className="text-sm text-gray-700 whitespace-nowrap">{l.amount}</div>
        </div>
      ))}
      {d.totals.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          {d.totals.map((t) => (
            <div key={t.label} className={`flex justify-between text-sm ${t.bold ? "font-bold text-gray-900 pt-1.5" : "text-gray-600"}`}>
              <span>{t.label}</span><span>{t.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

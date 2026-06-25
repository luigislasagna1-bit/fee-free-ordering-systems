import { getSessionUser } from "@/lib/session";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { getRestaurantCurrency, getRestaurantTimezone } from "@/lib/restaurant-currency";
import { formatRangeLabel } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { buildSummaryRows, isSummaryDim, type SummaryDim } from "@/lib/reports/summary-rows";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/sales/summary
 *
 * The GloriaFood "Sales → Summary" table: one row per group with the full money
 * breakdown — NR ORDERS · SUBTOTAL · TAX · DELIVERY FEE · TIPS · OTHER FEES ·
 * TOTAL — plus a bold TOTAL row at the bottom. The breakdown matches the
 * End-of-Day report exactly (same fields, same service-fee parse).
 *
 * "View by" lives in `?by=` (Day / Week / Month / Payment method / Order type;
 * default Day). Date range from the picker. All money in the restaurant's
 * currency; ranges in its timezone (see Phase 1).
 *
 * Note: we deliberately do NOT split GloriaFood's NET/TAX sub-columns for
 * delivery fees — the schema stores `deliveryFee` gross only and tax as a single
 * `taxAmount`, so a separate DELIVERY-FEE-TAX column would have no backing data.
 */
export default async function SalesSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const dim = pickDim(sp.by);

  const t = await getTranslations("admin.reportSalesSummary");

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;
  const [__currency, __timezone] = await Promise.all([
    getRestaurantCurrency(restaurantId),
    getRestaurantTimezone(restaurantId),
  ]);
  const formatCurrency = (n: number) => fmtCurrency(n, __currency);
  const range = parseDateRangeInTz(sp, __timezone ?? undefined);

  const { rows, totals } = await buildSummaryRows(restaurantId, range, dim, __timezone ?? undefined);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("breakdownBy", { dim: labelByDim(dim, t), range: formatRangeLabel(range) })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewBySwitcher current={dim} sp={sp} t={t} />
          <DateRangePicker />
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="overflow-x-auto pb-12">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{labelByDim(dim, t)}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colOrders")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colSubtotal")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colTax")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colDeliveryFee")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colTips")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colOtherFees")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 px-4 text-center text-gray-400 italic">{t("emptyState")}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2.5 px-4 font-medium text-gray-800">{rowLabel(dim, r.key, t)}</td>
                <td className="py-2.5 px-4 text-right text-gray-700">{r.orders.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.subtotal)}</td>
                <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.tax)}</td>
                <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.deliveryFee)}</td>
                <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.tips)}</td>
                <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.otherFees)}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-900">
                <td className="py-3 px-4">{t("totalRowLabel")}</td>
                <td className="py-3 px-4 text-right">{totals.orders.toLocaleString()}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(totals.subtotal)}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(totals.tax)}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(totals.deliveryFee)}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(totals.tips)}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(totals.otherFees)}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>

        <div className="absolute bottom-3 right-3">
          <ExportMenu
            exportUrl="/api/admin/reports/sales/summary/export"
            currentQuery={buildQuery(sp)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

type TFn = (key: string) => string;

function pickDim(raw: string | string[] | undefined): SummaryDim {
  const v = Array.isArray(raw) ? raw[0] : raw;
  // Back-compat: the old page used ?by=status — fold it into the default.
  return isSummaryDim(v) ? v : "day";
}

function labelByDim(d: SummaryDim, t: TFn): string {
  switch (d) {
    case "day": return t("viewDay");
    case "week": return t("viewWeek");
    case "month": return t("viewMonth");
    case "paymentMethod": return t("dimPaymentMethod");
    case "type": return t("dimOrderType");
  }
}

/** Title-case a raw value: "apple_pay" → "Apple Pay". */
function prettify(raw: string): string {
  return raw.split(/[_\s]+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function rowLabel(d: SummaryDim, key: string, t: TFn): string {
  if (key === "—" || !key) return "—";
  if (d === "day") {
    return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  if (d === "month") {
    return new Date(`${key}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (d === "week") {
    const start = new Date(`${key}T12:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const f = (dt: Date, withYear: boolean) =>
      dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
    return `${f(start, false)} – ${f(end, true)}`;
  }
  if (d === "type") return key === "dine_in" ? t("labelDineIn") : prettify(key);
  return prettify(key); // paymentMethod
}

function ViewBySwitcher({ current, sp, t }: { current: SummaryDim; sp: Record<string, string | string[] | undefined>; t: TFn }) {
  const mk = (p: SummaryDim) => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("by", p);
    u.delete("page");
    return `?${u.toString()}`;
  };
  const opts: SummaryDim[] = ["day", "week", "month", "paymentMethod", "type"];
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
      {opts.map((p) => (
        <a key={p} href={mk(p)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${current === p ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:text-gray-800"}`}>
          {labelByDim(p, t)}
        </a>
      ))}
    </div>
  );
}

function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}

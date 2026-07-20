import { getSessionUser } from "@/lib/session";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildSummaryRows, isSummaryDim, type SummaryDim } from "@/lib/reports/summary-rows";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { getTranslations } from "next-intl/server";
import { SummaryTable } from "./SummaryTable";

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
  const scope = await resolveReportScope(restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  const { rows, totals } = await buildSummaryRows(scope.ids, range, dim, scope.timezone ?? undefined);
  const tMoney = await getTranslations("money");
  // Store-credit tender columns only when credit was actually redeemed in the
  // range — stores without Reward Dollars never see them (feature-gated by data).
  const showCredit = totals.storeCredit > 0;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("breakdownBy", { dim: labelByDim(dim, t), range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewBySwitcher current={dim} sp={sp} t={t} />
          <DateRangePicker />
          <ExportMenu exportUrl="/api/admin/reports/sales/summary/export" currentQuery={buildQuery(sp)} compact={false} />
        </div>
      </header>

      {/* Table extracted to a client component so the numeric/money columns
          are click-sortable (shared sortable primitive). The bold TOTAL row
          stays pinned in <tfoot>, excluded from sorting. */}
      <SummaryTable
        rows={rows.map((r) => ({ ...r, label: rowLabel(dim, r.key, t) }))}
        totals={totals}
        currency={scope.currency}
        showCredit={showCredit}
        labels={{
          dim: labelByDim(dim, t),
          orders: t("colOrders"),
          subtotal: t("colSubtotal"),
          discounts: tMoney("discounts"),
          tax: t("colTax"),
          deliveryFee: t("colDeliveryFee"),
          tips: t("colTips"),
          otherFees: t("colOtherFees"),
          total: t("colTotal"),
          rewardCredit: tMoney("pay.rewardCredit"),
          amountCollected: tMoney("amountCollected"),
          totalRow: t("totalRowLabel"),
          emptyState: t("emptyState"),
        }}
      />
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

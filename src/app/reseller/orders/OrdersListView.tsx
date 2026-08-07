import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Download } from "lucide-react";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { paymentMethodLabelKey } from "@/lib/payment-label";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { TableControls } from "@/components/admin/reports/TableControls";
import { buildQuery, one, Pagination, type SearchParams } from "@/components/admin/reports/table-nav";
import { listScopeRestaurants, hasMixedCurrency, type OrdersScope } from "@/lib/reseller/scope";
import { fetchOrderFeed, FEED_STATUSES, FEED_TYPES, type FeedStatus, type FeedType } from "@/lib/reseller/order-feed";
import { OrdersTable, type ViewRow, type TableLabels } from "./OrdersTable";
import { FeedFilters } from "./FeedFilters";

/**
 * The cross-restaurant Orders List, shared by the partner view
 * (/reseller/orders, scoped to their restaurants) and the superadmin view
 * (/superadmin/orders, every restaurant). Only the `scope` differs.
 *
 * Built from Fabrizio's request (report cmshrr94z001d04l7x8kpet3z) + the live
 * GloriaFood partner screen it references.
 */

const PAGE_SIZES = [20, 50, 100];
/** GloriaFood defaults to the last 30 days and hides older behind a link — the
 *  same guard keeps a cross-restaurant scan bounded. last_28 is our nearest
 *  preset, so the DateRangePicker stays consistent with what's shown. */
const DEFAULT_PRESET = "last_28";

function pickSize(raw: string | string[] | undefined): number {
  const n = Number(one(raw));
  return PAGE_SIZES.includes(n) ? n : 20;
}

export async function OrdersListView({
  scope,
  searchParams,
  basePath,
  title,
}: {
  scope: OrdersScope;
  searchParams: SearchParams;
  basePath: string;
  title: string;
}) {
  const sp = searchParams;
  const t = await getTranslations("reseller.ordersList");
  const tRoot = await getTranslations();
  const locale = await getLocale();

  const restaurants = await listScopeRestaurants(scope);
  const mixedCurrency = hasMixedCurrency(restaurants);
  // Anchor date-range parsing on the first restaurant's timezone — the honest
  // approximation for a multi-timezone portfolio (same tradeoff resolveReportScope makes).
  const anchorTz = restaurants[0]?.timezone ?? undefined;

  // Default to the last 28 days unless the user picked a range.
  const spForRange: SearchParams = sp.preset || sp.from || sp.to ? sp : { ...sp, preset: DEFAULT_PRESET };
  const range = parseDateRangeInTz(spForRange, anchorTz);

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const size = pickSize(sp.size);
  const q = one(sp.q)?.trim() || "";
  const status = (FEED_STATUSES as readonly string[]).includes(one(sp.status) ?? "")
    ? (one(sp.status) as FeedStatus)
    : null;
  const typeParam = one(sp.type);
  const types = (FEED_TYPES as readonly string[]).includes(typeParam ?? "") ? [typeParam as FeedType] : null;
  const restaurantId = one(sp.restaurant) || null;

  const feed = await fetchOrderFeed({ scope, range, q, status, types, restaurantId, page, size });

  // ── Per-row formatting: each restaurant has its own timezone AND currency,
  // so this can never be hoisted to a single page-wide formatter.
  const fmtTime = (d: Date, tz: string | null) =>
    d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) });
  const fmtDate = (d: Date, tz: string | null) =>
    d.toLocaleDateString(locale, { month: "short", day: "2-digit", year: "numeric", ...(tz ? { timeZone: tz } : {}) });

  // Status labels reuse strings already translated across all 38 locales —
  // kitchen.* for the three the orders vocabulary lacks, admin.orders.* for the rest.
  const statusLabel = (s: FeedStatus): string =>
    s === "missed" ? tRoot("kitchen.missed")
    : s === "seated" ? tRoot("kitchen.seated")
    : s === "no_show" ? tRoot("kitchen.noShow")
    : tRoot(`admin.orders.${s}`);

  const typeLabel = (ty: FeedType): string => t(`type_${ty}`);

  const rows: ViewRow[] = feed.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    ref: r.ref,
    name: r.restaurant.name,
    companyName: r.restaurant.companyName,
    address: r.restaurant.address,
    placedTime: fmtTime(r.placedAt, r.restaurant.timezone),
    placedDate: fmtDate(r.placedAt, r.restaurant.timezone),
    status: r.status,
    statusLabel: statusLabel(r.status),
    typeLabel: typeLabel(r.type),
    totalLabel: r.total != null ? fmtCurrency(r.total, r.currency) : null,
    paymentLabel: (() => {
      if (!r.paymentMethod) return null;
      const k = paymentMethodLabelKey(r.paymentMethod, r.type === "delivery" ? "delivery" : "pickup");
      return k ? tRoot(k) : r.paymentMethod.replace(/_/g, " ");
    })(),
    // Orders carry a real timestamp; a booking's slot is restaurant-local text.
    fulfilmentTime: r.fulfilmentAt ? fmtTime(r.fulfilmentAt, r.restaurant.timezone) : r.reservationTime,
    fulfilmentDate: r.fulfilmentAt
      ? fmtDate(r.fulfilmentAt, r.restaurant.timezone)
      : r.reservationDate
        ? fmtDate(new Date(`${r.reservationDate}T12:00:00Z`), null)
        : null,
  }));

  const labels: TableLabels = {
    colName: t("colName"), colCompany: t("colCompany"), colOrderId: t("colOrderId"),
    colPlacedAt: t("colPlacedAt"), colStatus: tRoot("admin.reportOrdersList.colStatus"),
    colType: tRoot("admin.reportOrdersList.colType"), colTotal: tRoot("admin.reportOrdersList.colTotal"),
    colPayment: t("colPayment"), colFulfilment: t("colFulfilment"),
    columnsLabel: t("columns"), emptyState: tRoot("admin.reportOrdersList.emptyState"),
    notApplicable: t("notApplicable"), tabDetail: t("tabDetail"), tabItems: t("tabItems"),
    showLess: t("showLess"), lblStatus: tRoot("admin.reportOrdersList.colStatus"),
    lblPlacedAt: t("colPlacedAt"), lblConfirmedAt: t("lblConfirmedAt"), lblFulfilledAt: t("lblFulfilledAt"),
    lblOrderType: tRoot("admin.reportOrdersList.colType"), lblPayment: t("colPayment"),
    lblTotal: tRoot("admin.reportOrdersList.colTotal"), lblSubtotal: tRoot("ordering.subtotal"),
    lblTax: tRoot("ordering.tax"), lblTip: tRoot("ordering.tip"), lblDelivery: tRoot("ordering.deliveryFee"),
    lblGuests: t("lblGuests"), lblDeposit: t("lblDeposit"), lblPreOrder: t("lblPreOrder"),
    lblCode: t("lblCode"), lblNotes: tRoot("common.notes"), loading: tRoot("common.loading"),
    loadError: t("loadError"),
  };

  const chip = (value: FeedStatus | null, label: string, count: number) => {
    const u = new URLSearchParams(buildQuery(sp));
    u.delete("status");
    const active = status === value;
    if (value && !active) u.set("status", value);
    return (
      <Link
        key={value ?? "all"}
        href={`${basePath}?${u.toString()}`}
        aria-pressed={active}
        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
          active ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label} <span className={active ? "opacity-80" : "text-gray-400"}>{count}</span>
      </Link>
    );
  };

  // "Show orders older than 30 days" — widens to a bounded 12-month window
  // rather than an unbounded all-time scan.
  const olderQ = new URLSearchParams(buildQuery(sp));
  const yearAgo = new Date(range.to.getTime() - 365 * 24 * 3600 * 1000);
  olderQ.set("preset", "custom");
  olderQ.set("from", yearAgo.toISOString().slice(0, 10));
  olderQ.set("to", range.to.toISOString().slice(0, 10));

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("countLabel", { count: feed.total, range: formatRangeLabelInTz(range, anchorTz) })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TableControls searchPlaceholder={t("searchPlaceholder")} perPageLabel={tRoot("admin.reportOrdersList.perPage")} />
          <FeedFilters
            restaurants={restaurants.map((r) => ({ id: r.id, name: r.name }))}
            types={FEED_TYPES.map((ty) => ({ value: ty, label: typeLabel(ty) }))}
            allRestaurantsLabel={t("allRestaurants")}
            allTypesLabel={t("allTypes")}
          />
          <DateRangePicker />
          <Link
            href={`${basePath}/export?${buildQuery(sp)}`}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
          >
            <Download className="w-3.5 h-3.5" />
            {t("export")}
          </Link>
        </div>
      </header>

      {/* Status chips with live counts — Fabrizio's "at a glance". */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {chip(null, tRoot("admin.orders.all"), feed.counts.all)}
        {FEED_STATUSES.filter((s) => feed.counts[s] > 0 || s === status).map((s) =>
          chip(s, statusLabel(s), feed.counts[s]),
        )}
      </div>

      {mixedCurrency && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{t("mixedCurrencyNote")}</p>}
      {feed.depthCapped && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{t("narrowRange")}</p>}

      <OrdersTable rows={rows} labels={labels} />

      <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
        <Link href={`${basePath}?${olderQ.toString()}`} className="text-sm text-gray-600 underline hover:text-gray-900">
          {t("showOlder")}
        </Link>
      </div>

      {feed.pageCount > 1 && (
        <Pagination
          current={page}
          total={feed.pageCount}
          sp={sp}
          labelPage={tRoot("admin.reportOrdersList.paginationPage", { current: page, total: feed.pageCount })}
          labelPrevious={tRoot("admin.reportOrdersList.paginationPrevious")}
          labelNext={tRoot("admin.reportOrdersList.paginationNext")}
        />
      )}
    </div>
  );
}

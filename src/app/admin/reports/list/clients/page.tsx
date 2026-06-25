import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { getRestaurantCurrency, getRestaurantTimezone } from "@/lib/restaurant-currency";
import { formatRangeLabel } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";

/**
 * /admin/reports/list/clients
 *
 * Paginated list of customers who ordered within the date range,
 * sorted by total-spend descending. Matches the GloriaFood
 * "List View → Clients" screenshot.
 *
 * Note: "clients" and "customers" mean the same thing — GloriaFood
 * uses "clients" in their reports IA, /admin/customers is the
 * editable list we already had. This page is read-only and
 * date-scoped.
 */
const PAGE_SIZE = 20;

export default async function ListClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.reportClientsList");
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;
  const [__currency, __timezone] = await Promise.all([
    getRestaurantCurrency(restaurantId),
    getRestaurantTimezone(restaurantId),
  ]);
  const formatCurrency = (n: number) => fmtCurrency(n, __currency);
  const range = parseDateRangeInTz(sp, __timezone ?? undefined);

  // For "customers in range" we groupBy customerId on Order within
  // the date range, then resolve names in a second query. Two
  // round-trips but each one uses an index — preferable to a
  // findMany on Customer with a relation filter (which would scan
  // every Customer for the restaurant even if they didn't order
  // in-range). Same canonical predicate as the rest of Reports.
  const groupedAll = await prisma.order.groupBy({
    by: ["customerId"],
    where: { ...reportOrderWhere(restaurantId, range), customerId: { not: null } },
    _count: true,
    _sum: { total: true },
  });
  // Sort + paginate the grouped rows in-process (cheap — typically
  // a few hundred to a few thousand distinct customers per range).
  const grouped = groupedAll
    .sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0))
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const customerIds = grouped.map((g) => g.customerId!).filter(Boolean);
  const customers = customerIds.length > 0
    ? await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true, email: true, phone: true, totalOrders: true, totalSpent: true, createdAt: true },
      })
    : [];
  const byId = new Map(customers.map((c) => [c.id, c]));

  // LIFETIME totals — recompute from real orders (canonical predicate, no date
  // filter) instead of trusting the denormalized Customer.totalOrders/totalSpent
  // columns (nothing keeps them in sync → they drift). Bounded to this page's
  // ≤20 customers, indexed on (restaurantId, customerId). Fixes the in-range vs
  // lifetime mismatch owners would otherwise see.
  const lifetimeRows = customerIds.length > 0
    ? await prisma.order.groupBy({
        by: ["customerId"],
        where: { ...REPORT_ORDER_STATUS_WHERE, restaurantId, customerId: { in: customerIds } },
        _count: true,
        _sum: { total: true },
      })
    : [];
  const lifetimeById = new Map(
    lifetimeRows.map((r) => [r.customerId!, { orders: r._count, spend: r._sum.total ?? 0 }]),
  );

  const totalCustomers = groupedAll.length;
  const pageCount = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("customersOrderedDescription", { count: totalCustomers, rangeLabel: formatRangeLabel(range) })}</p>
        </div>
        <DateRangePicker />
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{t("colCustomer")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colContact")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colOrdersInRange")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colSpendInRange")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colLifetimeOrders")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colLifetimeSpend")}</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={6} className="py-6 px-4 text-center text-gray-400 italic">{t("emptyState")}</td></tr>
            )}
            {grouped.map((g) => {
              const c = byId.get(g.customerId!);
              if (!c) return null;
              // Customer name links into the editable CRM detail page —
              // /admin/customers/[id] — so an owner can jump straight
              // from "this customer spent $X this month" to assigning
              // them a coupon / adding internal notes / contacting them.
              return (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-medium text-gray-800">
                    <a
                      href={`/admin/customers/${c.id}`}
                      className="hover:text-emerald-700 hover:underline"
                      title={t("linkTitle")}
                    >
                      {c.name}
                    </a>
                  </td>
                  <td className="py-2.5 px-4 text-gray-500 text-xs">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div>{c.phone}</div>}
                  </td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{g._count.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(g._sum.total ?? 0)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-500">{(lifetimeById.get(c.id)?.orders ?? c.totalOrders).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{formatCurrency(lifetimeById.get(c.id)?.spend ?? c.totalSpent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="absolute bottom-3 right-3">
          <ExportMenu exportUrl="/api/admin/reports/list/clients/export" currentQuery={buildQuery(sp)} />
        </div>
      </div>

      {pageCount > 1 && <Pagination current={page} total={pageCount} sp={sp} t={t} />}
    </div>
  );
}

function Pagination({ current, total, sp, t }: { current: number; total: number; sp: Record<string, string | string[] | undefined>; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const mk = (p: number) => { const u = new URLSearchParams(buildQuery(sp)); u.set("page", String(p)); return `?${u.toString()}`; };
  return (
    <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
      <span>{t("paginationLabel", { current, total })}</span>
      <div className="flex gap-1">
        {current > 1 && <a href={mk(current - 1)} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">{t("paginationPrevious")}</a>}
        {current < total && <a href={mk(current + 1)} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">{t("paginationNext")}</a>}
      </div>
    </div>
  );
}

function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k === "page") continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}

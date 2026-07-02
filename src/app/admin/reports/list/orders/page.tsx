import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { TableControls } from "@/components/admin/reports/TableControls";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/list/orders
 *
 * Flat paginated list of orders within the selected date range —
 * mirrors the GloriaFood "List View → Orders" screenshot. 20 rows
 * per page, query-paginated via `?page=`.
 *
 * Stays distinct from /admin/orders (operational queue showing
 * today's pending/in-progress orders) — this is the historical /
 * reporting view that scans 4 years deep.
 */
const PAGE_SIZES = [20, 50, 100];

function pickSize(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return PAGE_SIZES.includes(n) ? n : 20;
}

export default async function ListOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("admin.reportOrdersList");
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const size = pickSize(sp.size);
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() || "";

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;
  const scope = await resolveReportScope(restaurantId);
  const formatCurrency = (n: number) => fmtCurrency(n, scope.currency);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  // Optional ?status= drill-down (e.g. the Dashboard's "Completed orders" KPI).
  // Allowlist real, fulfilled-ish statuses ONLY — never rejected/cancelled —
  // so the spread override below can't bring back excluded orders. Absent /
  // unknown status → chain-wide, all real orders.
  const statusParam = (Array.isArray(sp.status) ? sp.status[0] : sp.status)?.trim();
  const allowedStatus = (["completed", "pending", "accepted"] as const).find((s) => s === statusParam);

  // Run count + page query in parallel. count is cheap (uses the composite
  // index). Same canonical predicate as the rest of Reports so the count
  // matches the Dashboard (excludes rejected/cancelled + TEST orders), rolled
  // up across every location in scope. The optional search filters by customer
  // name / email / phone, SERVER-side.
  const where = {
    ...reportOrderWhere(scope.ids, range),
    ...(allowedStatus ? { status: allowedStatus } : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerEmail: { contains: q, mode: "insensitive" as const } },
            { customerPhone: { contains: q } },
          ],
        }
      : {}),
  };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        customerName: true,
        total: true,
        paymentMethod: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: size,
      skip: (page - 1) * size,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / size));

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("orderCountLabel", { count: total, range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TableControls searchPlaceholder={t("searchPlaceholder")} perPageLabel={t("perPage")} />
          <DateRangePicker />
          <ExportMenu exportUrl="/api/admin/reports/list/orders/export" currentQuery={buildQuery(sp)} compact={false} />
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{t("colNumber")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colDate")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colCustomer")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colType")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colPayment")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colStatus")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={7} className="py-6 px-4 text-center text-gray-400 italic">{t("emptyState")}</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2.5 px-4">
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-emerald-600 hover:text-emerald-800">
                    #{o.orderNumber}
                  </Link>
                </td>
                <td className="py-2.5 px-4 text-gray-600 text-xs">{o.createdAt.toLocaleString(undefined, scope.timezone ? { timeZone: scope.timezone } : {})}</td>
                <td className="py-2.5 px-4 text-gray-800">{o.customerName}</td>
                <td className="py-2.5 px-4 text-gray-600">{o.type === "dine_in" ? t("typeDineIn") : o.type.charAt(0).toUpperCase() + o.type.slice(1)}</td>
                <td className="py-2.5 px-4 text-gray-600 capitalize">{o.paymentMethod}</td>
                <td className="py-2.5 px-4"><StatusBadge status={o.status} /></td>
                <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {pageCount > 1 && (
        <Pagination current={page} total={pageCount} sp={sp} labelPage={t("paginationPage", { current: page, total: pageCount })} labelPrevious={t("paginationPrevious")} labelNext={t("paginationNext")} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700",
    pending:   "bg-amber-50   text-amber-700",
    accepted:  "bg-blue-50    text-blue-700",
    rejected:  "bg-red-50     text-red-700",
    cancelled: "bg-gray-100   text-gray-600",
  };
  const cls = palette[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

function Pagination({ current, total, sp, labelPage, labelPrevious, labelNext }: { current: number; total: number; sp: Record<string, string | string[] | undefined>; labelPage: string; labelPrevious: string; labelNext: string }) {
  const mk = (p: number) => { const u = new URLSearchParams(buildQuery(sp)); u.set("page", String(p)); return `?${u.toString()}`; };
  return (
    <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
      <span>{labelPage}</span>
      <div className="flex gap-1">
        {current > 1 && <a href={mk(current - 1)} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">{labelPrevious}</a>}
        {current < total && <a href={mk(current + 1)} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">{labelNext}</a>}
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

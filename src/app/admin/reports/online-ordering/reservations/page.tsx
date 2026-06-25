import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/online-ordering/reservations
 *
 * If the restaurant has the reservations service enabled AND has any
 * reservations in the date range, show a status breakdown table.
 * Otherwise show the GloriaFood-style "enable service" prompt.
 *
 * Note: `Reservation.date` is stored as a "YYYY-MM-DD" string (legacy
 * schema choice that predates this report). String comparison still
 * works for range filtering since ISO-format dates sort
 * lexicographically.
 */
export default async function ReservationsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const t = await getTranslations("admin.reportReservations");

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;

  const scope = await resolveReportScope(restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  // groupBy.status — matches the GloriaFood report shape and is cheap.
  // _count and _sum are wrapped in an object form so Prisma's TS types
  // know the result fields are present (vs the shorthand `_count: true`
  // which is more permissive).
  const rows = await prisma.reservation.groupBy({
    by: ["status"],
    where: {
      restaurantId: { in: scope.ids },
      date: { gte: toISODate(range.from), lte: toISODate(range.to) },
    },
    _count: { _all: true },
    _sum: { partySize: true },
  });

  if (rows.length === 0) {
    return (
      <ComingSoonPlaceholder
        title={t("title")}
        subtitle={t("emptySubtitle", { range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}
        what={t("what")}
        requires={[
          { label: t("requiresServiceEnabled"), status: "collecting" },
          { label: t("requiresBookingsInRange"), status: "not_started" },
        ]}
        eta={t("eta")}
      >
        <Link
          href="/admin/services"
          className="inline-flex items-center px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded hover:bg-emerald-600 transition"
        >
          {t("enableService")}
        </Link>
      </ComingSoonPlaceholder>
    );
  }

  const total = rows.reduce((s, r) => s + r._count._all, 0);
  const totalGuests = rows.reduce((s, r) => s + (r._sum.partySize ?? 0), 0);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("summary", { bookings: total.toLocaleString(), guests: totalGuests.toLocaleString(), range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}</p>
        </div>
        <DateRangePicker />
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{t("colStatus")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colBookings")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colGuests")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colPctOfTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = total > 0 ? (r._count._all / total) * 100 : 0;
              return (
                <tr key={r.status} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-medium text-gray-800 capitalize">{r.status.replace("_", " ")}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{r._count._all.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{(r._sum.partySize ?? 0).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-gray-600">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

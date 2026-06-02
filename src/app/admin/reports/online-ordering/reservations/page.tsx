import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseDateRange, formatRangeLabel, toISODate } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";
import Link from "next/link";

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
  const range = parseDateRange(sp);

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  // groupBy.status — matches the GloriaFood report shape and is cheap.
  // _count and _sum are wrapped in an object form so Prisma's TS types
  // know the result fields are present (vs the shorthand `_count: true`
  // which is more permissive).
  const rows = await prisma.reservation.groupBy({
    by: ["status"],
    where: {
      restaurantId,
      date: { gte: toISODate(range.from), lte: toISODate(range.to) },
    },
    _count: { _all: true },
    _sum: { partySize: true },
  });

  if (rows.length === 0) {
    return (
      <ComingSoonPlaceholder
        title="Table Reservations"
        subtitle={`No reservations in ${formatRangeLabel(range)}.`}
        what="Reservation volumes, no-show rate, average party size, peak times — all the metrics you need to staff the floor for the right number of covers."
        requires={[
          { label: "Reservations service enabled", status: "collecting" },
          { label: "Bookings flowing in within the selected range", status: "not_started" },
        ]}
        eta="Activates automatically once you have reservations in the system."
      >
        <Link
          href="/admin/services"
          className="inline-flex items-center px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded hover:bg-emerald-600 transition"
        >
          Enable service
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
          <h1 className="text-2xl font-bold text-gray-900">Table Reservations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} bookings · {totalGuests.toLocaleString()} guests · {formatRangeLabel(range)}</p>
        </div>
        <DateRangePicker />
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">Status</th>
              <th className="py-2.5 px-4 font-semibold text-right">Bookings</th>
              <th className="py-2.5 px-4 font-semibold text-right">Guests</th>
              <th className="py-2.5 px-4 font-semibold text-right">% of total</th>
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

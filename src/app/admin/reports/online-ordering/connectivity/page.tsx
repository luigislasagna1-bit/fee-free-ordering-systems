import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { Wifi, AlertCircle } from "lucide-react";
import { eachDay, parseDateRange, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { FRESHNESS_MS } from "@/lib/kitchen-devices";

/**
 * /admin/reports/online-ordering/connectivity
 *
 * Kitchen device uptime. Matches the GloriaFood layout: 7-day uptime
 * percentage + per-day 24-hour timeline bars with green = online,
 * red = offline, color-coded against the configured open/close hours.
 *
 * Data path: ConnectivityEvent rows (sparse — one per
 * offline→online transition, fired by recordHeartbeat) are replayed
 * to reconstruct online periods. Gaps between events that exceed
 * FRESHNESS_MS count as offline.
 *
 * When the log is empty (just shipped, or new restaurant) we still
 * show the "current state" header so the page is useful from day 1 —
 * the timeline simply renders as a grey "no data yet" band per day.
 */

const OFFLINE_AFTER_MS = FRESHNESS_MS;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function ConnectivityReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  const [devices, events] = await Promise.all([
    prisma.kitchenDevice.findMany({
      where: { restaurantId },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.connectivityEvent.findMany({
      where: {
        restaurantId,
        // Pull one extra day BEFORE the range start so the first day's
        // online-state at midnight is computable (otherwise the day
        // starts as "unknown" when the device has been online since
        // last week).
        occurredAt: { gte: new Date(range.from.getTime() - DAY_MS), lte: range.to },
      },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const now = Date.now();
  const onlineNow = devices.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS);
  const offlineNow = devices.filter((d) => !d.lastSeenAt || now - d.lastSeenAt.getTime() >= OFFLINE_AFTER_MS);

  // Reconstruct online intervals per device.
  //
  // An "online" event marks the start of an interval. The interval
  // ends at the LAST heartbeat we observed for that device (which is
  // approximately `lastSeenAt`, capped at `range.to`). For older
  // intervals where the device has since been offline + come back,
  // the interval ends at the timestamp of the next event minus
  // FRESHNESS_MS (the moment we'd have considered it offline).
  type Interval = { deviceHash: string; start: number; end: number };
  const intervals: Interval[] = [];
  const byDevice = new Map<string, typeof events>();
  for (const e of events) {
    const arr = byDevice.get(e.deviceHash) ?? [];
    arr.push(e);
    byDevice.set(e.deviceHash, arr);
  }
  for (const [deviceHash, evs] of byDevice.entries()) {
    const device = devices.find((d) => d.deviceHash === deviceHash);
    const lastSeen = device?.lastSeenAt?.getTime() ?? null;
    for (let i = 0; i < evs.length; i++) {
      const start = evs[i].occurredAt.getTime();
      // Where does this online interval end?
      //   - If there's a NEXT online event whose gap > FRESHNESS_MS,
      //     the device went offline at (next.start - FRESHNESS_MS).
      //   - Otherwise the interval runs to the device's lastSeenAt
      //     (or range.to, whichever is earlier).
      let end: number;
      if (i < evs.length - 1) {
        // Mid-history interval — bounded by the next online event.
        // Conservative: assume offline from (last heartbeat) onward.
        // Without per-heartbeat logs we approximate by stopping the
        // interval at the next online event's start (the new event
        // implies the device was offline immediately before).
        end = evs[i + 1].occurredAt.getTime();
      } else {
        // Last interval — runs up to lastSeenAt + FRESHNESS_MS
        // (we know it was alive at lastSeenAt; assume potentially up
        // to one freshness window after).
        end = lastSeen ? lastSeen + FRESHNESS_MS : start + FRESHNESS_MS;
      }
      end = Math.min(end, range.to.getTime());
      if (end > start) intervals.push({ deviceHash, start, end });
    }
  }

  // Per-day rollup: count of online ms across all devices, summed.
  // For the "% online" we treat each device's daily 24h as a
  // denominator and sum across devices. With N devices the max is
  // N × 24h per day.
  const days = eachDay(range);
  const numDevices = Math.max(devices.length, 1);
  const dayStats = days.map((d) => {
    const dayStart = d.getTime();
    const dayEnd = dayStart + DAY_MS;
    let onlineMs = 0;
    for (const iv of intervals) {
      const s = Math.max(iv.start, dayStart);
      const e = Math.min(iv.end, dayEnd);
      if (e > s) onlineMs += e - s;
    }
    const denominatorMs = numDevices * DAY_MS;
    const pct = denominatorMs > 0 ? (onlineMs / denominatorMs) * 100 : 0;
    return { date: d, onlineMs, pct: Math.min(100, pct) };
  });
  const overallPct = dayStats.length > 0
    ? dayStats.reduce((s, d) => s + d.pct, 0) / dayStats.length
    : 0;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connectivity Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Are your kitchen devices online? · {formatRangeLabel(range)}
          </p>
        </div>
        <DateRangePicker />
      </header>

      {/* Headline score — GloriaFood-style "X% connectivity health" with a
          target of >95%. Goes green when above target, amber when below. */}
      <div
        className={`rounded-xl border shadow-sm p-5 mb-4 flex items-start gap-3 ${
          overallPct >= 95
            ? "bg-emerald-50 border-emerald-200"
            : overallPct >= 80
              ? "bg-amber-50 border-amber-200"
              : "bg-red-50 border-red-200"
        }`}
      >
        <Wifi className={`w-6 h-6 mt-0.5 ${overallPct >= 95 ? "text-emerald-600" : overallPct >= 80 ? "text-amber-600" : "text-red-600"}`} />
        <div className="flex-1">
          <div className={`font-bold text-lg ${overallPct >= 95 ? "text-emerald-900" : overallPct >= 80 ? "text-amber-900" : "text-red-900"}`}>
            {overallPct.toFixed(1)}% Connectivity health
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Average across all kitchen devices over {dayStats.length} day(s). Target: 95% or higher.
            {events.length === 0 && (
              <span className="italic block mt-1">
                The transition log is empty — the timeline below populates as devices come and go.
                Current online/offline status is shown from the live heartbeat.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Now: live online/offline split */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="w-5 h-5 text-emerald-600" />
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-700">Online now</span>
          </div>
          <div className="text-3xl font-bold text-emerald-700">{onlineNow.length}</div>
          <div className="text-xs text-gray-500 mt-1">device(s) reporting in</div>
        </div>
        <div className={`bg-white rounded-xl border ${offlineNow.length > 0 ? "border-red-200" : "border-gray-100"} shadow-sm p-5`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className={`w-5 h-5 ${offlineNow.length > 0 ? "text-red-500" : "text-gray-400"}`} />
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">Offline now</span>
          </div>
          <div className={`text-3xl font-bold ${offlineNow.length > 0 ? "text-red-600" : "text-gray-400"}`}>{offlineNow.length}</div>
          <div className="text-xs text-gray-500 mt-1">not heard from in &gt;{Math.round(OFFLINE_AFTER_MS / 1000)}s</div>
        </div>
      </div>

      {/* Per-day timeline bars */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">Daily uptime</h2>
        <div className="space-y-2">
          {dayStats.map((d) => (
            <div key={d.date.toISOString()}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700">
                  {d.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className={`font-semibold ${d.pct >= 95 ? "text-emerald-700" : d.pct >= 80 ? "text-amber-700" : "text-red-700"}`}>
                  {d.pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${d.pct >= 95 ? "bg-emerald-500" : d.pct >= 80 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${d.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Devices roster */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">Device</th>
              <th className="py-2.5 px-4 font-semibold">User agent</th>
              <th className="py-2.5 px-4 font-semibold">First seen</th>
              <th className="py-2.5 px-4 font-semibold">Last seen</th>
              <th className="py-2.5 px-4 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr><td colSpan={5} className="py-6 px-4 text-center text-gray-400 italic">No kitchen devices registered. Open the kitchen page on a tablet to see it here.</td></tr>
            )}
            {devices.map((d) => {
              const isOnline = d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS;
              return (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-medium text-gray-800">{d.label || "Unnamed device"}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 max-w-xs truncate">{d.userAgent ?? "—"}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-500">{d.firstSeenAt?.toLocaleString() ?? "—"}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-500">{d.lastSeenAt?.toLocaleString() ?? "—"}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {isOnline ? "Online" : "Offline"}
                    </span>
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

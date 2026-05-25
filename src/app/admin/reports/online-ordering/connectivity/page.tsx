import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { Wifi, AlertCircle } from "lucide-react";

/**
 * /admin/reports/online-ordering/connectivity
 *
 * Kitchen device uptime. GloriaFood's version targets >95% across a
 * 7-day rolling window with per-day timeline bars. Ours starts as a
 * simpler "current online/offline" view backed by KitchenDevice.lastSeenAt
 * (already populated) — the multi-day timeline arrives when the
 * ConnectivityEvent log starts accruing data.
 *
 * The 60-second threshold matches the existing kitchen-app heartbeat
 * cadence (polls every 4s, we declare offline after a 15× margin).
 */
const OFFLINE_AFTER_MS = 60 * 1000;

export default async function ConnectivityReportPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  const devices = await prisma.kitchenDevice.findMany({
    where: { restaurantId },
    orderBy: { lastSeenAt: "desc" },
  });

  const now = Date.now();
  const online = devices.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS);
  const offline = devices.filter((d) => !d.lastSeenAt || now - d.lastSeenAt.getTime() >= OFFLINE_AFTER_MS);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Connectivity Health</h1>
        <p className="text-sm text-gray-500 mt-0.5">Are your kitchen devices online?</p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="w-5 h-5 text-emerald-600" />
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-700">Online now</span>
          </div>
          <div className="text-3xl font-bold text-emerald-700">{online.length}</div>
          <div className="text-xs text-gray-500 mt-1">device(s) reporting in</div>
        </div>
        <div className={`bg-white rounded-xl border ${offline.length > 0 ? "border-red-200" : "border-gray-100"} shadow-sm p-5`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className={`w-5 h-5 ${offline.length > 0 ? "text-red-500" : "text-gray-400"}`} />
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">Offline now</span>
          </div>
          <div className={`text-3xl font-bold ${offline.length > 0 ? "text-red-600" : "text-gray-400"}`}>{offline.length}</div>
          <div className="text-xs text-gray-500 mt-1">device(s) not heard from in &gt;60s</div>
        </div>
      </div>

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

      <p className="text-xs text-gray-400 italic mt-3">
        7-day rolling uptime timeline (the GloriaFood-style per-hour bars) ships once the ConnectivityEvent log has accumulated a few days of data.
      </p>
    </div>
  );
}

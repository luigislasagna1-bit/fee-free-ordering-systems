"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Play } from "lucide-react";

/**
 * "Build week" — superadmin manual trigger for the driver-payout weekly rollup.
 * Defaults to the Sat→Fri week that just closed; the optional YYYY-MM-DD input
 * (any day in the target week) back-fills or rebuilds a specific week. Idempotent:
 * pending rows are refreshed, paid rows are never touched.
 */
export function BuildWeekButton() {
  const router = useRouter();
  const [week, setWeek] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const url = week
        ? `/api/superadmin/driver-payouts/build?weekStart=${encodeURIComponent(week)}`
        : "/api/superadmin/driver-payouts/build";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Build failed");
        return;
      }
      toast.success(`Built ${data.built} payout row${data.built === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Build failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="YYYY-MM-DD (optional)"
        value={week}
        onChange={(e) => setWeek(e.target.value)}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-40 font-mono"
        disabled={running}
      />
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow flex items-center gap-2"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Building…</>
        ) : (
          <><Play className="w-4 h-4" /> Build week</>
        )}
      </button>
    </div>
  );
}

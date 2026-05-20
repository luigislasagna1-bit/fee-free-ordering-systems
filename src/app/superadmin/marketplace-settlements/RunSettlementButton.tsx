"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Play } from "lucide-react";

/**
 * "Run settlement now" — superadmin manual trigger for the marketplace
 * settlement cron. Defaults to settling the month that just closed; an
 * input lets the operator override the target month (YYYY-MM) for
 * back-fills or testing.
 */
export function RunSettlementButton() {
  const router = useRouter();
  const [month, setMonth] = useState<string>("");
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const url = month
        ? `/api/cron/marketplace-settle?month=${encodeURIComponent(month)}`
        : "/api/cron/marketplace-settle";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Settlement run failed");
        return;
      }
      const counts = data.counts as Record<string, number>;
      const summary = Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(" · ");
      toast.success(`Settlement complete — ${summary || "no work"}`);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Settlement run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="YYYY-MM (optional)"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-36 font-mono"
        disabled={running}
      />
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow flex items-center gap-2"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
        ) : (
          <><Play className="w-4 h-4" /> Run settlement now</>
        )}
      </button>
    </div>
  );
}

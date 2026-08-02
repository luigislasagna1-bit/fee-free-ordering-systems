"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Apple, Play } from "lucide-react";
import { ownerOfNextAction, type BrandedAppStatus } from "@/lib/branded-app/status";

type Row = {
  id: string; platform: "android" | "ios"; status: BrandedAppStatus;
  packageName: string | null; storeUrl: string | null;
  accessVerifiedAt: string | null; lastBuildAt: string | null; liveAt: string | null;
  updatedAt: string;
  project: {
    id: string; appName: string | null; platformsRequested: string;
    approvedAt: string | null; approvedConfigVersion: number;
    restaurant: { id: string; name: string; slug: string };
  };
};

const TABS = [
  { key: "ours", label: "Needs us", statuses: ["submitted", "building"] },
  { key: "owner", label: "Waiting on owner", statuses: ["draft", "needs_owner"] },
  { key: "store", label: "In store review", statuses: ["in_store_review"] },
  { key: "live", label: "Live", statuses: ["live"] },
  { key: "suspended", label: "Paused", statuses: ["suspended"] },
  { key: "all", label: "All", statuses: [] },
] as const;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
  needs_owner: "bg-amber-100 text-amber-700",
  building: "bg-indigo-100 text-indigo-700",
  in_store_review: "bg-purple-100 text-purple-700",
  live: "bg-emerald-100 text-emerald-700",
  suspended: "bg-red-100 text-red-700",
};

export default function BrandedAppsQueueClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("ours");

  useEffect(() => {
    void fetch("/api/superadmin/branded-apps")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setRows(d.rows ?? []));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const def = TABS.find((t) => t.key === tab)!;
    // Hide unapproved drafts from "Waiting on owner" noise? No — drafts ARE
    // waiting on the owner; show them but the queue defaults to "Needs us".
    return def.statuses.length === 0 ? rows : rows.filter((r) => (def.statuses as readonly string[]).includes(r.status));
  }, [rows, tab]);

  if (rows === null) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t2) => {
          const count = t2.statuses.length === 0 ? rows.length : rows.filter((r) => (t2.statuses as readonly string[]).includes(r.status)).length;
          return (
            <button key={t2.key} onClick={() => setTab(t2.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${tab === t2.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t2.label} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Nothing here right now.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="px-4 py-2.5">Restaurant</th>
                <th className="px-4 py-2.5">App</th>
                <th className="px-4 py-2.5">Platform</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Next action</th>
                <th className="px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/superadmin/branded-apps/${r.project.id}`} className="font-medium text-gray-900 hover:underline">
                      {r.project.restaurant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.project.appName ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      {r.platform === "ios" ? <Apple className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {r.platform}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{ownerOfNextAction(r.status)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(r.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

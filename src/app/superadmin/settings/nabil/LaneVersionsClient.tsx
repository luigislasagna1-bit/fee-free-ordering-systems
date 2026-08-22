"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Phase B (2026-08-22): which build each Nabil lane is running — read live
 * from each Fly app's /version. Internal (superadmin) — English by policy.
 */
type Lane = {
  channel: string;
  agentVersion: string | null;
  gitSha: string | null;
  coreVersion: string | null;
  coreContentHash: string | null;
  toolsVersion: string | null;
  model: string | null;
  flyRegion: string | null;
};
type Resp = { current: Lane | { error: string } | null; staging: Lane | { error: string } | null; appVersion: string | null; checkedAt: string };

function Chip({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : tone === "warn" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-gray-50 text-gray-600 border-gray-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-mono ${cls}`}>{children}</span>;
}

function LaneRow({ name, lane }: { name: string; lane: Lane | { error: string } | null }) {
  if (!lane) return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-16 font-semibold text-gray-700">{name}</span>
      <Chip tone="muted">not configured</Chip>
    </div>
  );
  if ("error" in lane) return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-16 font-semibold text-gray-700">{name}</span>
      <Chip tone="warn">unreachable: {lane.error}</Chip>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-16 font-semibold text-gray-700">{name}</span>
      <Chip tone="ok">build {lane.agentVersion ?? "?"}</Chip>
      <Chip tone="muted">core {lane.coreVersion ?? "?"}+{lane.coreContentHash ?? "?"}</Chip>
      {lane.gitSha && lane.gitSha !== lane.agentVersion ? <Chip tone="muted">sha {lane.gitSha}</Chip> : null}
      <Chip tone="muted">tools {lane.toolsVersion ?? "?"}</Chip>
      <Chip tone="muted">{lane.model ?? "?"}</Chip>
      {lane.flyRegion ? <Chip tone="muted">{lane.flyRegion}</Chip> : null}
    </div>
  );
}

export function LaneVersionsClient() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/voice-lanes", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Resp);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const drift =
    data && data.current && data.staging && !("error" in data.current) && !("error" in data.staging) && data.current.coreVersion && data.staging.coreVersion && data.current.coreVersion !== data.staging.coreVersion;

  return (
    <div className="max-w-6xl mx-auto px-6 pb-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Lane builds (live from each Fly app)</div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Re-check
          </button>
        </div>
        {data ? (
          <>
            <LaneRow name="LIVE" lane={data.current} />
            <LaneRow name="STAGING" lane={data.staging} />
            <div className="text-[11px] text-gray-400">
              app build {data.appVersion ?? "?"} · checked {new Date(data.checkedAt).toLocaleTimeString()}
              {drift ? <span className="ml-2 text-amber-700 font-semibold">· core versions differ between lanes (expected while a change is on staging)</span> : null}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-400">{loading ? "Checking…" : "—"}</div>
        )}
      </div>
    </div>
  );
}

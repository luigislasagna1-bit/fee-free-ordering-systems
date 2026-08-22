import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/platform-auth";

/**
 * GET /api/superadmin/voice-lanes — which build each Nabil lane is running
 * (Phase B, 2026-08-22). Fetches `/version` from the live and staging Fly
 * apps (derived from the wss URLs) with a short timeout, so a promotion or
 * rollback can be confirmed from the Phone Lines page without a terminal.
 * Superadmin only; never cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type LaneVersion = {
  channel: string;
  agentVersion: string | null;
  gitSha: string | null;
  coreVersion: string | null;
  coreContentHash: string | null;
  toolsVersion: string | null;
  model: string | null;
  flyRegion: string | null;
};

function versionUrl(wss: string | undefined): string | null {
  const s = (wss || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const proto = u.protocol === "ws:" ? "http:" : "https:";
    return `${proto}//${u.host}/version`;
  } catch {
    return null;
  }
}

async function fetchLane(url: string | null): Promise<LaneVersion | { error: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2_500) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const j = (await res.json()) as Partial<LaneVersion>;
    return {
      channel: String(j.channel ?? "?"),
      agentVersion: j.agentVersion ?? null,
      gitSha: j.gitSha ?? null,
      coreVersion: j.coreVersion ?? null,
      coreContentHash: j.coreContentHash ?? null,
      toolsVersion: j.toolsVersion ?? null,
      model: j.model ?? null,
      flyRegion: j.flyRegion ?? null,
    };
  } catch (e) {
    return { error: String((e as Error)?.name === "TimeoutError" ? "timeout" : (e as Error)?.message ?? e).slice(0, 80) };
  }
}

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [current, staging] = await Promise.all([
    fetchLane(versionUrl(process.env.NABIL_VOICE_WSS_URL)),
    fetchLane(versionUrl(process.env.NABIL_VOICE_STAGING_WSS_URL)),
  ]);
  return NextResponse.json({ current, staging, appVersion: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || null, checkedAt: new Date().toISOString() });
}

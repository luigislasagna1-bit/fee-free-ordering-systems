"use client";
import { useEffect, useRef, useState } from "react";
import { Bike, History, Radio, RefreshCw, Star, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ASSIGNMENT_TERMINAL } from "@/lib/driver-assignment";
import { DriverQueue } from "./DriverQueue";
import { DriverHistory } from "./DriverHistory";
import { DriverProfile } from "./DriverProfile";
import { RoleSwitch } from "./RoleSwitch";
import { BottomNav, type BottomNavTab } from "./shared/BottomNav";
import { ShellHeader } from "./shared/ShellHeader";
import { armAudioUnlock, playNewOrderChime, playTick } from "./shared/driver-sounds";
import { formatPct } from "./shared/format-pct";

/**
 * DriverApp — the driver-role app shell (v1.1 plan §3.1). Tabs are React
 * STATE, never routes: no new auth-dependent server redirects → no
 * redirect-cache surface (kitchen precedent). Phase 3 shipped Jobs +
 * Profile; Phase 4 adds History. The remaining future tab (Earnings)
 * appears when its phase ships, never as a dead placeholder.
 *
 * LOAD-BEARING: DriverQueue stays MOUNTED AT ALL TIMES and is hidden with
 * CSS when another tab is active — NEVER unmounted. Its GPS streaming
 * effect, 8s queue poll and 30s heartbeat live inside it; unmounting would
 * kill location streaming mid-delivery (plan §3.1 / §8).
 *
 * ONE ShellHeader is rendered here, shared across ALL tabs (plan §3.1:
 * "Header shared across tabs … RoleSwitch mounts here") — RoleSwitch mounts
 * in it exactly once (§2.4) and is therefore visible on the default Jobs
 * landing tab, the escape hatch for the dual-role / stale-driver-cookie
 * story (§2.3/§2.4/§2.6). DriverQueue's internal header is suppressed
 * (hideHeader) — a visual delta only; its GPS chip and refresh live on in
 * the shared header via the onGpsChange mirror + refreshToken bump, and the
 * queue's behavior (poll/GPS/heartbeat) is untouched (§3.2).
 */

type TabId = "jobs" | "history" | "profile";

// Forward order of the driver stage machine — used ONLY to detect "my job
// advanced" for the confirmation tick (driver-sounds). picked_up and
// out_for_delivery are the same leg (JobCard treats them identically), so
// they share a rank and no tick fires between them.
const STAGE_RANK: Record<string, number> = {
  queued: 0,
  accepted: 1,
  started: 2,
  picked_up: 3,
  out_for_delivery: 3,
  delivered: 4,
};

export function DriverApp({
  driverName,
  rating,
  hasOtherRole,
}: {
  driverName: string;
  rating: number | null;
  /** Whether an admin session is also present on this device (page.tsx passes it; plan §2.3). */
  hasOtherRole: boolean;
}) {
  const t = useTranslations("driver");
  const locale = useLocale();
  const [tab, setTab] = useState<TabId>("jobs");
  // History/Profile mount lazily on first visit, then STAY mounted (their
  // active-prop effect refetches on every activation — 5a0d9860 gate rule).
  const [historyMounted, setHistoryMounted] = useState(false);
  const [profileMounted, setProfileMounted] = useState(false);
  // Mirror of DriverQueue's already-polled queue (via onAssignmentsChange) —
  // the Jobs badge AND the sound diffs derive from it. NO second poll exists
  // for this. DriverQueue already passes its full Assignment objects into the
  // callback, so widening this STATE type to include `id` is purely a
  // DriverApp-side change — zero DriverQueue edits.
  const [queue, setQueue] = useState<{ id: string; mine: boolean; status: string }[]>([]);
  // Mirror of DriverQueue's GPS-streaming flag (via onGpsChange) — feeds the
  // shared header's live chip. Streaming continues across tabs (the queue
  // stays mounted), so the chip stays truthful on every tab.
  const [gpsOn, setGpsOn] = useState(false);
  // Bumped by the shared header's refresh button → one manual queue load.
  const [jobsRefreshToken, setJobsRefreshToken] = useState(0);

  const myOpenJobs = queue.filter((a) => a.mine && !ASSIGNMENT_TERMINAL.has(a.status)).length;

  // ── Sounds (Luigi 2026-07-17) — all derived from the queue mirror above;
  // no extra polls, no DriverQueue edits, pure WebAudio (driver-sounds.ts). ──

  // One-time audio unlock gesture listener. Until the first tap, a requested
  // chime is queued inside the module and plays right after unlock — so a
  // driver opening the app to waiting jobs still hears there is work.
  useEffect(() => armAudioUnlock(), []);

  // Diff the mirror between updates. Chime when a NEW unaccepted job appears
  // (the very first data mirror counts — open-the-app-to-work should sound);
  // tick when one of MY jobs advances a stage. Never sound while hidden —
  // a backgrounded device is the push notification's job, and jobs that
  // arrived while hidden are baselined here so returning doesn't ring for
  // them (the 20s repeat below covers any still-unaccepted work).
  const prevQueueRef = useRef<Map<string, { mine: boolean; status: string }> | null>(null);
  useEffect(() => {
    const prev = prevQueueRef.current;
    const next = new Map(queue.map((a) => [a.id, { mine: a.mine, status: a.status }]));
    prevQueueRef.current = next;
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;

    let newUnaccepted = false;
    let mineAdvanced = false;
    for (const a of queue) {
      const before = prev?.get(a.id);
      if (!a.mine) {
        if (!ASSIGNMENT_TERMINAL.has(a.status) && !before) newUnaccepted = true;
      } else if (before) {
        // Newly-mine = I just accepted it out of the pool; otherwise a
        // forward stage move (started, picked_up) of an already-mine job.
        if (!before.mine) mineAdvanced = true;
        else if ((STAGE_RANK[a.status] ?? -1) > (STAGE_RANK[before.status] ?? -1)) mineAdvanced = true;
      }
    }
    // Terminal stamps (delivered/failed) drop OUT of the assignments feed
    // entirely (route excludes ASSIGNMENT_TERMINAL), so "my job disappeared
    // from the mirror" IS the delivered/released confirmation.
    if (!mineAdvanced && prev) {
      for (const [id, was] of prev) {
        if (was.mine && !next.has(id)) mineAdvanced = true;
      }
    }
    // Pre-existing MINE jobs on the first data mirror have no `before` entry
    // → no tick on app open; only genuine advances sound.
    if (newUnaccepted) playNewOrderChime();
    else if (mineAdvanced) playTick();
  }, [queue]);

  // Repeat the chime every ~20s while at least one unaccepted job remains and
  // the app is visible (boolean dep — the 8s mirror refreshes don't reset the
  // interval; it starts 20s after the appearance chime and is cleaned up the
  // moment the pool empties).
  const hasUnaccepted = queue.some((a) => !a.mine && !ASSIGNMENT_TERMINAL.has(a.status));
  useEffect(() => {
    if (!hasUnaccepted) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") playNewOrderChime();
    }, 20000);
    return () => clearInterval(id);
  }, [hasUnaccepted]);

  const tabs: BottomNavTab<TabId>[] = [
    { id: "jobs", label: t("tabJobs"), icon: Bike, badge: myOpenJobs },
    { id: "history", label: t("tabHistory"), icon: History },
    { id: "profile", label: t("tabProfile"), icon: User },
  ];

  return (
    <div className="min-h-screen [min-height:100dvh] bg-gray-900 text-white">
      {/* THE shared header (plan §3.1) — rendered once, visible on every tab.
          RoleSwitch mounts here exactly once (§2.4), so the switcher is
          discoverable on the default Jobs landing tab. */}
      <ShellHeader
        icon={<Bike className="w-5 h-5 text-white" />}
        title={t("appName")}
        subtitle={
          <>
            {driverName}
            {rating != null && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-amber-400">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {formatPct(rating / 100, locale)}
              </span>
            )}
          </>
        }
        right={
          <>
            {gpsOn && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <Radio className="w-3.5 h-3.5 animate-pulse" /> {t("gpsLive")}
              </span>
            )}
            {tab === "jobs" && (
              <button
                type="button"
                onClick={() => setJobsRefreshToken((n) => n + 1)}
                className="text-gray-400 hover:text-white"
                title={t("refresh")}
                aria-label={t("refresh")}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <RoleSwitch role="driver" hasOtherRole={hasOtherRole} />
          </>
        }
      />

      {/* Jobs — mounted always; CSS-hidden when another tab is active. Its
          internal header is suppressed: the shared one above replaces it. */}
      <div className={tab === "jobs" ? undefined : "hidden"}>
        <DriverQueue
          driverName={driverName}
          rating={rating}
          onAssignmentsChange={setQueue}
          hideHeader
          onGpsChange={setGpsOn}
          refreshToken={jobsRefreshToken}
        />
      </div>

      {/* History — lazily mounted on first visit, then CSS-hidden, never
          unmounted; refetches on every activation via the active prop. */}
      <div className={tab === "history" ? undefined : "hidden"}>{historyMounted && <DriverHistory active={tab === "history"} />}</div>

      {/* Profile — lazily mounted on first visit, then CSS-hidden, never
          unmounted (manual-refresh tab). */}
      <div className={tab === "profile" ? undefined : "hidden"}>{profileMounted && <DriverProfile active={tab === "profile"} />}</div>

      <BottomNav
        tabs={tabs}
        active={tab}
        onSelect={(id) => {
          if (id === "history") setHistoryMounted(true);
          if (id === "profile") setProfileMounted(true);
          setTab(id);
        }}
      />
    </div>
  );
}

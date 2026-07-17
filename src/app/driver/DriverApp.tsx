"use client";
import { useState } from "react";
import { Bike, History, Radio, RefreshCw, Star, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ASSIGNMENT_TERMINAL } from "@/lib/driver-assignment";
import { DriverQueue } from "./DriverQueue";
import { DriverHistory } from "./DriverHistory";
import { DriverProfile } from "./DriverProfile";
import { RoleSwitch } from "./RoleSwitch";
import { BottomNav, type BottomNavTab } from "./shared/BottomNav";
import { ShellHeader } from "./shared/ShellHeader";
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
  // the Jobs badge derives from it. NO second poll exists for this.
  const [queue, setQueue] = useState<{ mine: boolean; status: string }[]>([]);
  // Mirror of DriverQueue's GPS-streaming flag (via onGpsChange) — feeds the
  // shared header's live chip. Streaming continues across tabs (the queue
  // stays mounted), so the chip stays truthful on every tab.
  const [gpsOn, setGpsOn] = useState(false);
  // Bumped by the shared header's refresh button → one manual queue load.
  const [jobsRefreshToken, setJobsRefreshToken] = useState(0);

  const myOpenJobs = queue.filter((a) => a.mine && !ASSIGNMENT_TERMINAL.has(a.status)).length;

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

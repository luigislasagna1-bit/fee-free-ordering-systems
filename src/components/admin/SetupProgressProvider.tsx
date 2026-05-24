"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { SetupProgress } from "@/lib/setup-checklist";

/**
 * Client-side fresh-progress shell.
 *
 * Problem: SetupProgress is loaded server-side once in admin/layout.tsx and
 * passed as a prop into AdminSidebar / AdminHeader / GuidedSetupPill. When
 * the owner completes a step (saves menu, sets hours, configures services),
 * the underlying database updates immediately but the prop stays stuck on
 * the value from the initial page render. Result: "I just finished menu
 * setup but the sidebar still shows 4/9 — only refreshing the page updates
 * it." Luigi flagged this during UAT — task #77.
 *
 * Fix: wrap the admin chrome in this provider. It:
 *   1. Seeds from the server-rendered `initial` value (no flicker on first
 *      paint)
 *   2. Polls /api/admin/setup-progress every 30 seconds (background freshness)
 *   3. Refetches on every client-side route change (immediate freshness
 *      when the user navigates to a different admin page — that's when
 *      they've usually JUST completed a step)
 *
 * Consumers call `useSetupProgress()` to read the latest value.
 *
 * Polling interval is intentionally generous (30s, not 5s) — setup progress
 * doesn't change rapidly, and we don't want a noisy network tab. The route-
 * change refetch handles the "fast feedback after a save" case.
 */
const POLL_INTERVAL_MS = 30_000;

const SetupProgressContext = createContext<SetupProgress | null>(null);

export function SetupProgressProvider({
  initial,
  children,
}: {
  initial: SetupProgress | null;
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<SetupProgress | null>(initial);
  const pathname = usePathname();
  // Used to skip the initial-mount refetch (we just got fresh data from
  // the server on first paint — no point requesting again immediately).
  const hasMounted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/admin/setup-progress", { cache: "no-store" });
        if (!res.ok) return; // 401 / 500 — silently keep the existing value
        const data = (await res.json()) as SetupProgress;
        if (!cancelled) setProgress(data);
      } catch {
        // Network error — keep the existing value. The next interval will retry.
      }
    }

    // Route change → refetch (skipped on initial mount).
    if (hasMounted.current) {
      refresh();
    } else {
      hasMounted.current = true;
    }

    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname]);

  return (
    <SetupProgressContext.Provider value={progress}>
      {children}
    </SetupProgressContext.Provider>
  );
}

/**
 * Read the latest SetupProgress from context. If used outside the
 * provider (e.g. on a public page) returns null. Components that
 * accept setupProgress as a prop AND consume this hook should prefer
 * the hook's value (falls back to the prop only when the hook returns
 * null — backwards-compat for any callsites we haven't wired through
 * the provider yet).
 */
export function useSetupProgress(): SetupProgress | null {
  return useContext(SetupProgressContext);
}

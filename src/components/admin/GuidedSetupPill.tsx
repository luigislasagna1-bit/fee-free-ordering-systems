"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import type { SetupProgress } from "@/lib/setup-checklist";

/**
 * Floating bottom-right pill that turns the admin into a true step-by-step
 * walkthrough. Renders on every admin page when there are still required
 * setup steps left.
 *
 * The pill always shows the FIRST incomplete required step — i.e. "the next
 * thing you need to do". Two states:
 *
 *   - You're currently on that step's destination page (e.g. /admin/delivery-zones
 *     and Delivery zones is what's pending) → pill reads
 *     "Working on: Delivery zones · save to continue".
 *
 *   - You're somewhere else → pill reads "Next: Delivery zones" and links
 *     to /admin/setup/next, which redirects straight to the right page.
 *
 * After the owner saves a step, the form's router.refresh() re-runs the
 * server layout, which re-loads SetupProgress with the now-completed step
 * dropped from requiredStepsRemaining. The pill renders with the NEW
 * first-incomplete step's label — that's the "auto-advance" feel.
 *
 * Hidden on /admin/setup itself (the wizard has its own large CTAs and
 * a duplicate floating pill would be noisy) and on the publish-ready
 * state (the green Publish button takes over).
 *
 * Dismissible per browser session via localStorage so owners aren't stuck
 * with it while they explore other parts of the admin.
 */

const DISMISS_KEY = "ffo:guided-setup-pill-dismissed";

export function GuidedSetupPill({ progress }: { progress: SetupProgress }) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // localStorage blocked (privacy mode) — just leave pill visible.
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  // Hide on the wizard itself; it owns the setup UI there.
  if (pathname?.startsWith("/admin/setup")) return null;

  // Publish-ready or nothing required left — the wizard's Publish CTA
  // handles it; no pill needed.
  if (progress.publishReady || progress.requiredStepsRemaining.length === 0) return null;

  if (dismissed) return null;

  const nextStep = progress.requiredStepsRemaining[0];
  const requiredLeft = progress.requiredStepsRemaining.length;

  // Are we currently on (or under) the page for that next step?
  const onCurrentStep =
    pathname === nextStep.href ||
    (nextStep.href !== "/admin" && pathname?.startsWith(nextStep.href + "/"));

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm pointer-events-none">
      <div className="bg-white border-2 border-orange-400 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
        <Link
          href="/admin/setup/next"
          className="block px-4 py-3 hover:bg-orange-50 transition group"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <div className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                Setup walkthrough · {progress.percent}%
              </div>
              {onCurrentStep ? (
                <>
                  <div className="text-sm text-gray-900 font-bold mt-0.5">
                    Working on: {nextStep.label}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Save this page, then click here to continue →
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-gray-900 font-bold mt-0.5">
                    Next: {nextStep.label}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {requiredLeft} required step{requiredLeft === 1 ? "" : "s"} left · click to go
                  </div>
                </>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-orange-500 flex-shrink-0 mt-3 group-hover:translate-x-0.5 transition" />
          </div>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide setup walkthrough"
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition pointer-events-auto"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

"use client";
import type { Session } from "next-auth";
import { Bell, AlertCircle, Menu } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocationSwitcher, type LocationOption } from "./LocationSwitcher";
import { StaffLanguageSwitcher } from "@/components/StaffLanguageSwitcher";
import type { SetupProgress } from "@/lib/setup-checklist";
import { useSetupProgress } from "@/components/admin/SetupProgressProvider";

export function AdminHeader({
  session,
  pendingOrders = 0,
  restaurantName,
  locations,
  activeLocationId,
  setupProgress: setupProgressProp,
}: {
  session: Session;
  pendingOrders?: number;
  restaurantName?: string;
  /** When the brand has multiple locations, the switcher renders. Pass null/empty to hide. */
  locations?: LocationOption[];
  activeLocationId?: string;
  /** When set and percent < 100, a sticky banner prompts the owner to finish setup. */
  setupProgress?: SetupProgress | null;
}) {
  const tAdmin = useTranslations("admin");
  const tOrders = useTranslations("admin.orders");
  const tSetup = useTranslations("admin.setupBanner");
  const user = session.user as any;
  const displayName = restaurantName || user?.name || user?.email;

  // Prefer the live SetupProgressProvider value so the percent in the
  // sticky banner updates in real-time after the owner saves a step.
  const liveSetupProgress = useSetupProgress();
  const setupProgress = liveSetupProgress ?? setupProgressProp;

  const showSetupBanner = !!setupProgress && setupProgress.percent < 100;

  return (
    <div className="flex-shrink-0">
    {showSetupBanner && setupProgress && (
      // /admin/setup/next walks the owner through required steps one
      // at a time: it redirects straight to their first incomplete
      // required step. When nothing required is left, it falls back to
      // /admin/setup so the green "Publish my restaurant" CTA is what
      // they see. Linking the banner here turns it into a literal
      // "next thing to do" button rather than a checklist dump.
      <Link
        href={setupProgress.publishReady ? "/admin/setup" : "/admin/setup/next"}
        className="block bg-gradient-to-r from-emerald-50 to-amber-50 border-b border-emerald-200 px-6 py-2 hover:from-emerald-100 hover:to-amber-100 transition"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-sm text-emerald-900 truncate">
              <span className="font-semibold">{tSetup("setupPercentComplete", { percent: setupProgress.percent })}</span>
              <span className="text-emerald-700">
                {" · "}
                {setupProgress.publishReady
                  ? tSetup("readyToPublish")
                  : tSetup("requiredStepsLeft", {
                      count: setupProgress.requiredStepsRemaining.length,
                    })}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-32 h-1.5 bg-emerald-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${setupProgress.percent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-emerald-700 hidden sm:inline">
              {tSetup("finishSetup")} &rarr;
            </span>
          </div>
        </div>
      </Link>
    )}
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 flex-shrink-0 gap-2">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Hamburger — toggles the sidebar drawer on mobile. Dispatches
            a window event the sidebar listens for, avoiding having to
            drill a setter prop through the server-rendered layout
            boundary. Hidden on md+ since the sidebar is always visible. */}
        <button
          type="button"
          aria-label={tAdmin("openSidebar")}
          onClick={() => window.dispatchEvent(new Event("admin-sidebar-toggle"))}
          className="md:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 hidden sm:block">
          <span className="text-sm text-gray-500">{tAdmin("welcomeBack")},</span>
          <span className="ml-1 font-semibold text-gray-900 truncate">{displayName}</span>
        </div>
        <div className="min-w-0 sm:hidden">
          <span className="font-semibold text-gray-900 text-sm truncate">{displayName}</span>
        </div>
        {locations && locations.length > 1 && activeLocationId && (
          <LocationSwitcher locations={locations} activeId={activeLocationId} />
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {pendingOrders > 0 && (
          <Link
            href="/admin/orders"
            className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-full hover:bg-yellow-100 transition whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span>{pendingOrders}</span>
            <span className="hidden sm:inline">{tOrders("pending")}</span>
          </Link>
        )}
        {/* Per-staff console language — independent of the customer-facing
            language, so it only changes THIS user's admin/kitchen. */}
        <div className="hidden sm:block">
          <StaffLanguageSwitcher />
        </div>
        {/* The bell was a dead decoration (Luigi 2026-06-11: "it does nothing").
            Point it at the live orders feed — the restaurant's real "what needs
            my attention" surface — and keep the red dot when orders are
            pending. */}
        <Link
          href="/admin/orders"
          title={tOrders("pending")}
          aria-label={tOrders("pending")}
          className="relative p-2 text-gray-400 hover:text-gray-600 transition hidden sm:block"
        >
          <Bell className="w-5 h-5" />
          {pendingOrders > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
          )}
        </Link>
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {(user?.name || user?.email || "?")[0].toUpperCase()}
        </div>
      </div>
    </header>
    </div>
  );
}

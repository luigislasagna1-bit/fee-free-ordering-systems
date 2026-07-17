"use client";
import type { ReactNode } from "react";

/**
 * Shared app-shell header (v1.1 plan §3.1) — mirrors the DriverQueue header
 * byte-for-byte in style so every tab (and, in Phase 6, the restaurant shell)
 * reads as the same app. The header carries the top safe-area inset ITSELF
 * (not the container): it's sticky top-0, so once content scrolls it pins to
 * y=0 of the viewport, and container padding can't keep it out from under the
 * iPhone notch/status bar (Luigi 2026-07-16).
 */
export function ShellHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  /** Brand glyph rendered inside the emerald tile (e.g. <Bike className="w-5 h-5 text-white" />). */
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned actions (RoleSwitch, refresh, …). */
  right?: ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-sm font-bold leading-tight">{title}</div>
          {subtitle != null && (
            <div className="text-xs text-gray-400 leading-tight flex items-center gap-1.5">{subtitle}</div>
          )}
        </div>
      </div>
      {right != null && <div className="flex items-center gap-3">{right}</div>}
    </header>
  );
}

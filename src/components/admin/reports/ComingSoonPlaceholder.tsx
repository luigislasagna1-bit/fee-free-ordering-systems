import { Construction, Database } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Placeholder for reports that are scaffolded but not yet wired to data.
 *
 * Every sub-page under /admin/reports/** that isn't built yet renders
 * this so the nav doesn't 404 and the IA is discoverable. Each one
 * declares:
 *   - What metric the report will show
 *   - What data it needs (and whether that data is being collected yet)
 *   - When it's planned to ship
 *
 * Transparency for Luigi during the rollout: he can show this to a
 * restaurant owner and they'll see the roadmap, not a broken page.
 *
 * Drop this file the moment EVERY report under /admin/reports/** has
 * been fully built — currently most are still placeholders.
 */
export function ComingSoonPlaceholder({
  title, subtitle, what, requires, eta, children,
}: {
  title: string;
  subtitle?: string;
  /** One-sentence description of what the finished report will show. */
  what: string;
  /** What data has to be collected (and whether it's being collected
   *  yet). Drives a small badge so the user can see "data is being
   *  captured now" vs "no data captured yet". */
  requires: { label: string; status: "collecting" | "not_started" }[];
  /** Free-text ETA — e.g. "Next sprint" or "Phase 2c". */
  eta: string;
  /** Optional in-line extra content (e.g. an upsell CTA). */
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <Construction className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 mb-1">Coming soon</h2>
            <p className="text-sm text-gray-600 mb-4">{what}</p>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Data requirements
              </div>
              <ul className="space-y-1.5">
                {requires.map((r) => (
                  <li key={r.label} className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        r.status === "collecting" ? "bg-emerald-500" : "bg-gray-300"
                      }`}
                    />
                    <span className="text-gray-700">{r.label}</span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        r.status === "collecting" ? "text-emerald-600" : "text-gray-400"
                      }`}
                    >
                      · {r.status === "collecting" ? "collecting" : "not started"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Planned:</span> {eta}
            </p>

            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * Layout shell for every /admin/reports/** page.
 *
 * Deliberately MINIMAL because:
 *   - The 4 sub-section sidebar nav is already in AdminSidebar
 *     (Sales / Menu Insights / Online Ordering / List View). Adding a
 *     second secondary-nav row in the layout would be redundant.
 *   - Each individual report page has its own header (title + date
 *     picker + view toggle) that varies in width / wraps differently
 *     depending on whether the report supports comparison overlays,
 *     pivot toggles, etc. Pushing those into the layout would over-
 *     constrain the design.
 *
 * What this layout DOES provide:
 *   - Consistent vertical rhythm (max-w-7xl + responsive padding).
 *   - A floating "4-year retention" footer note that's part of the
 *     transparency commitment Luigi made — every report-using owner
 *     should be able to see "data goes back 4 years" at a glance
 *     without having to find it in T&Cs.
 *
 * Auth is enforced by the parent /admin layout (the global session
 * gate + restaurant-id resolution). We don't re-check here.
 */
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-7xl">
      {children}
      <p className="mt-8 text-[10px] text-gray-400 italic">
        Reporting data is retained for 4 years from the order date — you can
        always pull historical reports through that window.
      </p>
    </div>
  );
}

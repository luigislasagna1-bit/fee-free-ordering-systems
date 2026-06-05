import { redirect } from "next/navigation";
import { ChefHat } from "lucide-react";
import prisma from "@/lib/db";
import { ROLES } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { countNewReportsForViewer, countUnreadNotifications } from "@/lib/reseller-reports-workflow";
import { ResellerNav } from "./ResellerNav";
import { SuperadminImpersonationBanner } from "./SuperadminImpersonationBanner";

/**
 * /reseller/* root layout.
 *
 * Admits:
 *   - reseller_partner (their own dashboard)
 *   - pending_reseller (shown the holding page)
 *   - superadmin currently in SA→reseller impersonation mode (effective role
 *     swapped to reseller_partner by getSessionUser())
 *
 * Pending/suspended/rejected resellers get the holding page; approved ones
 * get the nav + dashboard.
 */
export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Admit real resellers + pending applicants + superadmins currently in
  // SA→reseller impersonation (effectiveRole === "reseller_partner").
  const isActingAsReseller = user.effectiveRole === ROLES.RESELLER_PARTNER;
  const isPending = user.role === ROLES.PENDING_RESELLER;
  if (!isActingAsReseller && !isPending) {
    redirect("/login");
  }

  // Resolve the profile status. Pending / suspended / rejected → holding page.
  const profile = user.resellerProfileId
    ? await prisma.resellerProfile.findUnique({
        where: { id: user.resellerProfileId },
        select: { status: true, companyName: true, suspendedReason: true },
      })
    : null;

  const isApproved = profile?.status === "approved";
  const isSuperadminViewing = user.impersonationMode === "superadmin_as_reseller";
  // Show the "Reports & Requests" nav entry only to resellers who've been
  // invited to the report center (or superadmins). Same gate the page uses.
  const reportAccess = await getReportAccess();
  const canViewReports = reportAccess.canView;
  // Count of reports with activity this reseller hasn't seen — drives the nav
  // badge so they notice replies / status changes without opening the tracker.
  const [reportsNewCount, notificationsCount] = canViewReports
    ? await Promise.all([
        countNewReportsForViewer(reportAccess.email),
        countUnreadNotifications(reportAccess.email),
      ])
    : [0, 0];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden flex-col">
      {isSuperadminViewing && user.resellerProfileId && (
        <SuperadminImpersonationBanner
          resellerProfileId={user.resellerProfileId}
          companyName={profile?.companyName ?? null}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-60 bg-gray-900 text-white flex flex-col">
          <div className="h-16 flex items-center px-5 border-b border-gray-700">
            <ChefHat className="w-6 h-6 text-emerald-400 mr-2" />
            <div>
              <div className="font-bold text-emerald-400 text-sm">Partner</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Reseller</div>
            </div>
          </div>
          {isApproved && <ResellerNav canViewReports={canViewReports} reportsNewCount={reportsNewCount} notificationsCount={notificationsCount} />}
          <div className="mt-auto p-4 border-t border-gray-700 text-xs text-gray-500">
            {profile?.companyName ?? user.email}
            <div className="mt-1 text-[10px] uppercase">{profile?.status ?? "no profile"}</div>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChefHat } from "lucide-react";
import prisma from "@/lib/db";
import { ROLES } from "@/lib/roles";
import { ResellerNav } from "./ResellerNav";

/**
 * /reseller/* root layout.
 *
 * Role gate: only reseller_partner OR pending_reseller users land here.
 * Pending/suspended/rejected users are punted to the holding page so they
 * still see a useful message instead of empty dashboards.
 */
export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any)?.role;
  const resellerProfileId = (session.user as any)?.resellerProfileId;

  if (role !== ROLES.RESELLER_PARTNER && role !== ROLES.PENDING_RESELLER) {
    redirect("/login");
  }

  // Resolve the profile status. Pending / suspended / rejected → holding page.
  const profile = resellerProfileId
    ? await prisma.resellerProfile.findUnique({
        where: { id: resellerProfileId },
        select: { status: true, companyName: true, suspendedReason: true },
      })
    : null;

  const isApproved = profile?.status === "approved";

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-60 bg-gray-900 text-white flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-gray-700">
          <ChefHat className="w-6 h-6 text-orange-400 mr-2" />
          <div>
            <div className="font-bold text-orange-400 text-sm">Partner</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Reseller</div>
          </div>
        </div>
        {isApproved && <ResellerNav />}
        <div className="mt-auto p-4 border-t border-gray-700 text-xs text-gray-500">
          {profile?.companyName ?? (session.user as any)?.email}
          <div className="mt-1 text-[10px] uppercase">{profile?.status ?? "no profile"}</div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

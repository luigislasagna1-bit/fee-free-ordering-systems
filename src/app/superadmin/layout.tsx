import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChefHat, LayoutDashboard, Store, LogOut, CreditCard } from "lucide-react";
import { signOut } from "next-auth/react";
import { SuperadminNav } from "./SuperadminNav";
import { countNewReportsForViewer, countUnreadNotifications } from "@/lib/reseller-reports-workflow";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user as any)?.role !== "superadmin") redirect("/admin");

  // Nav badge counts: reports with unseen activity + unread notifications.
  const saEmail = (session.user as any)?.email ?? "";
  const [reportsNewCount, notificationsCount] = await Promise.all([
    countNewReportsForViewer(saEmail),
    countUnreadNotifications(saEmail),
  ]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-60 bg-white text-gray-900 border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-gray-200">
          <ChefHat className="w-6 h-6 text-emerald-600 mr-2" />
          <span className="font-bold text-emerald-600">Super Admin</span>
        </div>
        <SuperadminNav reportsNewCount={reportsNewCount} notificationsCount={notificationsCount} />
        <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
          {(session.user as any)?.email}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

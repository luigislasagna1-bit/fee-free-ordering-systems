import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any)?.role;
  // Kitchen staff use the kitchen display, not the admin panel
  if (role === "kitchen_staff") redirect("/kitchen");
  if (!["restaurant_admin", "superadmin"].includes(role)) redirect("/login");

  const user = await getSessionUser();

  // Superadmin with no active impersonation → send to superadmin area
  if (role === "superadmin" && !user?.isImpersonating) {
    redirect("/superadmin");
  }

  const restaurantId = user?.restaurantId;
  let pendingOrders = 0;
  let restaurantName = "";
  if (restaurantId) {
    const [count, restaurant] = await Promise.all([
      prisma.order.count({ where: { restaurantId, status: "pending" } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    ]);
    pendingOrders = count;
    restaurantName = restaurant?.name || "";
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden flex-col">
      {user?.isImpersonating && <ImpersonationBanner restaurantName={restaurantName} />}
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar session={session} pendingOrders={pendingOrders} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminHeader session={session} pendingOrders={pendingOrders} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

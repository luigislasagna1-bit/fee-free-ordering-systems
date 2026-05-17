import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { getSessionUser } from "@/lib/session";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any)?.role;
  // Kitchen staff use the kitchen display, not the admin panel
  if (role === "kitchen_staff") redirect("/kitchen");
  if (!["restaurant_admin", "superadmin", "reseller_partner"].includes(role)) redirect("/login");

  const user = await getSessionUser();

  // Superadmin with no active impersonation → send to superadmin area
  if (role === "superadmin" && !user?.isImpersonating) {
    redirect("/superadmin");
  }
  // Reseller partner with no active impersonation → send back to reseller area.
  // They can only access /admin/* in the context of a specific impersonated restaurant.
  if (role === "reseller_partner" && !user?.isImpersonating) {
    redirect("/reseller");
  }

  const restaurantId = user?.restaurantId;
  let pendingOrders = 0;
  let restaurantName = "";
  if (restaurantId) {
    const [count, restaurant] = await Promise.all([
      prisma.order.count({ where: { restaurantId, status: "pending" } }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, subscriptionStatus: true, trialEndsAt: true },
      }),
    ]);
    pendingOrders = count;
    restaurantName = restaurant?.name || "";

    // Gate admin access on subscription state. Past-due restaurants — or
    // expired trials with no card on file — get redirected to /admin/billing
    // until they fix the issue. Superadmin impersonators bypass the gate so
    // support can still fix things. /admin/billing itself is exempt to avoid
    // a redirect loop. Customer-facing ordering and the kitchen display
    // remain accessible regardless.
    // Reseller impersonators also bypass the billing gate — they need to see the
    // billing surface to help their restaurants fix it.
    if (role !== "superadmin" && role !== "reseller_partner") {
      const status = restaurant?.subscriptionStatus;
      const trialExpired =
        status === "trialing" &&
        !!restaurant?.trialEndsAt &&
        restaurant.trialEndsAt.getTime() < Date.now();
      const needsBilling = status === "past_due" || status === "cancelled" || trialExpired;
      if (needsBilling) {
        const h = await headers();
        const pathname = h.get("x-pathname") || "";
        if (!pathname.startsWith("/admin/billing")) {
          redirect("/admin/billing");
        }
      }
    }
  }

  const locale = await resolveLocale({ restaurantId });
  const messages = await loadMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex h-screen bg-gray-50 overflow-hidden flex-col">
        {user?.isImpersonating && (
          <ImpersonationBanner
            restaurantName={restaurantName}
            mode={user.impersonationMode === "reseller" ? "reseller" : "superadmin"}
          />
        )}
        <div className="flex flex-1 overflow-hidden">
          <AdminSidebar session={session} pendingOrders={pendingOrders} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminHeader session={session} pendingOrders={pendingOrders} restaurantName={restaurantName} />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

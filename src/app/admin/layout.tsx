import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { EmailVerificationBanner } from "@/components/admin/EmailVerificationBanner";
import { getSessionUser } from "@/lib/session";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import type { SetupProgress } from "@/lib/setup-checklist";

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
  let setupProgress: SetupProgress | null = null;
  let ownerEmail: string | null = null;
  let ownerEmailVerified = true; // default true so we don't nag superadmins / staff
  let locationsForSwitcher: Array<{ id: string; name: string; city: string | null; isParent: boolean }> = [];
  if (restaurantId) {
    const [count, restaurant] = await Promise.all([
      prisma.order.count({ where: { restaurantId, status: "pending" } }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          parentRestaurantId: true,
          id: true,
        },
      }),
    ]);
    pendingOrders = count;
    restaurantName = restaurant?.name || "";

    // Email-verification state — only relevant for restaurant_admin users
    // (the actual owner). Superadmin / reseller impersonators bypass the
    // banner since they aren't the ones who need to verify.
    if (role === "restaurant_admin" && user?.id) {
      const owner = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, emailVerifiedAt: true },
      });
      ownerEmail = owner?.email ?? null;
      ownerEmailVerified = !!owner?.emailVerifiedAt;
    }

    // Load setup progress for the sidebar checkmarks + header banner.
    // Failure to load shouldn't break the layout — fall back to null.
    try {
      setupProgress = await loadSetupProgress(restaurantId);
    } catch (err) {
      console.error("[admin-layout] loadSetupProgress failed", err);
      setupProgress = null;
    }

    // Build the location list for the switcher. The "brand parent" is either
    // the current restaurant (if it has no parent) or its parent. Then the
    // children of that parent (plus the parent itself) are the dropdown options.
    if (restaurant) {
      const parentId = restaurant.parentRestaurantId ?? restaurant.id;
      const [parent, children] = await Promise.all([
        restaurant.parentRestaurantId
          ? prisma.restaurant.findUnique({
              where: { id: parentId },
              select: { id: true, name: true, city: true },
            })
          : Promise.resolve({ id: restaurant.id, name: restaurant.name, city: null as string | null }),
        prisma.restaurant.findMany({
          where: { parentRestaurantId: parentId },
          select: { id: true, name: true, city: true },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      if (parent) {
        locationsForSwitcher = [
          { id: parent.id, name: parent.name, city: parent.city, isParent: true },
          ...children.map((c) => ({ id: c.id, name: c.name, city: c.city, isParent: false })),
        ];
      }
    }

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
        <EmailVerificationBanner email={ownerEmail} verified={ownerEmailVerified} />
        {user?.isImpersonating && (
          <ImpersonationBanner
            restaurantName={restaurantName}
            mode={
              user.impersonationMode === "reseller"
                ? "reseller"
                : user.impersonationMode === "superadmin_as_reseller"
                ? "superadmin_as_reseller"
                : "superadmin"
            }
          />
        )}
        <div className="flex flex-1 overflow-hidden">
          <AdminSidebar session={session} pendingOrders={pendingOrders} setupProgress={setupProgress} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminHeader
              session={session}
              pendingOrders={pendingOrders}
              restaurantName={restaurantName}
              locations={locationsForSwitcher}
              activeLocationId={restaurantId}
              setupProgress={setupProgress}
            />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

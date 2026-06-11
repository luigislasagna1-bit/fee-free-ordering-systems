import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { ORDERS_SEEN_COOKIE } from "@/app/api/admin/orders/mark-seen/route";
import { NextIntlClientProvider } from "next-intl";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { EmailVerificationBanner } from "@/components/admin/EmailVerificationBanner";
import { GuidedSetupPill } from "@/components/admin/GuidedSetupPill";
import { SetupProgressProvider } from "@/components/admin/SetupProgressProvider";
import { getSessionUser } from "@/lib/session";
import { resolveStaffLocale, loadMessages } from "@/lib/i18n-server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import type { SetupProgress } from "@/lib/setup-checklist";
import { hasFeature } from "@/lib/entitlements";
import { CurrencyProvider } from "@/lib/currency-context";

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
  // Restaurant's chosen currency (ISO 4217), provided to the admin tree so
  // every owner-facing money value renders in their currency, not USD.
  let restaurantCurrency = "usd";
  let setupProgress: SetupProgress | null = null;
  let hasHostedSite = false;
  /** True iff Restaurant.publishedAt is set — hides the "Ready to publish"
   *  sidebar chip once the restaurant is actually live. */
  let isPublished = false;
  let ownerEmail: string | null = null;
  let ownerEmailVerified = true; // default true so we don't nag superadmins / staff
  let locationsForSwitcher: Array<{ id: string; name: string; city: string | null; isParent: boolean }> = [];
  // The restaurant's chosen language — used as the admin-console default locale
  // when the viewer hasn't explicitly picked one. Luigi 2026-06-11.
  let restaurantDefaultLanguage: string | null = null;
  if (restaurantId) {
    // "New orders" notification = pending orders that arrived since the owner
    // last opened the Orders page. The /admin/orders page stamps a per-restaurant
    // "seen at" cookie; we only count pending orders created after it. Opening
    // the page clears the bell; a later arrival re-lights it. If there's no
    // stamp (or it belongs to a different restaurant — superadmin switching),
    // every pending order counts as new. Luigi 2026-06-11.
    const seenRaw = (await cookies()).get(ORDERS_SEEN_COOKIE)?.value ?? "";
    let seenAfter: Date | null = null;
    const sep = seenRaw.indexOf(":");
    if (sep > 0 && seenRaw.slice(0, sep) === restaurantId) {
      const d = new Date(seenRaw.slice(sep + 1));
      if (!isNaN(d.getTime())) seenAfter = d;
    }
    const pendingWhere = {
      restaurantId,
      status: "pending",
      ...(seenAfter ? { createdAt: { gt: seenAfter } } : {}),
    };

    const [count, restaurant] = await Promise.all([
      prisma.order.count({ where: pendingWhere }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          parentRestaurantId: true,
          id: true,
          currency: true,
          // Drives the admin-console default language (Luigi 2026-06-11): the
          // staff locale falls back to this when the viewer hasn't picked one.
          defaultLanguage: true,
          // publishedAt: drives the sidebar "Ready to publish" chip —
          // when this is set, the chip hides because the restaurant
          // is already live, no nudge needed.
          publishedAt: true,
        },
      }),
    ]);
    pendingOrders = count;
    restaurantName = restaurant?.name || "";
    restaurantDefaultLanguage = restaurant?.defaultLanguage ?? null;
    restaurantCurrency = restaurant?.currency || "usd";
    isPublished = !!restaurant?.publishedAt;

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

    // Resolve the hosted-marketing-page entitlement so the sidebar can
    // gate the Website Editor link. Failure here is also non-fatal —
    // the link just stays hidden, which is the safe default.
    try {
      hasHostedSite = await hasFeature(restaurantId, "hosted_marketing_page");
    } catch (err) {
      console.error("[admin-layout] hasFeature(hosted_marketing_page) failed", err);
      hasHostedSite = false;
    }

    // Build the location list for the switcher — rooted in the user's CANONICAL
    // brand, NOT the cookie-swapped active location. A genuine CHILD account
    // (its own User.restaurantId points at a restaurant that HAS a parent) must
    // see NO switcher: it can only ever be its own location and must not even
    // glimpse siblings or HQ. Only a brand-PARENT owner — or an impersonating
    // superadmin/reseller acting AS the owner — gets the multi-location
    // switcher, including when they've switched INTO a child (so they can get
    // back out). Mirrors the GET /api/restaurants/locations isolation rule.
    // Luigi 2026-06-11.
    if (restaurant) {
      let brandRootId: string | null = null;
      if (!restaurant.parentRestaurantId) {
        // Active restaurant is top-level → owner viewing HQ (or a single-
        // restaurant owner, where the tree is just itself and the switcher
        // hides). Root the tree here.
        brandRootId = restaurant.id;
      } else if (user?.isImpersonating) {
        // Support impersonating into a child → let them navigate the brand.
        brandRootId = restaurant.parentRestaurantId;
      } else {
        // Active restaurant is a child. Is the logged-in user the BRAND OWNER
        // (who switched into this child) or the CHILD's OWN account? Decide
        // from the canonical User.restaurantId — never the active location — so
        // a child account stays isolated while the owner keeps their switcher.
        const canonicalUser = user?.id
          ? await prisma.user.findUnique({ where: { id: user.id }, select: { restaurantId: true } })
          : null;
        const canonicalRestaurant = canonicalUser?.restaurantId
          ? await prisma.restaurant.findUnique({
              where: { id: canonicalUser.restaurantId },
              select: { id: true, parentRestaurantId: true },
            })
          : null;
        // Only a brand-parent owner (canonical restaurant has NO parent) keeps
        // the switcher; a genuine child account gets none.
        if (canonicalRestaurant && !canonicalRestaurant.parentRestaurantId) {
          brandRootId = canonicalRestaurant.id;
        }
      }

      if (brandRootId) {
        const parentId = brandRootId;
        const [parent, children] = await Promise.all([
          prisma.restaurant.findUnique({
            where: { id: parentId },
            select: { id: true, name: true, city: true },
          }),
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
    }

    // Gate admin access on subscription state. Past-due restaurants — or
    // Billing gate: only restaurants whose PAID subscription is in a
    // problem state (past_due / cancelled) get redirected to /admin/billing.
    // "free" is the default for every restaurant — no gating. We removed
    // the legacy "trial expired" branch because trials no longer exist;
    // free has no expiry. Superadmin + reseller impersonators bypass the
    // gate so support can still fix things; /admin/billing itself is
    // exempt to avoid a redirect loop. Customer-facing ordering and
    // the kitchen display remain accessible regardless.
    if (role !== "superadmin" && role !== "reseller_partner") {
      const status = restaurant?.subscriptionStatus;
      const needsBilling = status === "past_due" || status === "cancelled";
      if (needsBilling) {
        const h = await headers();
        const pathname = h.get("x-pathname") || "";
        if (!pathname.startsWith("/admin/billing")) {
          redirect("/admin/billing");
        }
      }
    }
  }

  // Admin console starts in the restaurant's chosen language (Luigi 2026-06-11),
  // but a staff member's own explicit pick still wins. See resolveStaffLocale.
  const locale = await resolveStaffLocale(restaurantDefaultLanguage);
  const messages = await loadMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CurrencyProvider currency={restaurantCurrency}>
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
        {/* SetupProgressProvider wraps everything that displays progress
            so the percentage / checkmarks update in real time after the
            owner completes a step. Seeded from server-rendered value;
            polls /api/admin/setup-progress on route change + every 30s.
            Fixes task #77. */}
        <SetupProgressProvider initial={setupProgress}>
          <div className="flex flex-1 overflow-hidden">
            <AdminSidebar
              session={session}
              pendingOrders={pendingOrders}
              setupProgress={setupProgress}
              hasHostedSite={hasHostedSite}
              isPublished={isPublished}
            />
            <div className="flex-1 flex flex-col overflow-hidden">
              <AdminHeader
                session={session}
                pendingOrders={pendingOrders}
                restaurantName={restaurantName}
                locations={locationsForSwitcher}
                activeLocationId={restaurantId}
                setupProgress={setupProgress}
              />
              <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
            </div>
          </div>
          {setupProgress && <GuidedSetupPill progress={setupProgress} />}
        </SetupProgressProvider>
      </div>
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
}

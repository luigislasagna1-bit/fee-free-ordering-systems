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
import { getEntitlements } from "@/lib/entitlements";
import { getOrderCapUsage } from "@/lib/order-cap";
import { FreePlanCapBanner } from "@/components/admin/FreePlanCapBanner";
import { DunningBanner } from "@/components/admin/DunningBanner";
import { PartnerPeriodBanner } from "@/components/admin/PartnerPeriodBanner";
import { daysLeft as graceDaysLeft } from "@/lib/dunning";
import { CurrencyProvider } from "@/lib/currency-context";
import { isResellerDebranded, RESELLER_WHITE_LABEL_SELECT } from "@/lib/white-label";
import { isNeutralResellerHost } from "@/lib/restaurant-url";

// Tab title: on the shared NEUTRAL reseller host the admin panel must carry ZERO
// "Fee Free Ordering" branding, so we override the platform title (set in the root
// layout) with a neutral "Restaurant Admin". Everywhere else we still neutralize to
// "Restaurant Admin" (the admin panel isn't a marketing surface), but the key intent
// is de-branding on the neutral host. Next.js 16: generateMetadata reads the request
// host via next/headers. Luigi 2026-06-23.
export async function generateMetadata() {
  const host = (await headers()).get("host");
  return {
    title: isNeutralResellerHost(host) ? "Restaurant Admin" : "Admin · Fee Free Ordering",
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any)?.role;
  // Kitchen staff use the kitchen display, not the admin panel
  if (role === "kitchen_staff") redirect("/kitchen");
  // Platform support staff belong in /superadmin — NEVER /login: an authed
  // user bounced to /login loops forever (the login page routes them right
  // back). Same class of bug as the superadmin/restaurantId rule in AGENTS.md.
  if (role === "platform_support") redirect("/superadmin");
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
  /** Full set of unlocked feature slugs — drives the sidebar lock icons on
   *  paid marketing items (Marketplace / Autopilot / Marketing Studio /
   *  Kickstarter). Empty for free accounts. */
  let entitlements: string[] = [];
  /** Feature slugs whose granting add-on is flagged comingSoon in
   *  /superadmin/add-ons — drives the sidebar "Soon" badge live (DB-driven). */
  let comingSoonFeatures: string[] = [];
  /** True iff Restaurant.publishedAt is set — hides the "Ready to publish"
   *  sidebar chip once the restaurant is actually live. */
  let isPublished = false;
  /** True iff the active restaurant is a brand CHILD — exempts the Locations
   *  tab from the multi_location lock (children manage inheritance without it). */
  let isChildAdmin = false;
  /** FREE-plan monthly order-cap usage → drives the always-on admin banner.
   *  null = not loaded; the banner also hides when exempt (any paid add-on). */
  let capUsage: Awaited<ReturnType<typeof getOrderCapUsage>> | null = null;
  let ownerEmail: string | null = null;
  let ownerEmailVerified = true; // default true so we don't nag superadmins / staff
  let locationsForSwitcher: Array<{ id: string; name: string; city: string | null; isParent: boolean }> = [];
  // The restaurant's chosen language — used as the admin-console default locale
  // when the viewer hasn't explicitly picked one. Luigi 2026-06-11.
  let restaurantDefaultLanguage: string | null = null;
  /** Days left in the failed-payment grace window → drives the dunning banner.
   *  null = not in dunning (banner hidden). */
  let dunningDaysLeft: number | null = null;
  /** Free partner period (test→live Stripe switch, Luigi 2026-07-10): when the
   *  restaurant has unbilled trialing add-ons, this carries the earliest end
   *  date + count for the countdown banner. null = no banner. */
  let partnerPeriod: { endsAt: string; count: number } | null = null;
  /** Reseller's brand logo for the sidebar header — only when the restaurant's
   *  reseller passes the FREE de-brand gate (isResellerDebranded). null = show
   *  the default ChefHat. */
  let resellerLogoUrl: string | null = null;
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
          // Dunning grace clock — keeps the admin unlocked + drives the
          // countdown banner while a failed payment is within its grace window.
          graceEndsAt: true,
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
          // Reseller white-label: lets us show the reseller's logo in the
          // admin sidebar when the reseller passes the FREE de-brand gate
          // (isResellerDebranded). Select fragment is the shared, gate-aware one.
          resellerProfile: { select: RESELLER_WHITE_LABEL_SELECT },
        },
      }),
    ]);
    pendingOrders = count;
    restaurantName = restaurant?.name || "";
    restaurantDefaultLanguage = restaurant?.defaultLanguage ?? null;
    restaurantCurrency = restaurant?.currency || "usd";
    isPublished = !!restaurant?.publishedAt;
    isChildAdmin = !!restaurant?.parentRestaurantId;
    resellerLogoUrl = isResellerDebranded(restaurant?.resellerProfile)
      ? (restaurant?.resellerProfile?.brandLogoUrl ?? null)
      : null;

    // Dunning grace (Luigi 2026-06-15): when a failed-payment grace clock is
    // live, surface the countdown banner AND keep the admin unlocked (see the
    // billing gate below). Cleared automatically once grace expires.
    const inGrace = !!restaurant?.graceEndsAt && restaurant.graceEndsAt > new Date();
    if (inGrace && restaurant?.graceEndsAt) {
      dunningDaysLeft = graceDaysLeft(restaurant.graceEndsAt);
    }

    // Free partner period (Luigi 2026-07-10): unbilled trialing add-ons are
    // complimentary until trialEndsAt, then the expire-addon-trials cron
    // switches them off. Surface the earliest end date so the owner knows to
    // subscribe with a card before then. Failure is non-fatal — no banner.
    try {
      const partnerRows = await prisma.restaurantAddOn.findMany({
        where: {
          restaurantId,
          status: "trialing",
          stripeSubscriptionId: null,
          trialEndsAt: { gt: new Date() },
        },
        select: { trialEndsAt: true },
      });
      if (partnerRows.length > 0) {
        const earliest = partnerRows
          .map((r) => r.trialEndsAt!)
          .sort((a, b) => a.getTime() - b.getTime())[0];
        partnerPeriod = { endsAt: earliest.toISOString(), count: partnerRows.length };
      }
    } catch (err) {
      console.error("[admin-layout] partner-period lookup failed", err);
    }

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

    // Resolve the restaurant's full entitlement set ONCE here (single Prisma
    // round-trip) so the sidebar can both hide the Website Editor link
    // (hosted_marketing_page) and lock paid marketing items (requiresFeature).
    // Failure is non-fatal — an empty set means "free account", the safe
    // default (everything paid stays locked).
    try {
      const ent = await getEntitlements(restaurantId);
      entitlements = [...ent];
      hasHostedSite = ent.has("hosted_marketing_page");
    } catch (err) {
      console.error("[admin-layout] getEntitlements failed", err);
      entitlements = [];
      hasHostedSite = false;
    }

    // Coming-soon FEATURES — granted by an add-on flagged comingSoon in
    // /superadmin/add-ons, EXCEPT any feature an active, purchasable add-on also
    // grants (so a feature that also ships via a live, sellable add-on is never
    // mislabeled "Soon"). DB-driven; non-fatal on failure. Luigi 2026-06-14.
    try {
      const [soon, sellable] = await Promise.all([
        prisma.addOn.findMany({ where: { comingSoon: true }, select: { enabledFeatures: true } }),
        prisma.addOn.findMany({ where: { comingSoon: false, isActive: true }, select: { enabledFeatures: true } }),
      ]);
      const parseInto = (rows: { enabledFeatures: string }[], target: Set<string>) => {
        for (const a of rows) {
          try {
            const arr = JSON.parse(a.enabledFeatures || "[]");
            if (Array.isArray(arr)) for (const f of arr) if (typeof f === "string") target.add(f);
          } catch {}
        }
      };
      const purchasable = new Set<string>();
      parseInto(sellable, purchasable);
      const soonSet = new Set<string>();
      parseInto(soon, soonSet);
      comingSoonFeatures = [...soonSet].filter((f) => !purchasable.has(f));
    } catch (err) {
      console.error("[admin-layout] comingSoon features failed", err);
      comingSoonFeatures = [];
    }

    // FREE-plan order-cap usage for the always-on admin banner. The banner only
    // renders when !exempt (a paid add-on lifts the cap). NOTE (scale): ~2 light
    // reads per admin page load; cache by restaurantId for ~30-60s if the admin
    // layout ever gets hot. Luigi 2026-06-14.
    try {
      capUsage = await getOrderCapUsage(restaurantId);
    } catch (err) {
      console.error("[admin-layout] getOrderCapUsage failed", err);
      capUsage = null;
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
      // During the dunning grace window keep the admin FULLY UNLOCKED — the owner
      // needs it to fix billing and keep running; the DunningBanner shows the
      // countdown. Only lock once grace has expired (or a real cancellation).
      const needsBilling = (status === "past_due" || status === "cancelled") && !inGrace;
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
        {dunningDaysLeft !== null && <DunningBanner daysLeft={dunningDaysLeft} />}
        {partnerPeriod && <PartnerPeriodBanner endsAt={partnerPeriod.endsAt} count={partnerPeriod.count} />}
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
              entitlements={entitlements}
              comingSoonFeatures={comingSoonFeatures}
              isChildAdmin={isChildAdmin}
              isPublished={isPublished}
              resellerLogoUrl={resellerLogoUrl}
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
              {capUsage && !capUsage.exempt && (
                <FreePlanCapBanner count={capUsage.count} cap={capUsage.cap} level={capUsage.level} />
              )}
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

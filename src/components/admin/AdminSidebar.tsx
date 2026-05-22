"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, BarChart3,
  Settings, ChefHat, Tag, Zap, Truck, Clock, Receipt, Store, LogOut, ChevronLeft, Menu,
  CreditCard, Palette, CalendarDays, Layers, ChevronDown,
  Megaphone, MoreHorizontal, Map as MapIcon, Bell, Wallet, Share2, Globe,
  Check, Circle, Sparkles, Rocket,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { Session } from "next-auth";
import { useTranslations } from "next-intl";
import type { SetupProgress, StepId } from "@/lib/setup-checklist";

type NavItem = {
  href: string;
  /** Translation key into the "admin.sidebar" namespace. Falls back to `label` if the key is missing. */
  labelKey: string;
  label?: string;
  icon: LucideIcon;
  exact?: boolean;
  badgeKey?: string;
  /** When set, the sidebar shows a checkmark/circle based on SetupProgress. */
  step?: StepId;
  /** When true, hide this item unless the restaurant has the
   *  `hosted_marketing_page` entitlement (Sales Optimized Website add-on).
   *  Used to gate the Website Editor link so non-subscribers never see it. */
  requiresHostedSite?: boolean;
};

type NavSubGroup = {
  key: string;
  labelKey: string;
  /** Optional fallback label when the locale doesn't have the key. */
  label?: string;
  icon: LucideIcon;
  items: NavItem[];
  /** When set, the sub-group header shows "X/Y" completion counts based on SetupProgress. */
  setupSectionId?: "basics" | "services" | "payments" | "orders" | "menu" | "publishing";
};

type NavGroup = {
  key: string;
  labelKey: string;
  /** Optional fallback label when the locale doesn't have the key. */
  label?: string;
  icon: LucideIcon;
  /** Direct child items, shown immediately under the top-level header. */
  items?: NavItem[];
  /** Nested sub-groups (e.g. "Services & Hours" inside SETUP). Each sub-group
   *  expands/collapses independently with single-open accordion behavior. */
  subGroups?: NavSubGroup[];
};

// ─── Sidebar structure ─────────────────────────────────────────────────────
// 5 top-level categories (GloriaFood-style): SETUP / MARKETING TOOLS / REPORTS /
// ONLINE ORDERING / OTHER. SETUP nests 7 sub-groups (the original onboarding
// flow). Single-open accordion at both top-level and sub-level so an open
// category forces the others closed — far less visual noise.
//
// Every nav item from the previous flat 10-group layout lives here. Cross-
// check before deleting anything from this constant.
const navGroups: NavGroup[] = [
  {
    key: "setup",
    labelKey: "categorySetup",
    label: "Setup",
    icon: Rocket,
    subGroups: [
      {
        key: "setup.basics",
        labelKey: "setupBasics",
        label: "Restaurant Basics",
        icon: Store,
        setupSectionId: "basics",
        items: [
          { href: "/admin/profile", labelKey: "profile", label: "Profile", icon: Store, step: "basics.nameAddress" },
        ],
      },
      {
        key: "setup.services",
        labelKey: "setupServices",
        label: "Services & Hours",
        icon: Layers,
        setupSectionId: "services",
        items: [
          { href: "/admin/services",      labelKey: "services",      label: "Services",       icon: Layers,       step: "services.atLeastOne" },
          { href: "/admin/hours",         labelKey: "openingHours",  label: "Opening Hours",  icon: Clock,        step: "services.openingHours" },
          { href: "/admin/delivery",      labelKey: "deliveryZones", label: "Delivery Zones", icon: Truck,        step: "services.deliveryZones" },
          { href: "/admin/delivery/pool", labelKey: "driverPool",    label: "Driver Pool",    icon: Truck,        step: "services.deliveryManagement" },
          { href: "/admin/reservations",  labelKey: "reservations",  label: "Reservations",   icon: CalendarDays },
          { href: "/admin/locations",     labelKey: "locations",     label: "Locations",      icon: MapIcon },
        ],
      },
      {
        key: "setup.payments",
        labelKey: "setupPayments",
        label: "Payments / Taxes",
        icon: CreditCard,
        setupSectionId: "payments",
        items: [
          { href: "/admin/payments",           labelKey: "paymentMethods", label: "Accepted Methods",   icon: CreditCard, step: "payments.methodsSelected" },
          { href: "/admin/payments/providers", labelKey: "payments",       label: "Stripe Connect",     icon: CreditCard, step: "payments.methodConfigured" },
          { href: "/admin/service-fees",       labelKey: "serviceFees",    label: "Service Fees & Tax", icon: Wallet,     step: "payments.taxation" },
        ],
      },
      {
        key: "setup.orders",
        labelKey: "setupOrders",
        label: "Taking Orders",
        icon: Bell,
        setupSectionId: "orders",
        items: [
          { href: "/admin/notifications", labelKey: "notifications", label: "Notifications", icon: Bell, step: "orders.notificationRecipient" },
        ],
      },
      {
        key: "setup.menu",
        labelKey: "setupMenu",
        label: "Menu Setup",
        icon: UtensilsCrossed,
        setupSectionId: "menu",
        items: [
          { href: "/admin/menu",     labelKey: "menu",     label: "Menu Editor", icon: UtensilsCrossed, step: "menu.categoryExists" },
          { href: "/admin/receipts", labelKey: "receipts", label: "Receipts",    icon: Receipt },
        ],
      },
      {
        key: "setup.publishing",
        labelKey: "setupPublishing",
        label: "Publishing",
        icon: Globe,
        setupSectionId: "publishing",
        items: [
          { href: "/admin/publishing",     labelKey: "publishing",   label: "Publishing",     icon: Globe },
          { href: "/admin/website",        labelKey: "websiteTheme", label: "Website Theme",  icon: Palette },
          // Gated on hasHostedSite — Sales Optimized Website add-on
          // subscribers see this; non-subscribers don't even get the link.
          { href: "/admin/website/editor", labelKey: "websiteEditor", label: "Website Editor", icon: Palette, requiresHostedSite: true },
        ],
      },
      {
        key: "setup.billing",
        labelKey: "billing",
        label: "Subscription & Billing",
        icon: Wallet,
        items: [
          { href: "/admin/billing",         labelKey: "billing", label: "Billing", icon: Wallet },
          { href: "/admin/billing/add-ons", labelKey: "addOns",  label: "Add-Ons", icon: Zap },
        ],
      },
    ],
  },

  {
    key: "marketing",
    labelKey: "categoryMarketing",
    label: "Marketing Tools",
    icon: Megaphone,
    items: [
      { href: "/admin/promotions",   labelKey: "promotions",   label: "Promotions",   icon: Tag },
      { href: "/admin/marketplace",  labelKey: "marketplace",  label: "Marketplace",  icon: Sparkles },
      { href: "/admin/social-media", labelKey: "socialMedia",  label: "Social Media", icon: Share2 },
      { href: "/admin/autopilot",    labelKey: "autopilot",    label: "Autopilot",    icon: Zap },
    ],
  },

  {
    key: "reports",
    labelKey: "categoryReports",
    label: "Reports",
    icon: BarChart3,
    items: [
      { href: "/admin",           labelKey: "dashboard", label: "Dashboard",    icon: LayoutDashboard, exact: true },
      // Setup wizard sits with Reports so the header "X% complete" banner
      // (which links here) always lands on the same group.
      { href: "/admin/setup",     labelKey: "setup",     label: "Setup Wizard", icon: Rocket },
      { href: "/admin/reports",   labelKey: "reports",   label: "Reports",      icon: BarChart3 },
      { href: "/admin/customers", labelKey: "customers", label: "Customers",    icon: Users },
    ],
  },

  {
    key: "online-ordering",
    labelKey: "categoryOnlineOrdering",
    label: "Online Ordering",
    icon: ShoppingBag,
    items: [
      { href: "/admin/orders", labelKey: "orders", label: "Orders", icon: ShoppingBag, badgeKey: "orders" },
    ],
  },

  {
    key: "other",
    labelKey: "categoryOther",
    label: "Other",
    icon: MoreHorizontal,
    items: [
      { href: "/admin/settings",     labelKey: "settings",    label: "Settings",     icon: Settings },
      // Map provider config (Leaflet free vs Google Maps API). Optional
      // config so it lives outside the setup tracking flow.
      { href: "/admin/map-settings", labelKey: "mapSettings", label: "Map Settings", icon: MapIcon },
    ],
  },
];

/** Flatten all NavItems across the nested structure — used by the active-path
 *  detector. Order matches visual order so first-match-wins works as expected. */
function allItems(): NavItem[] {
  const out: NavItem[] = [];
  for (const group of navGroups) {
    if (group.items) out.push(...group.items);
    if (group.subGroups) for (const sg of group.subGroups) out.push(...sg.items);
  }
  return out;
}

/** Flatten ALL items in a top-level group (direct items + items in any
 *  sub-group). Used to compute "is anything in this group active?" and
 *  collapsed-mode badge rollups. */
function collectItems(group: NavGroup): NavItem[] {
  const out: NavItem[] = [];
  if (group.items) out.push(...group.items);
  if (group.subGroups) for (const sg of group.subGroups) out.push(...sg.items);
  return out;
}

/** Sum the setup-progress counts across all sub-groups of this top-level group.
 *  Returns null when no sub-group tracks completion (so we don't render a "0/0"
 *  chip on Marketing Tools / Reports / etc.). */
function rollupCounts(
  group: NavGroup,
  perSection: Map<string, { done: number; total: number }>,
): { done: number; total: number } | null {
  let done = 0;
  let total = 0;
  let any = false;
  for (const sg of group.subGroups ?? []) {
    if (sg.setupSectionId) {
      const counts = perSection.get(sg.setupSectionId);
      if (counts) {
        done += counts.done;
        total += counts.total;
        any = true;
      }
    }
  }
  return any ? { done, total } : null;
}

/** Return [groupKey, subGroupKeyOrNull] that contains the given item, or
 *  null when the item isn't found. Used by the active-path auto-open logic. */
function locateItem(item: NavItem): { groupKey: string; subKey: string | null } | null {
  for (const group of navGroups) {
    if (group.items?.some((it) => it.href === item.href)) {
      return { groupKey: group.key, subKey: null };
    }
    if (group.subGroups) {
      for (const sg of group.subGroups) {
        if (sg.items.some((it) => it.href === item.href)) {
          return { groupKey: group.key, subKey: sg.key };
        }
      }
    }
  }
  return null;
}

const STORAGE_KEY = "admin-sidebar-groups-v2";

function isActiveItem(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** Safe translation lookup — falls back to the NavItem's `label` when the
 *  locale doesn't yet have a translation for the new sidebar keys. Keeps the
 *  UI usable even before en/fr/es/it/pt JSON is updated. */
function useSafeT() {
  const t = useTranslations("admin.sidebar");
  return (key: string, fallback?: string) => {
    const v = t(key);
    return v.startsWith("admin.sidebar.") || v === key ? fallback ?? key : v;
  };
}

export function AdminSidebar({
  session,
  pendingOrders = 0,
  setupProgress,
  hasHostedSite = false,
}: {
  session: Session;
  pendingOrders?: number;
  setupProgress?: SetupProgress | null;
  /** True iff this restaurant has the `hosted_marketing_page` entitlement.
   *  Computed in the admin layout (single Prisma round-trip), passed in so
   *  the Website Editor link can be hidden cleanly for non-subscribers
   *  without flashing in and out as the page renders. */
  hasHostedSite?: boolean;
}) {
  const tr = useSafeT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const restaurantSlug = (session.user as any)?.restaurantSlug;

  // Single-open accordion state:
  //   openGroup    — which TOP-level category is currently expanded (one only)
  //   openSubGroup — which sub-group under that category is expanded (one only)
  // When a user clicks a new category, the old one collapses. Sub-groups behave
  // the same way within their parent. null = everything in that level closed.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubGroup, setOpenSubGroup] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.openGroup === "string" || parsed.openGroup === null) {
            setOpenGroup(parsed.openGroup ?? null);
          }
          if (typeof parsed.openSubGroup === "string" || parsed.openSubGroup === null) {
            setOpenSubGroup(parsed.openSubGroup ?? null);
          }
        }
      }
    } catch {
      /* corrupt storage — fall back to defaults */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ openGroup, openSubGroup }),
      );
    } catch {}
  }, [openGroup, openSubGroup, hydrated]);

  // Auto-open the group + sub-group containing the active route. Runs on every
  // pathname change so navigating via a direct URL or clicking from elsewhere
  // pops the right accordion sections open without the user having to do it.
  useEffect(() => {
    const active = allItems().find((it) => isActiveItem(it, pathname));
    if (!active) return;
    const loc = locateItem(active);
    if (!loc) return;
    if (openGroup !== loc.groupKey) setOpenGroup(loc.groupKey);
    if (loc.subKey && openSubGroup !== loc.subKey) setOpenSubGroup(loc.subKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /** Click a top-level header: toggle this one, force-close any other. */
  const toggleGroup = (key: string) => {
    setOpenGroup((prev) => (prev === key ? null : key));
    // Closing the parent group collapses the sub-group too. Opening a NEW
    // group resets the sub-group selection so the new group starts fresh.
    setOpenSubGroup(null);
  };

  /** Click a sub-group header: toggle this one, force-close any sibling. */
  const toggleSubGroup = (key: string) => {
    setOpenSubGroup((prev) => (prev === key ? null : key));
  };

  /** Build a quick lookup: stepId -> complete. */
  const stepComplete = (() => {
    const map = new Map<string, boolean>();
    if (setupProgress) {
      for (const section of setupProgress.sections) {
        for (const step of section.steps) {
          map.set(step.id, step.complete);
        }
      }
    }
    return map;
  })();

  /** Per-group setup counts ("3/4 done"). */
  const groupCounts = (() => {
    const map = new Map<string, { done: number; total: number }>();
    if (setupProgress) {
      for (const section of setupProgress.sections) {
        map.set(section.id, { done: section.completedCount, total: section.totalCount });
      }
    }
    return map;
  })();

  const renderItem = (item: NavItem) => {
    // Entitlement gate — hide items flagged as requiring the hosted-site
    // add-on when the restaurant doesn't have it. Avoids surfacing dead
    // links and the "you need to subscribe" landing for unsubscribed users.
    if (item.requiresHostedSite && !hasHostedSite) return null;
    const { href, labelKey, label, icon: Icon, exact, badgeKey, step } = item;
    const display = tr(labelKey, label);
    const active = exact ? pathname === href : pathname.startsWith(href);
    const badge = badgeKey === "orders" && pendingOrders > 0 ? pendingOrders : null;
    const isStepComplete = step ? stepComplete.get(step) : undefined;

    return (
      <Link
        key={href}
        href={href}
        title={display}
        className={cn(
          // LEAF ITEM — text-sm + medium weight, mixed case, smaller padding
          // than sub-group buttons so the visual indentation reads as
          // hierarchy. All leaves share this exact style.
          "flex items-center gap-2.5 px-3 py-1.5 text-sm font-medium transition mx-2 rounded-lg mb-0.5 relative",
          active ? "bg-orange-500 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
        )}
      >
        <div className="relative flex-shrink-0">
          <Icon className="w-4 h-4" />
          {badge !== null && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{display}</span>
            {isStepComplete === true && (
              <Check className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-white" : "text-green-400")} />
            )}
            {isStepComplete === false && (
              <Circle className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-white" : "text-gray-500")} />
            )}
            {badge !== null && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside className={cn(
      "bg-gray-900 text-white flex flex-col transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-2 text-orange-400 font-bold text-lg truncate">
            <ChefHat className="w-6 h-6 flex-shrink-0" />
            <span className="truncate">{tr("dashboard", "Dashboard")}</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn("text-gray-400 hover:text-white transition flex-shrink-0", collapsed && "mx-auto")}
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Setup-progress chip just under the header (when there's an open restaurant) */}
      {!collapsed && setupProgress && setupProgress.percent < 100 && (
        // Drives the guided walkthrough (see /admin/setup/next).
        // publishReady === all required done — drop the owner on the
        // wizard page so they see the green Publish CTA. Otherwise
        // jump straight to the first incomplete required step.
        <Link
          href={setupProgress.publishReady ? "/admin/setup" : "/admin/setup/next"}
          className="mx-2 mt-3 mb-1 bg-gradient-to-r from-orange-500/20 to-orange-500/10 border border-orange-500/40 rounded-lg px-3 py-2 text-xs hover:border-orange-500/70 transition"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-orange-400">Setup progress</span>
            <span className="text-orange-300 font-bold">{setupProgress.percent}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-400 transition-all"
              style={{ width: `${setupProgress.percent}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {setupProgress.completedSteps}/{setupProgress.totalSteps} steps complete
            {!setupProgress.publishReady && ` · ${setupProgress.requiredStepsRemaining.length} required`}
          </div>
        </Link>
      )}

      <nav className="flex-1 py-2 overflow-y-auto">
        {collapsed ? (
          // Collapsed mode: show one icon per TOP-LEVEL category.
          navGroups.map((group) => {
            const GroupIcon = group.icon;
            const items = collectItems(group);
            const activeInGroup = items.some((it) => isActiveItem(it, pathname));
            const groupBadge =
              items.some((it) => it.badgeKey === "orders") && pendingOrders > 0
                ? pendingOrders
                : null;
            return (
              <button
                key={group.key}
                onClick={() => {
                  setCollapsed(false);
                  setOpenGroup(group.key);
                }}
                title={tr(group.labelKey, group.label)}
                className={cn(
                  "w-full flex items-center justify-center py-3 transition mx-2 rounded-lg mb-1 relative",
                  activeInGroup ? "bg-orange-500 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )}
              >
                <div className="relative">
                  <GroupIcon className="w-5 h-5" />
                  {groupBadge !== null && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {groupBadge > 99 ? "99+" : groupBadge}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          // Expanded mode: top-level accordion with single-open behavior.
          navGroups.map((group, gi) => {
            const GroupIcon = group.icon;
            const isOpen = openGroup === group.key;
            const items = collectItems(group);
            const activeInGroup = items.some((it) => isActiveItem(it, pathname));
            // Roll up setup counts from any sub-groups that track them.
            const rolled = rollupCounts(group, groupCounts);

            return (
              <div key={group.key} className={gi > 0 ? "mt-2" : ""}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    // TOP-LEVEL CATEGORY — small caps, bold, tracked. All
                    // five categories share this exact style so they read
                    // as one tier of navigation.
                    "w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition",
                    activeInGroup
                      ? "text-orange-400"
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <GroupIcon className="w-4 h-4" />
                    {tr(group.labelKey, group.label)}
                    {rolled && (
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full normal-case tracking-normal",
                          rolled.done === rolled.total
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-800 text-gray-400"
                        )}
                      >
                        {rolled.done}/{rolled.total}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 transition-transform", !isOpen && "-rotate-90")}
                  />
                </button>

                {isOpen && (
                  <div className="pb-1">
                    {/* Direct items rendered at the same level as the group header */}
                    {group.items?.map(renderItem)}

                    {/* Nested sub-groups: each with its own accordion. Within
                        a single parent group only ONE sub-group is open at a
                        time (single-open). */}
                    {group.subGroups?.map((sg) => {
                      const SubIcon = sg.icon;
                      const subOpen = openSubGroup === sg.key;
                      const counts = sg.setupSectionId
                        ? groupCounts.get(sg.setupSectionId)
                        : undefined;
                      const subActive = sg.items.some((it) => isActiveItem(it, pathname));
                      return (
                        <div key={sg.key} className="mx-2 mt-0.5">
                          <button
                            onClick={() => toggleSubGroup(sg.key)}
                            className={cn(
                              // SUB-GROUP HEADER — text-sm + semibold, mixed
                              // case. All seven SETUP sub-groups (and any
                              // future sub-groups in other categories) share
                              // this exact style so they read as one tier.
                              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition",
                              subActive
                                ? "text-orange-300 bg-gray-800/60"
                                : "text-gray-300 hover:bg-gray-800/40 hover:text-white"
                            )}
                          >
                            <span className="flex items-center gap-2.5">
                              <SubIcon className="w-4 h-4" />
                              {tr(sg.labelKey, sg.label)}
                              {counts && (
                                <span
                                  className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                    counts.done === counts.total
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-gray-800 text-gray-400"
                                  )}
                                >
                                  {counts.done}/{counts.total}
                                </span>
                              )}
                            </span>
                            <ChevronDown
                              className={cn("w-3.5 h-3.5 transition-transform", !subOpen && "-rotate-90")}
                            />
                          </button>
                          {subOpen && (
                            <div className="pl-3 mt-0.5">
                              {sg.items.map(renderItem)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-gray-700 p-4 space-y-2">
        {restaurantSlug && !collapsed && (
          <Link
            href={`/order/${restaurantSlug}`}
            target="_blank"
            className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition"
          >
            <Store className="w-4 h-4" /> {tr("viewOrderingPage", "View ordering page")}
          </Link>
        )}
        {!collapsed && (
          <div className="text-xs text-gray-500 truncate">
            {(session.user as any)?.email}
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={tr("logOut", "Log out")}
          className={cn(
            "flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && tr("logOut", "Log out")}
        </button>
      </div>
    </aside>
  );
}

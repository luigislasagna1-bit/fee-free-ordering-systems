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
};

type NavGroup = {
  key: string;
  labelKey: string;
  /** Optional fallback label when the locale doesn't have the key. */
  label?: string;
  icon: LucideIcon;
  items: NavItem[];
  /** When set, the group header shows "X/Y" completion counts based on SetupProgress. */
  setupSectionId?: "basics" | "services" | "payments" | "orders" | "menu" | "publishing";
};

// ─── Sidebar structure ─────────────────────────────────────────────────────
// Phase 2 of the GloriaFood-style redesign: the Setup section is split into
// 6 sub-sections that each track completion. Each NavItem with a `step` ID
// gets a checkmark or open circle based on SetupProgress at render time.
const navGroups: NavGroup[] = [
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
      { href: "/admin/services",     labelKey: "services",      label: "Services",       icon: Layers,       step: "services.atLeastOne" },
      { href: "/admin/hours",        labelKey: "openingHours",  label: "Opening Hours",  icon: Clock,        step: "services.openingHours" },
      { href: "/admin/delivery",     labelKey: "deliveryZones", label: "Delivery Zones", icon: Truck, step: "services.deliveryZones" },
      { href: "/admin/delivery/pool", labelKey: "driverPool",   label: "Driver Pool",    icon: Truck },
      { href: "/admin/reservations", labelKey: "reservations",  label: "Reservations",   icon: CalendarDays },
      { href: "/admin/locations",    labelKey: "locations",     label: "Locations",      icon: MapIcon },
    ],
  },
  {
    key: "setup.payments",
    labelKey: "setupPayments",
    label: "Payment Methods & Taxes",
    icon: CreditCard,
    setupSectionId: "payments",
    items: [
      { href: "/admin/payments",           labelKey: "paymentMethods", label: "Accepted Methods", icon: CreditCard, step: "payments.methodsSelected" },
      { href: "/admin/payments/providers", labelKey: "payments",     label: "Stripe Connect", icon: CreditCard, step: "payments.methodConfigured" },
      { href: "/admin/service-fees",       labelKey: "serviceFees",  label: "Service Fees & Tax", icon: Wallet,   step: "payments.taxation" },
      { href: "/admin/map-settings",       labelKey: "mapSettings",  label: "Map Settings",      icon: MapIcon },
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
      // Phase 3 builds /admin/publishing/legacy-website. We surface it now so the menu
      // is wired and the empty page can render a "coming soon" stub if visited early.
      { href: "/admin/publishing", labelKey: "publishing", label: "Publishing", icon: Globe },
      { href: "/admin/website",    labelKey: "websiteTheme", label: "Website Theme", icon: Palette },
    ],
  },
  {
    key: "billing",
    labelKey: "billing",
    label: "Subscription & Billing",
    icon: Wallet,
    items: [
      { href: "/admin/billing", labelKey: "billing", label: "Billing", icon: Wallet },
      { href: "/admin/billing/add-ons", labelKey: "addOns", label: "Add-Ons", icon: Zap },
    ],
  },
  {
    key: "marketing",
    labelKey: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { href: "/admin/promotions",   labelKey: "promotions",   label: "Promotions",  icon: Tag },
      { href: "/admin/marketplace",  labelKey: "marketplace",  label: "Marketplace", icon: Sparkles },
      { href: "/admin/social-media", labelKey: "socialMedia",  label: "Social Media", icon: Share2 },
      { href: "/admin/autopilot",    labelKey: "autopilot",    label: "Autopilot",   icon: Zap },
    ],
  },
  {
    key: "reports",
    labelKey: "reports",
    label: "Reports",
    icon: BarChart3,
    items: [
      { href: "/admin",           labelKey: "dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      // Setup wizard — surfaces top of the Reports group so it's
      // always reachable. The header's "Setup X% complete" banner also
      // links here while the restaurant is unpublished.
      { href: "/admin/setup",     labelKey: "setup",     label: "Setup",     icon: Rocket },
      { href: "/admin/reports",   labelKey: "reports",   label: "Reports",   icon: BarChart3 },
      { href: "/admin/customers", labelKey: "customers", label: "Customers", icon: Users },
    ],
  },
  {
    key: "online-ordering",
    labelKey: "onlineOrdering",
    label: "Online Ordering",
    icon: ShoppingBag,
    items: [
      { href: "/admin/orders", labelKey: "orders", label: "Orders", icon: ShoppingBag, badgeKey: "orders" },
    ],
  },
  {
    key: "other",
    labelKey: "other",
    label: "Other",
    icon: MoreHorizontal,
    items: [
      { href: "/admin/settings", labelKey: "settings", label: "Settings", icon: Settings },
    ],
  },
];

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
}: {
  session: Session;
  pendingOrders?: number;
  setupProgress?: SetupProgress | null;
}) {
  const tr = useSafeT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const restaurantSlug = (session.user as any)?.restaurantSlug;

  const allOpen = () => Object.fromEntries(navGroups.map(g => [g.key, true]));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => allOpen());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setOpenGroups(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups)); } catch {}
  }, [openGroups, hydrated]);

  useEffect(() => {
    const activeGroup = navGroups.find(g => g.items.some(it => isActiveItem(it, pathname)));
    if (activeGroup && !openGroups[activeGroup.key]) {
      setOpenGroups(prev => ({ ...prev, [activeGroup.key]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

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
          "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition mx-2 rounded-lg mb-0.5 relative",
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
          navGroups.map((group) => {
            const GroupIcon = group.icon;
            const activeInGroup = group.items.some(it => isActiveItem(it, pathname));
            const groupBadge = group.items.find(it => it.badgeKey === "orders") && pendingOrders > 0
              ? pendingOrders
              : null;
            return (
              <button
                key={group.key}
                onClick={() => {
                  setCollapsed(false);
                  setOpenGroups(prev => ({ ...prev, [group.key]: true }));
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
          navGroups.map((group, gi) => {
            const isOpen = !!openGroups[group.key];
            const counts = group.setupSectionId ? groupCounts.get(group.setupSectionId) : undefined;
            const allDone = counts ? counts.done === counts.total : false;
            return (
              <div key={group.key} className={gi > 0 ? "mt-1.5" : ""}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition"
                >
                  <span className="flex items-center gap-1.5">
                    {tr(group.labelKey, group.label)}
                    {counts && (
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                        allDone ? "bg-green-500/20 text-green-400" : "bg-gray-800 text-gray-400"
                      )}>
                        {counts.done}/{counts.total}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn("w-3 h-3 transition-transform", !isOpen && "-rotate-90")}
                  />
                </button>
                {isOpen && (
                  <div>
                    {group.items.map(renderItem)}
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

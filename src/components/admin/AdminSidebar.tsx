"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, BarChart3,
  Settings, ChefHat, Tag, Zap, Truck, Clock, Receipt, Store, LogOut, ChevronLeft, Menu,
  CreditCard, Palette, CalendarDays, Layers, ChevronDown,
  Wrench, Megaphone, MoreHorizontal, Map, Bell, Wallet,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { Session } from "next-auth";
import { useTranslations } from "next-intl";

type NavItem = {
  href: string;
  labelKey: string;          // key into the "admin.sidebar" namespace
  icon: LucideIcon;
  exact?: boolean;
  badgeKey?: string;
};

type NavGroup = {
  key: string;
  labelKey: string;          // key into the "admin.sidebar" namespace
  icon: LucideIcon;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    key: "setup",
    labelKey: "setup",
    icon: Wrench,
    items: [
      { href: "/admin/profile",            labelKey: "profile",        icon: Store },
      { href: "/admin/menu",               labelKey: "menu",           icon: UtensilsCrossed },
      { href: "/admin/hours",              labelKey: "openingHours",   icon: Clock },
      { href: "/admin/services",           labelKey: "services",       icon: Layers },
      { href: "/admin/delivery",           labelKey: "deliveryZones",  icon: Truck },
      { href: "/admin/reservations",       labelKey: "reservations",   icon: CalendarDays },
      { href: "/admin/payments/providers", labelKey: "payments",       icon: CreditCard },
      { href: "/admin/service-fees",       labelKey: "serviceFees",    icon: Wallet },
      { href: "/admin/map-settings",       labelKey: "mapSettings",    icon: Map },
      { href: "/admin/notifications",      labelKey: "notifications",  icon: Bell },
      { href: "/admin/receipts",           labelKey: "receipts",       icon: Receipt },
    ],
  },
  {
    key: "marketing",
    labelKey: "marketing",
    icon: Megaphone,
    items: [
      { href: "/admin/promotions", labelKey: "promotions",   icon: Tag },
      { href: "/admin/autopilot",  labelKey: "autopilot",    icon: Zap },
      { href: "/admin/website",    labelKey: "websiteTheme", icon: Palette },
    ],
  },
  {
    key: "reports",
    labelKey: "reports",
    icon: BarChart3,
    items: [
      { href: "/admin",           labelKey: "dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/reports",   labelKey: "reports",   icon: BarChart3 },
      { href: "/admin/customers", labelKey: "customers", icon: Users },
    ],
  },
  {
    key: "online-ordering",
    labelKey: "onlineOrdering",
    icon: ShoppingBag,
    items: [
      { href: "/admin/orders", labelKey: "orders", icon: ShoppingBag, badgeKey: "orders" },
    ],
  },
  {
    key: "other",
    labelKey: "other",
    icon: MoreHorizontal,
    items: [
      { href: "/admin/settings", labelKey: "settings", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "admin-sidebar-groups-v1";

function isActiveItem(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function AdminSidebar({ session, pendingOrders = 0 }: { session: Session; pendingOrders?: number }) {
  const t = useTranslations("admin.sidebar");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const restaurantSlug = (session.user as any)?.restaurantSlug;

  const allOpen = () => Object.fromEntries(navGroups.map(g => [g.key, true]));
  // Start with the stable "all open" state on both server and first client
  // render to avoid a hydration mismatch on the chevron rotation. The persisted
  // user state is then merged in via the useEffect below, after mount.
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
    if (!hydrated) return; // don't overwrite storage with the default before we've read it
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups)); } catch {}
  }, [openGroups, hydrated]);

  // If the user navigates to a route inside a collapsed group, auto-expand it.
  useEffect(() => {
    const activeGroup = navGroups.find(g => g.items.some(it => isActiveItem(it, pathname)));
    if (activeGroup && !openGroups[activeGroup.key]) {
      setOpenGroups(prev => ({ ...prev, [activeGroup.key]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const renderItem = (item: NavItem) => {
    const { href, labelKey, icon: Icon, exact, badgeKey } = item;
    const label = t(labelKey);
    const active = exact ? pathname === href : pathname.startsWith(href);
    const badge = badgeKey === "orders" && pendingOrders > 0 ? pendingOrders : null;

    return (
      <Link
        key={href}
        href={href}
        title={label}
        className={cn(
          "flex items-center gap-3 px-4 py-3 text-sm font-medium transition mx-2 rounded-lg mb-1 relative",
          active ? "bg-orange-500 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
        )}
      >
        <div className="relative flex-shrink-0">
          <Icon className="w-5 h-5" />
          {badge !== null && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        {!collapsed && (
          <span className="flex-1">{label}</span>
        )}
        {!collapsed && badge !== null && (
          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {badge > 99 ? "99+" : badge}
          </span>
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
            <span className="truncate">{t("dashboard")}</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn("text-gray-400 hover:text-white transition flex-shrink-0", collapsed && "mx-auto")}
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {collapsed ? (
          // Collapsed: only the 5 group icons. Clicking one expands the sidebar
          // and ensures that group is open so the user can find their sub-item.
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
                title={t(group.labelKey)}
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
            return (
              <div key={group.key} className={gi > 0 ? "mt-2" : ""}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition"
                >
                  <span>{t(group.labelKey)}</span>
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 transition-transform", !isOpen && "-rotate-90")}
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
            <Store className="w-4 h-4" /> {t("viewOrderingPage")}
          </Link>
        )}
        {!collapsed && (
          <div className="text-xs text-gray-500 truncate">
            {(session.user as any)?.email}
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={t("logOut")}
          className={cn(
            "flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && t("logOut")}
        </button>
      </div>
    </aside>
  );
}

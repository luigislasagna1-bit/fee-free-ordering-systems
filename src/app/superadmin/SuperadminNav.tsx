"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Store, CreditCard, Mail, LogOut, Zap, Users, UserCog, Wallet, Sparkles, Bug, Bell, Map as MapIcon, Building2, Bike, Smartphone, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

// adminOnly items disappear for restricted (platform_support) staff — the
// pages + APIs behind them are ALSO gated server-side; hiding is UX, the
// guards are the security boundary.
const items = [
  { href: "/superadmin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/superadmin/restaurants", label: "Restaurants", icon: Store },
  { href: "/superadmin/billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { href: "/superadmin/add-ons", label: "Add-Ons", icon: Zap, adminOnly: true },
  { href: "/superadmin/branded-apps", label: "Branded Apps", icon: Smartphone },
  { href: "/superadmin/marketplace-settlements", label: "Marketplace Settlements", icon: Sparkles, adminOnly: true },
  { href: "/superadmin/drivers", label: "Delivery Drivers", icon: Bike, adminOnly: true },
  { href: "/superadmin/driver-payouts", label: "Driver Payouts", icon: Wallet, adminOnly: true },
  { href: "/superadmin/resellers", label: "Resellers", icon: Users },
  { href: "/reseller-reports", label: "Reseller Reports", icon: Bug },
  { href: "/reseller-reports/notifications", label: "Notifications", icon: Bell },
  { href: "/superadmin/payouts", label: "Payouts", icon: Wallet, adminOnly: true },
  { href: "/superadmin/team", label: "Team", icon: UserCog, adminOnly: true },
  { href: "/superadmin/data-requests", label: "Data Requests", icon: ShieldCheck, adminOnly: true },
  { href: "/superadmin/settings/stripe", label: "Stripe Settings", icon: Zap, adminOnly: true },
  { href: "/superadmin/settings/email", label: "Email Settings", icon: Mail, adminOnly: true },
  { href: "/superadmin/settings/maps", label: "Maps Settings", icon: MapIcon, adminOnly: true },
  { href: "/superadmin/settings/company", label: "Company / Invoicing", icon: Building2, adminOnly: true },
];

export function SuperadminNav({ reportsNewCount = 0, notificationsCount = 0, restricted = false }: { reportsNewCount?: number; notificationsCount?: number; restricted?: boolean }) {
  const path = usePathname();
  return (
    // The sidebar is a fixed-height flex column (parent <aside> is inside an
    // h-screen / overflow-hidden shell). The old single scroll-less <nav>
    // pushed "Log out" below the fold once there were enough items — at 100%
    // zoom it was unreachable (Luigi 2026-08-03). Fix: the item list scrolls
    // and Log out is PINNED so it's always visible at any zoom / item count.
    // min-h-0 lets this flex child shrink below its content so overflow works.
    <div className="flex-1 flex flex-col min-h-0">
      <nav className="flex-1 overflow-y-auto py-3">
      {items.filter((i) => !restricted || !i.adminOnly).map(({ href, label, icon: Icon, exact }) => {
        // "Reseller Reports" should NOT light up while on its notifications
        // sub-page — that's the Notifications item's job.
        const active = href === "/reseller-reports"
          ? path === href || (path.startsWith("/reseller-reports/") && !path.startsWith("/reseller-reports/notifications"))
          : exact ? path === href : path.startsWith(href);
        const badgeCount =
          href === "/reseller-reports" ? reportsNewCount :
          href === "/reseller-reports/notifications" ? notificationsCount : 0;
        return (
          <Link key={href} href={href} className={cn("flex items-center gap-3 px-4 py-3 text-sm font-medium mx-2 rounded-lg mb-1 transition", active ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-gray-100")}>
            <Icon className="w-4 h-4" /> <span className="flex-1">{label}</span>
            {badgeCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
      </nav>
      {/* Pinned so logout is always reachable regardless of item count/zoom. */}
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex-shrink-0 flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-red-500 mx-2 mb-1 border-t border-gray-100 pt-3 transition w-full">
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </div>
  );
}

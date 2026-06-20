"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Store, CreditCard, Mail, LogOut, Zap, Users, Wallet, Sparkles, Bug, Bell, Map as MapIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/superadmin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/superadmin/restaurants", label: "Restaurants", icon: Store },
  { href: "/superadmin/billing", label: "Billing", icon: CreditCard },
  { href: "/superadmin/add-ons", label: "Add-Ons", icon: Zap },
  { href: "/superadmin/marketplace-settlements", label: "Marketplace Settlements", icon: Sparkles },
  { href: "/superadmin/resellers", label: "Resellers", icon: Users },
  { href: "/reseller-reports", label: "Reseller Reports", icon: Bug },
  { href: "/reseller-reports/notifications", label: "Notifications", icon: Bell },
  { href: "/superadmin/payouts", label: "Payouts", icon: Wallet },
  { href: "/superadmin/settings/stripe", label: "Stripe Settings", icon: Zap },
  { href: "/superadmin/settings/email", label: "Email Settings", icon: Mail },
  { href: "/superadmin/settings/maps", label: "Maps Settings", icon: MapIcon },
];

export function SuperadminNav({ reportsNewCount = 0, notificationsCount = 0 }: { reportsNewCount?: number; notificationsCount?: number }) {
  const path = usePathname();
  return (
    <nav className="flex-1 py-3">
      {items.map(({ href, label, icon: Icon, exact }) => {
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
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-red-500 mx-2 transition w-full mt-2">
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </nav>
  );
}

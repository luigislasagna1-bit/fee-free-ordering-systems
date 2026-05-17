"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Store, CreditCard, Mail, LogOut, Zap, Users, Wallet } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/superadmin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/superadmin/restaurants", label: "Restaurants", icon: Store },
  { href: "/superadmin/billing", label: "Billing", icon: CreditCard },
  { href: "/superadmin/add-ons", label: "Add-Ons", icon: Zap },
  { href: "/superadmin/resellers", label: "Resellers", icon: Users },
  { href: "/superadmin/payouts", label: "Payouts", icon: Wallet },
  { href: "/superadmin/settings/stripe", label: "Stripe Settings", icon: Zap },
  { href: "/superadmin/settings/email", label: "Email Settings", icon: Mail },
];

export function SuperadminNav() {
  const path = usePathname();
  return (
    <nav className="flex-1 py-3">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("flex items-center gap-3 px-4 py-3 text-sm font-medium mx-2 rounded-lg mb-1 transition", active ? "bg-orange-500 text-white" : "text-gray-300 hover:bg-gray-800")}>
            <Icon className="w-4 h-4" /> {label}
          </Link>
        );
      })}
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:text-red-400 mx-2 transition w-full mt-2">
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </nav>
  );
}

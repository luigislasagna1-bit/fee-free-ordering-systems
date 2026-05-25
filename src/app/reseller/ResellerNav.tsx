"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Store,
  Receipt,
  Wallet,
  User,
  LogOut,
  BarChart3,
  ChevronDown,
  GraduationCap,
  Palette,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

/**
 * Reseller navigation — grouped sections inspired by GloriaFood/Oracle
 * PartnerNet. Single-open accordion at the top level so the sidebar
 * stays scannable. Items inside a group expand only when the user
 * clicks the group header OR is currently on a page inside it.
 *
 * Structure intentionally mirrors GloriaFood:
 *   Overview                — at-a-glance dashboard
 *   Performance             — Restaurants' Sales + Commissions
 *   Restaurants             — Management (+ future: Pending Requests)
 *   Sales & Marketing       — coaching + partner resources (Phase 2)
 *   Branding                — white-label config (Phase 2)
 *   Payouts                 — request + history
 *   Profile & Referral      — account + referral link
 *
 * Phase 1 ships the grouping; phase 2 fills in the placeholder pages.
 */

type Leaf = {
  href: string;
  label: string;
};
type Group = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true, the group is one big link (no sub-items). */
  href?: string;
  items?: Leaf[];
  /** Marks a section as "coming soon" — renders disabled-looking. */
  comingSoon?: boolean;
};

const groups: Group[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    href: "/reseller",
  },
  {
    id: "performance",
    label: "Performance",
    icon: BarChart3,
    items: [
      { href: "/reseller/commissions", label: "Commissions" },
    ],
  },
  {
    id: "restaurants",
    label: "Restaurants",
    icon: Store,
    items: [
      { href: "/reseller/restaurants", label: "Management" },
    ],
  },
  {
    id: "sales-marketing",
    label: "Sales & Marketing",
    icon: GraduationCap,
    items: [
      { href: "/reseller/sales/preamble", label: "Preamble" },
      { href: "/reseller/sales/way-to-go", label: "Way to go" },
      { href: "/reseller/sales/partner-resources", label: "Partner Resources" },
      { href: "/reseller/sales/restaurant-resources", label: "Restaurant Resources" },
    ],
  },
  {
    id: "branding",
    label: "Branding",
    icon: Palette,
    comingSoon: true,
  },
  {
    id: "payouts",
    label: "Payouts",
    icon: Wallet,
    href: "/reseller/payouts",
  },
  {
    id: "profile",
    label: "Profile & Referral",
    icon: User,
    href: "/reseller/profile",
  },
];

function pathMatchesGroup(path: string, group: Group): boolean {
  if (group.href === "/reseller") return path === "/reseller";
  if (group.href) return path.startsWith(group.href);
  if (group.items) return group.items.some((i) => path.startsWith(i.href));
  return false;
}

export function ResellerNav() {
  const path = usePathname();
  // Track which group is currently expanded. Default to whichever group
  // contains the active route so the user lands inside the right section.
  const initiallyOpen =
    groups.find((g) => pathMatchesGroup(path, g))?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(initiallyOpen);

  return (
    <nav className="flex-1 py-3">
      {groups.map((group) => {
        const Icon = group.icon;
        const activeAnywhere = pathMatchesGroup(path, group);
        const isOpen = openId === group.id;

        // Leaf-style top-level entry (no sub-items, just a single link)
        if (group.href && !group.items) {
          return (
            <Link
              key={group.id}
              href={group.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-medium mx-2 rounded-lg mb-1 transition",
                activeAnywhere
                  ? "bg-emerald-500 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4" /> {group.label}
            </Link>
          );
        }

        // "Coming soon" placeholder group — non-interactive, but visible
        // so the user can see what's planned and the structure stays
        // stable as we ship each phase.
        if (group.comingSoon) {
          return (
            <div
              key={group.id}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium mx-2 rounded-lg mb-1 text-gray-500 cursor-not-allowed select-none"
              title="Coming soon"
            >
              <Icon className="w-4 h-4 opacity-60" />
              <span className="opacity-80">{group.label}</span>
              <span className="ml-auto text-[9px] uppercase tracking-wider bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">
                Soon
              </span>
            </div>
          );
        }

        // Group with sub-items — collapsible accordion
        return (
          <div key={group.id} className="mb-1">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : group.id)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-medium mx-2 rounded-lg w-[calc(100%-1rem)] transition",
                activeAnywhere && !isOpen
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-gray-300 hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{group.label}</span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 ml-auto transition-transform",
                  isOpen ? "rotate-180" : "rotate-0"
                )}
              />
            </button>
            {isOpen && group.items && (
              <div className="ml-4 mt-0.5 border-l border-gray-800 pl-2">
                {group.items.map((leaf) => {
                  const leafActive = path.startsWith(leaf.href);
                  return (
                    <Link
                      key={leaf.href}
                      href={leaf.href}
                      className={cn(
                        "block px-4 py-2 text-sm rounded-lg mb-0.5 transition",
                        leafActive
                          ? "bg-emerald-500 text-white font-semibold"
                          : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                      )}
                    >
                      {leaf.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:text-red-400 mx-2 transition w-[calc(100%-1rem)] mt-4 border-t border-gray-800 pt-4"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </nav>
  );
}

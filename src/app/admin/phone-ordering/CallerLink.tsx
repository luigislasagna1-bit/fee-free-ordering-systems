"use client";

import Link from "next/link";
import { History } from "lucide-react";

/**
 * A link to the caller-history page that can sit INSIDE a clickable row
 * (CallRowLink) — it stops the click from bubbling so the row's own
 * navigation doesn't fire on top of it. Phone-keyed: `digits` is
 * phoneDigitsKey(fromNumber), the route key of /admin/phone-ordering/callers.
 */
export function CallerLink({
  digits,
  title,
  children,
  className = "",
  showIcon = false,
}: {
  digits: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <Link
      href={`/admin/phone-ordering/callers/${digits}`}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={`group/caller inline-flex items-center gap-1.5 rounded hover:text-amber-700 hover:underline decoration-amber-300 underline-offset-2 transition ${className}`}
    >
      {children}
      {showIcon && <History className="w-3.5 h-3.5 text-gray-300 group-hover/caller:text-amber-500 transition" />}
    </Link>
  );
}

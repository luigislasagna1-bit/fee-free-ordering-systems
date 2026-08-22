"use client";

import { useRouter } from "next/navigation";

/** Whole-row link for the server-rendered calls table (same pattern as the
 *  reports LocationDrillRow — a <tr> can't be a <Link>). Keyboard-reachable:
 *  the row is focusable and Enter/Space follow it, so the table isn't
 *  mouse-only. Nested real links (CallerLink) stop propagation themselves. */
export function CallRowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="border-t border-gray-50 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer transition"
    >
      {children}
    </tr>
  );
}

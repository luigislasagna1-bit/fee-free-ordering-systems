"use client";

import { useRouter } from "next/navigation";

/** Whole-row link for the server-rendered calls table (same pattern as the
 *  reports LocationDrillRow — a <tr> can't be a <Link>). */
export function CallRowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition"
    >
      {children}
    </tr>
  );
}

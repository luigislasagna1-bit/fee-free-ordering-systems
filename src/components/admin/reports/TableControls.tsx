"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Search } from "lucide-react";

/**
 * Search box + "N per page" selector for the List View tables (Orders /
 * Clients), matching the GloriaFood list controls. State lives in the URL
 * (?q= / ?size=) so it survives refresh + share-links and the SERVER does the
 * filtering/pagination — we never load the whole table into the client.
 *
 * Typing debounces (350ms) before pushing; changing either control resets to
 * page 1.
 */
export function TableControls({ searchPlaceholder, perPageLabel }: { searchPlaceholder: string; perPageLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  // Debounced search push. No-op when the box already matches the URL (so the
  // post-navigation re-render doesn't re-push).
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (current === q) return;
    const id = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (q) sp.set("q", q); else sp.delete("q");
      sp.delete("page");
      router.push(`${pathname}?${sp.toString()}`);
    }, 350);
    return () => clearTimeout(id);
  }, [q, searchParams, pathname, router]);

  const size = searchParams.get("size") ?? "20";
  const onSize = (v: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("size", v);
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-60 max-w-full focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
        />
      </div>
      <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
        <select
          value={size}
          onChange={(e) => onSize(e.target.value)}
          className="border border-gray-200 rounded-lg pl-2 pr-7 py-2 text-sm text-gray-700 bg-white"
        >
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        {perPageLabel}
      </label>
    </div>
  );
}

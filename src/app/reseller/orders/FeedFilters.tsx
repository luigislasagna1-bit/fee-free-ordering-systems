"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Restaurant + Type pickers for the Orders List. Both write a query param and
 * reset paging, mirroring GloriaFood's per-column "Select" filters. Status is
 * rendered server-side as chips (it's the at-a-glance hero), so it isn't here.
 */
export function FeedFilters({
  restaurants,
  types,
  allRestaurantsLabel,
  allTypesLabel,
}: {
  restaurants: { id: string; name: string }[];
  types: { value: string; label: string }[];
  allRestaurantsLabel: string;
  allTypesLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const set = (key: string, value: string) => {
    const u = new URLSearchParams(sp.toString());
    if (value) u.set(key, value);
    else u.delete(key);
    u.delete("page");
    router.push(`${pathname}?${u.toString()}`);
  };

  const cls =
    "text-sm rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

  return (
    <>
      {restaurants.length > 1 && (
        <select className={cls} value={sp.get("restaurant") ?? ""} onChange={(e) => set("restaurant", e.target.value)}>
          <option value="">{allRestaurantsLabel}</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      )}
      <select className={cls} value={sp.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
        <option value="">{allTypesLabel}</option>
        {types.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </>
  );
}

/**
 * Pure planning for duplicate-category merges (no prisma → unit-testable). The
 * route (src/app/api/admin/menu/dedupe-categories) loads categories, calls
 * planCategoryMerges, and executes the returned plan in a transaction.
 *
 * Two categories are duplicates when they share the same NORMALIZED name within
 * the same menu version. For each duplicate group we keep the richest as the
 * survivor and fold the others in:
 *   - an item whose normalized name is NOT already in the survivor → moved
 *   - an item whose normalized name IS already in the survivor → removed (exact
 *     duplicate; safe because Order.menuItemId is SetNull on delete)
 * Luigi 2026-06-27.
 */
export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface CatLike {
  id: string;
  name: string;
  menuId: string | null;
  sortOrder: number;
  createdAt: Date | string | number;
  menuItems: { id: string; name: string }[];
}

export interface MergePlan {
  survivorId: string;
  loserIds: string[];
  moveItemIds: string[];   // items repointed to the survivor
  deleteItemIds: string[]; // exact-duplicate items removed
}

const ms = (d: Date | string | number) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Build the merge plan for every duplicate-name group (≥2 categories). Groups
 *  with a unique name produce no plan (left untouched). */
export function planCategoryMerges(categories: CatLike[]): MergePlan[] {
  const groups = new Map<string, CatLike[]>();
  for (const c of categories) {
    const key = `${c.menuId ?? "none"}::${normalizeName(c.name)}`;
    const arr = groups.get(key);
    if (arr) arr.push(c); else groups.set(key, [c]);
  }

  const plans: MergePlan[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Survivor = most items, tie → lowest sortOrder, then earliest created.
    const sorted = [...group].sort((a, b) =>
      b.menuItems.length - a.menuItems.length ||
      a.sortOrder - b.sortOrder ||
      ms(a.createdAt) - ms(b.createdAt));
    const survivor = sorted[0];
    const losers = sorted.slice(1);

    const survivorNames = new Set(survivor.menuItems.map((i) => normalizeName(i.name)));
    const moveItemIds: string[] = [];
    const deleteItemIds: string[] = [];
    for (const loser of losers) {
      for (const item of loser.menuItems) {
        const n = normalizeName(item.name);
        if (survivorNames.has(n)) {
          deleteItemIds.push(item.id);
        } else {
          survivorNames.add(n);
          moveItemIds.push(item.id);
        }
      }
    }

    plans.push({ survivorId: survivor.id, loserIds: losers.map((l) => l.id), moveItemIds, deleteItemIds });
  }
  return plans;
}

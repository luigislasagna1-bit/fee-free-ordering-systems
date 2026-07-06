import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { resolveScheduledMenuId } from "@/lib/menu-schedule";

/**
 * Resolve the id of a restaurant's single ACTIVE menu — the one customers see.
 * Returns null only if a restaurant somehow has no active menu (shouldn't happen
 * after the Phase 0 backfill); callers fall back to a restaurant-wide query so
 * the menu never disappears. Multi-menu manager. Luigi 2026-06-05.
 */
export async function resolveActiveMenuId(restaurantId: string): Promise<string | null> {
  const m = await prisma.menu.findFirst({
    where: { restaurantId, isActive: true },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return m?.id ?? null;
}

/**
 * Activate `menuId` for a restaurant, atomically deactivating whichever menu
 * was active. Stamps publishedAt + clears any pending schedule. Enforces the
 * "exactly one active menu" invariant. Used by manual activation and the
 * scheduled-publish cron.
 */
export async function activateMenu(restaurantId: string, menuId: string): Promise<void> {
  // Capture the menu that was live so we can re-point promotions afterward.
  const prevActive = await prisma.menu.findFirst({
    where: { restaurantId, isActive: true, id: { not: menuId } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.menu.updateMany({
      where: { restaurantId, isActive: true, id: { not: menuId } },
      data: { isActive: false },
    }),
    prisma.menu.update({
      where: { id: menuId },
      data: { isActive: true, isArchived: false, publishedAt: new Date(), scheduledActivateAt: null },
    }),
  ]);

  // Re-point item-specific promotions from the old menu's item/category ids to
  // the new menu's equivalents (matched by item lineageId / category name), so
  // a price-update menu swap doesn't silently stop those promos applying.
  if (prevActive && prevActive.id !== menuId) {
    try {
      await remapPromotionsBetweenMenus(restaurantId, prevActive.id, menuId);
    } catch (e) {
      console.error("[menu] remapPromotionsBetweenMenus failed", { restaurantId, fromMenuId: prevActive.id, toMenuId: menuId, e });
    }
  }
}

/**
 * Re-map every promotion's ruleConfig item/category references from one menu
 * version to another. Items match by `lineageId` (shared across versions);
 * categories match by name (case-insensitive). Ids already valid in the target
 * menu are kept (idempotent); ids with no equivalent are dropped from that
 * group. Returns the count of promotions changed + any unmatched references
 * (so callers can warn the owner). Best-effort, only writes when something
 * actually changed. Multi-menu Phase 4. Luigi 2026-06-05.
 */
export async function remapPromotionsBetweenMenus(
  restaurantId: string,
  fromMenuId: string,
  toMenuId: string,
): Promise<{ changed: number; unmatchedItems: number; unmatchedCategories: number }> {
  const [fromItems, toItems, fromCats, toCats, promos] = await Promise.all([
    prisma.menuItem.findMany({ where: { category: { menuId: fromMenuId } }, select: { id: true, lineageId: true, name: true } }),
    prisma.menuItem.findMany({ where: { category: { menuId: toMenuId } }, select: { id: true, lineageId: true, name: true, isHidden: true } }),
    prisma.menuCategory.findMany({ where: { menuId: fromMenuId }, select: { id: true, name: true } }),
    prisma.menuCategory.findMany({ where: { menuId: toMenuId }, select: { id: true, name: true, isHidden: true } }),
    prisma.promotion.findMany({ where: { restaurantId }, select: { id: true, ruleConfig: true } }),
  ]);

  // Collision-safe winner pick (2026-07-05 adversarial review): TWO target-
  // menu items can share a lineageId (duplicate-category copies keep the
  // source's lineage), and a plain Map was last-row-wins — nondeterministic
  // and able to crown a hidden twin. Deterministic preference instead:
  // same NAME as the old ref first, then visible over hidden, then A→Z.
  const norm = (s: string) => s.trim().toLowerCase();
  const oldItem = new Map(fromItems.map((i) => [i.id, { lin: (i.lineageId ?? i.id) as string, name: i.name }]));
  const toByLineage = new Map<string, { id: string; name: string; isHidden: boolean }[]>();
  for (const i of toItems) {
    const k = (i.lineageId ?? i.id) as string;
    (toByLineage.get(k) ?? toByLineage.set(k, []).get(k)!).push({ id: i.id, name: i.name, isHidden: !!i.isHidden });
  }
  const pickNewItem = (oldId: string): string | undefined => {
    const o = oldItem.get(oldId);
    if (!o) return undefined;
    const cands = toByLineage.get(o.lin) ?? [];
    if (cands.length === 0) return undefined;
    const ranked = [...cands].sort((a, b) =>
      (norm(b.name) === norm(o.name) ? 1 : 0) - (norm(a.name) === norm(o.name) ? 1 : 0) ||
      (a.isHidden ? 1 : 0) - (b.isHidden ? 1 : 0) ||
      a.name.localeCompare(b.name),
    );
    return ranked[0].id;
  };
  const newItemIds = new Set(toItems.map((i) => i.id));
  const oldCatName = new Map(fromCats.map((c) => [c.id, norm(c.name)]));
  // Same determinism for same-named target categories: visible first, A→Z.
  const nameToNewCat = new Map<string, string>();
  for (const c of [...toCats].sort((a, b) => ((a as any).isHidden ? 1 : 0) - ((b as any).isHidden ? 1 : 0) || a.name.localeCompare(b.name))) {
    if (!nameToNewCat.has(norm(c.name))) nameToNewCat.set(norm(c.name), c.id);
  }
  const newCatIds = new Set(toCats.map((c) => c.id));

  let changed = 0, unmatchedItems = 0, unmatchedCategories = 0;

  for (const p of promos) {
    if (!p.ruleConfig || typeof p.ruleConfig !== "object") continue;
    const rc = JSON.parse(JSON.stringify(p.ruleConfig)) as any; // deep clone
    if (!Array.isArray(rc.groups)) continue;
    let mutated = false;

    for (const g of rc.groups) {
      if (Array.isArray(g.itemIds)) {
        const next: string[] = [];
        for (const id of g.itemIds) {
          if (newItemIds.has(id)) { next.push(id); continue; }          // already current
          const mapped = pickNewItem(id);
          if (mapped) next.push(mapped); else unmatchedItems++;
        }
        const deduped = [...new Set(next)];
        if (JSON.stringify(deduped) !== JSON.stringify(g.itemIds)) { g.itemIds = deduped; mutated = true; }
      }
      if (Array.isArray(g.categoryIds)) {
        const next: string[] = [];
        for (const id of g.categoryIds) {
          if (newCatIds.has(id)) { next.push(id); continue; }
          const nm = oldCatName.get(id);
          const mapped = nm ? nameToNewCat.get(nm) : undefined;
          if (mapped) next.push(mapped); else unmatchedCategories++;
        }
        const deduped = [...new Set(next)];
        if (JSON.stringify(deduped) !== JSON.stringify(g.categoryIds)) { g.categoryIds = deduped; mutated = true; }
      }
    }

    if (mutated) {
      await prisma.promotion.update({ where: { id: p.id }, data: { ruleConfig: rc } });
      changed++;
    }
  }

  return { changed, unmatchedItems, unmatchedCategories };
}

/**
 * SERVE-TIME lineage resolution for promo item/category references
 * (Fabrizio cmr80t9rk, 2026-07-05).
 *
 * remapPromotionsBetweenMenus above rewrites promos when a menu is SET LIVE —
 * but a promo created AFTERWARDS can still reference items of an inactive
 * menu (the promo picker is multi-menu by design, and Fabrizio built his
 * MENU PRANZO bundle against the original "Main Menu" a month after its copy
 * went live → every group resolved to zero items → "No eligible items for
 * this slot"). This resolver is the missing half: at SERVE time, translate
 * stale references through MenuItem.lineageId (categories by name — the same
 * rules the write-time remap uses) to the SERVED menu's ids.
 *
 * Guarantees (hardened by the 2026-07-05 adversarial review):
 *   - ADDITIVE ONLY: original refs are kept, live equivalents are appended —
 *     a promo that resolves today keeps resolving identically; one that
 *     didn't gains matches. No ref is ever dropped, nothing is written to
 *     the DB (pure per-request view).
 *   - FAIL-OPEN: any error returns the promos untouched.
 *   - SERVED-MENU AWARE: "live" = resolveScheduledMenuId (not isActive), and
 *     only DEAD menus' refs resolve — a day-parted alternate menu's promo
 *     stays scoped to its own serving window (fails closed by design).
 *   - COLLISION-SAFE: hidden twins never qualify; same-lineage twins prefer
 *     the name-equal match, else ALL visible twins are appended
 *     (deterministic). Category name-mapping is same-restaurant only.
 *   - Zero extra queries when every ref is already live (the common case
 *     costs one PK-indexed lookup on the referenced ids); stale resolutions
 *     are memoized 30s in prod.
 *   - KNOWN LIMIT: group.variantIds are NOT resolved (variants carry no
 *     lineage) — a variant-targeted promo built on a dead menu stays
 *     unmatched, which fails CLOSED (no discount) rather than leaking money.
 *
 * Used by BOTH checkout routes (via buildPromoOrderContext — the preview ==
 * charge seam), the customer order page's promo payload, and the orders
 * route's bundle validation, so all surfaces agree.
 */
// Group-bearing shapes across every promo type: groups / itemGroups
// arrays + the single eligibleGroup/paidGroup/freeGroup objects. Shared by
// the serve-time resolver below and describePromoLiveTargets (admin notice).
function promoGroupsOf(rc: any): any[] {
  const out: any[] = [];
  if (Array.isArray(rc?.groups)) out.push(...rc.groups);
  if (Array.isArray(rc?.itemGroups)) out.push(...rc.itemGroups);
  for (const k of ["eligibleGroup", "paidGroup", "freeGroup"]) {
    if (rc?.[k] && typeof rc[k] === "object") out.push(rc[k]);
  }
  return out.filter((g) => g && typeof g === "object");
}
function parsePromoRc(p: { ruleConfig?: unknown; rules?: string | null }): any | null {
  let rc: any = (p as any).ruleConfig;
  if (typeof rc === "string") { try { rc = JSON.parse(rc); } catch { rc = null; } }
  if (!rc || typeof rc !== "object") { try { rc = JSON.parse((p as any).rules ?? "{}"); } catch { rc = null; } }
  return rc && typeof rc === "object" ? rc : null;
}

/**
 * Which promo refs are resolvable-stale, relative to the menu customers SEE.
 * Two rules hardened after the 2026-07-05 adversarial review:
 *   - "live" = resolveScheduledMenuId (day-parted/windowed menus are served
 *     while isActive=false — plain isActive misclassified them as stale and
 *     revived lunch-menu deals at dinner);
 *   - only a DEAD menu's refs resolve: inactive AND unwindowed. Refs to a
 *     windowed alternate menu stay untouched — that promo is simply scoped to
 *     its menu's serving window, which is the owner's intent (fails closed).
 */
async function classifyPromoRefs(menuOwnerId: string, itemRefs: Set<string>, catRefs: Set<string>): Promise<{
  servedMenuId: string | null;
  staleItems: { id: string; name: string; lineageId: string | null }[];
  staleCats: { id: string; name: string; restaurantId: string }[];
}> {
  const servedMenuId = await resolveScheduledMenuId(menuOwnerId);
  const MENU_SEL = { select: { id: true, isActive: true, availableFrom: true, availableTo: true } } as const;
  const [refItems, refCats] = await Promise.all([
    itemRefs.size
      ? prisma.menuItem.findMany({
          where: { id: { in: [...itemRefs] } },
          select: { id: true, name: true, lineageId: true, category: { select: { menu: MENU_SEL } } },
        })
      : Promise.resolve([] as any[]),
    catRefs.size
      ? prisma.menuCategory.findMany({
          where: { id: { in: [...catRefs] } },
          select: { id: true, name: true, restaurantId: true, menu: MENU_SEL },
        })
      : Promise.resolve([] as any[]),
  ]);
  // menu null = legacy single-menu rows → always live, never resolved.
  const dead = (m: any): boolean =>
    !!m && m.id !== servedMenuId && m.isActive === false && !(m.availableFrom && m.availableTo);
  return {
    servedMenuId,
    staleItems: refItems.filter((i: any) => dead(i.category?.menu)).map((i: any) => ({ id: i.id, name: i.name, lineageId: i.lineageId })),
    staleCats: refCats.filter((c: any) => dead(c.menu)).map((c: any) => ({ id: c.id, name: c.name, restaurantId: c.restaurantId })),
  };
}

/**
 * Live equivalents for stale refs on the SERVED menu. Collision-safe
 * (2026-07-05 adversarial review): two live dishes CAN share a lineageId
 * (duplicate-category / duplicate-of-duplicate keep the source's lineage), so
 * a naive Map pick was nondeterministic and could crown a hidden twin.
 * Rules: hidden dishes/categories never qualify; on collision prefer the
 * name-equal twin(s), else take ALL visible twins (deterministic, additive —
 * the promo covers both rather than arbitrarily one). Category name-mapping
 * only within the SAME restaurant (a customized brand child must not adopt
 * the parent's category names into its own different-content categories).
 */
async function buildPromoLiveAdds(
  menuOwnerId: string,
  servedMenuId: string | null,
  staleItems: { id: string; name: string; lineageId: string | null }[],
  staleCats: { id: string; name: string; restaurantId: string }[],
): Promise<{ itemAdd: Map<string, string[]>; catAdd: Map<string, string[]> }> {
  const itemAdd = new Map<string, string[]>();
  const catAdd = new Map<string, string[]>();
  if (!servedMenuId) return { itemAdd, catAdd }; // nothing is served — nothing to add
  const norm = (s: string) => s.trim().toLowerCase();
  const staleLineages = [...new Set(staleItems.map((i) => i.lineageId ?? i.id))];
  const wantCatNames = [...new Set(staleCats.filter((c) => c.restaurantId === menuOwnerId).map((c) => norm(c.name)))];
  const [liveMatches, liveCats] = await Promise.all([
    staleLineages.length
      ? prisma.menuItem.findMany({
          where: { restaurantId: menuOwnerId, lineageId: { in: staleLineages }, isHidden: false, category: { menuId: servedMenuId } },
          select: { id: true, name: true, lineageId: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as any[]),
    wantCatNames.length
      ? prisma.menuCategory.findMany({
          where: { restaurantId: menuOwnerId, menuId: servedMenuId, isActive: true, isHidden: false },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as any[]),
  ]);
  const byLineage = new Map<string, { id: string; name: string }[]>();
  for (const i of liveMatches) {
    const k = (i.lineageId ?? i.id) as string;
    (byLineage.get(k) ?? byLineage.set(k, []).get(k)!).push({ id: i.id, name: i.name });
  }
  for (const s of staleItems) {
    const candidates = byLineage.get((s.lineageId ?? s.id) as string) ?? [];
    if (candidates.length === 0) continue;
    const nameEq = candidates.filter((c) => norm(c.name) === norm(s.name));
    const winners = (nameEq.length > 0 ? nameEq : candidates).map((c) => c.id).filter((id) => id !== s.id);
    if (winners.length) itemAdd.set(s.id, winners);
  }
  const byCatName = new Map<string, string[]>();
  for (const c of liveCats) {
    const k = norm(c.name);
    (byCatName.get(k) ?? byCatName.set(k, []).get(k)!).push(c.id);
  }
  for (const s of staleCats) {
    if (s.restaurantId !== menuOwnerId) continue;
    const ids = (byCatName.get(norm(s.name)) ?? []).filter((id) => id !== s.id);
    if (ids.length) catAdd.set(s.id, ids);
  }
  return { itemAdd, catAdd };
}

// 30s memo of classification+adds per (menu owner, ref-set) — the resolver
// runs on every order-page render and checkout compute, and a restaurant with
// a stale promo would otherwise pay 3 extra queries per request forever.
// Prod-only: dev/test flips menus and expects instant effect. A 30s lag after
// a menu edit is fine (menus change rarely; promos re-resolve on expiry).
const RESOLVE_CACHE = new Map<string, { exp: number; itemAdd: Map<string, string[]>; catAdd: Map<string, string[]> }>();
const RESOLVE_CACHE_ON = process.env.NODE_ENV === "production";

export async function resolvePromoMenuRefsForServing<
  T extends { ruleConfig?: unknown; rules?: string | null },
>(restaurantId: string, promos: T[]): Promise<T[]> {
  try {
    if (!promos.length) return promos;

    const groupsOf = promoGroupsOf;
    const parseRc = parsePromoRc;

    // 1. Collect every referenced id across the pool.
    const itemRefs = new Set<string>();
    const catRefs = new Set<string>();
    for (const p of promos) {
      const rc = parseRc(p);
      if (!rc) continue;
      for (const g of groupsOf(rc)) {
        for (const id of [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])]) itemRefs.add(String(id));
        for (const id of g.categoryIds ?? []) catRefs.add(String(id));
      }
    }
    if (itemRefs.size === 0 && catRefs.size === 0) return promos;

    // 2+3. Classify refs against the SERVED menu and build collision-safe
    //      live additions (see classifyPromoRefs/buildPromoLiveAdds above).
    //      Brand children display the parent's menu — resolve on the owner.
    const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
    const cacheKey = `${menuOwnerId}|${[...itemRefs].sort().join(",")}|${[...catRefs].sort().join(",")}`;
    let itemAdd: Map<string, string[]>;
    let catAdd: Map<string, string[]>;
    const hit = RESOLVE_CACHE_ON ? RESOLVE_CACHE.get(cacheKey) : undefined;
    if (hit && hit.exp > Date.now()) {
      ({ itemAdd, catAdd } = hit);
    } else {
      const cls = await classifyPromoRefs(menuOwnerId, itemRefs, catRefs);
      if (cls.staleItems.length === 0 && cls.staleCats.length === 0) {
        if (RESOLVE_CACHE_ON) RESOLVE_CACHE.set(cacheKey, { exp: Date.now() + 30_000, itemAdd: new Map(), catAdd: new Map() });
        return promos;
      }
      ({ itemAdd, catAdd } = await buildPromoLiveAdds(menuOwnerId, cls.servedMenuId, cls.staleItems, cls.staleCats));
      if (RESOLVE_CACHE_ON) {
        RESOLVE_CACHE.set(cacheKey, { exp: Date.now() + 30_000, itemAdd, catAdd });
        // Bounded: drop expired entries opportunistically so it can't grow forever.
        if (RESOLVE_CACHE.size > 500) for (const [k, v] of RESOLVE_CACHE) if (v.exp <= Date.now()) RESOLVE_CACHE.delete(k);
      }
    }
    if (itemAdd.size === 0 && catAdd.size === 0) return promos;

    // 4. Rebuild affected promos with UNIONed refs (originals + live ids).
    const withAdds = (ids: unknown, add: Map<string, string[]>): string[] => {
      const arr = Array.isArray(ids) ? ids.map(String) : [];
      const out = new Set<string>(arr);
      for (const id of arr) for (const live of add.get(id) ?? []) out.add(live);
      return [...out];
    };
    return promos.map((p) => {
      const rc = parseRc(p);
      if (!rc) return p;
      let touched = false;
      const clone = JSON.parse(JSON.stringify(rc));
      for (const g of groupsOf(clone)) {
        if (Array.isArray(g.itemIds) && g.itemIds.some((id: string) => itemAdd.has(String(id)))) { g.itemIds = withAdds(g.itemIds, itemAdd); touched = true; }
        if (Array.isArray(g.menuItemIds) && g.menuItemIds.some((id: string) => itemAdd.has(String(id)))) { g.menuItemIds = withAdds(g.menuItemIds, itemAdd); touched = true; }
        if (Array.isArray(g.categoryIds) && g.categoryIds.some((id: string) => catAdd.has(String(id)))) { g.categoryIds = withAdds(g.categoryIds, catAdd); touched = true; }
      }
      return touched ? ({ ...p, ruleConfig: clone } as T) : p;
    });
  } catch (e) {
    console.error("[menu] resolvePromoMenuRefsForServing failed — serving promos unresolved", e);
    return promos;
  }
}

/**
 * Which promotions reference ANY of the given item/category ids in their
 * which-dishes groups. Drives the delete-time guard (Luigi 2026-07-05):
 * deleting a dish that a promo targets silently breaks the promo — a deleted
 * dish has no lineage twin anywhere, so nothing can ever rescue it. Active
 * promos first, then by name, so the warning reads sensibly.
 */
export async function promosReferencing(
  restaurantId: string,
  refs: { itemIds?: string[]; categoryIds?: string[] },
): Promise<{ id: string; name: string; isActive: boolean }[]> {
  const wantItems = new Set(refs.itemIds ?? []);
  const wantCats = new Set(refs.categoryIds ?? []);
  if (wantItems.size === 0 && wantCats.size === 0) return [];
  const promos = await prisma.promotion.findMany({
    where: { restaurantId },
    select: { id: true, name: true, isActive: true, ruleConfig: true, rules: true },
  });
  const hits: { id: string; name: string; isActive: boolean }[] = [];
  for (const p of promos) {
    const rc = parsePromoRc(p);
    if (!rc) continue;
    let referenced = false;
    for (const g of promoGroupsOf(rc)) {
      for (const id of [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])]) if (wantItems.has(String(id))) { referenced = true; break; }
      if (!referenced) for (const id of g.categoryIds ?? []) if (wantCats.has(String(id))) { referenced = true; break; }
      if (referenced) break;
    }
    if (referenced) hits.push({ id: p.id, name: p.name, isActive: p.isActive });
  }
  return hits.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.name.localeCompare(b.name));
}

/**
 * Promos whose which-dishes config is DEAD: some ref-bearing group has ZERO
 * refs that exist on the served menu, even after lineage resolution — e.g. a
 * bundle slot whose only dish was deleted. Such a promo is unfulfillable and
 * shows customers a dead-end ("No eligible items"), so the order page
 * quarantines it (nothing is written — fix the picks and it self-heals) and
 * the admin list badges it. Existence check only: hidden/sold-out are
 * temporary states and deliberately still count as live (they self-resolve;
 * quarantining on them would flap with visibility schedules). Fail-soft to
 * "nothing dead". Callers pass ALREADY-RESOLVED promos (post
 * resolvePromoMenuRefsForServing) so lineage rescues count.
 */
export async function findDeadPromoIds<
  T extends { id: string; ruleConfig?: unknown; rules?: string | null },
>(restaurantId: string, resolvedPromos: T[]): Promise<Set<string>> {
  const dead = new Set<string>();
  try {
    const itemRefs = new Set<string>();
    const catRefs = new Set<string>();
    type Group = { items: string[]; cats: string[] };
    const perPromo = new Map<string, Group[]>();
    for (const p of resolvedPromos) {
      const rc = parsePromoRc(p);
      if (!rc) continue;
      const groups: Group[] = [];
      for (const g of promoGroupsOf(rc)) {
        const items: string[] = [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])].map(String);
        const cats: string[] = (g.categoryIds ?? []).map(String);
        if (items.length === 0 && cats.length === 0) continue; // "any dish" group — never dead
        items.forEach((id) => itemRefs.add(id));
        cats.forEach((id) => catRefs.add(id));
        groups.push({ items, cats });
      }
      if (groups.length) perPromo.set(p.id, groups);
    }
    if (perPromo.size === 0) return dead;

    const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
    const servedMenuId = await resolveScheduledMenuId(menuOwnerId);
    const [liveItems, liveCats] = await Promise.all([
      itemRefs.size
        ? prisma.menuItem.findMany({
            where: { id: { in: [...itemRefs] }, OR: [{ category: { menuId: servedMenuId } }, { category: { menuId: null } }] },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
      catRefs.size
        ? prisma.menuCategory.findMany({
            where: { id: { in: [...catRefs] }, OR: [{ menuId: servedMenuId }, { menuId: null }] },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);
    const liveItemIds = new Set(liveItems.map((i) => i.id));
    const liveCatIds = new Set(liveCats.map((c) => c.id));
    for (const [promoId, groups] of perPromo) {
      const broken = groups.some(
        (g) => !g.items.some((id) => liveItemIds.has(id)) && !g.cats.some((id) => liveCatIds.has(id)),
      );
      if (broken) dead.add(promoId);
    }
  } catch (e) {
    console.error("[menu] findDeadPromoIds failed — treating all promos as servable", e);
  }
  return dead;
}

/**
 * Admin-facing companion to the serve-time resolver (Luigi 2026-07-05):
 * for ONE promo, report whether any of its dish/category picks live on an
 * INACTIVE menu, and — if so — the names of what the promo actually targets
 * on the current live menu after lineage resolution. Drives the amber
 * "built on a menu that's no longer live" notice in the promo editor, so
 * the owner can SEE what a stale promo resolves to without test-ordering.
 * Read-only; fail-soft to "not stale" (the notice is informational).
 */
export async function describePromoLiveTargets(
  restaurantId: string,
  promo: { ruleConfig?: unknown; rules?: string | null },
): Promise<{ stale: boolean; liveTargetNames: string[]; totalLive: number }> {
  const NONE = { stale: false, liveTargetNames: [], totalLive: 0 };
  try {
    const rc = parsePromoRc(promo);
    if (!rc) return NONE;
    const itemRefs = new Set<string>();
    const catRefs = new Set<string>();
    for (const g of promoGroupsOf(rc)) {
      for (const id of [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])]) itemRefs.add(String(id));
      for (const id of g.categoryIds ?? []) catRefs.add(String(id));
    }
    if (itemRefs.size === 0 && catRefs.size === 0) return NONE;

    // Same staleness rule as serving (dead menus only, vs the SERVED menu) —
    // a day-parted alternate menu must NOT trigger the notice.
    const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
    const cls = await classifyPromoRefs(menuOwnerId, itemRefs, catRefs);
    if (cls.staleItems.length === 0 && cls.staleCats.length === 0) return NONE;
    const servedMenuId = cls.servedMenuId;

    // Resolve exactly the way serving does, then name everything that is
    // actually LIVE in the resolved config (originals still live + lineage
    // additions) — that's what the promo targets on the customer page today.
    const [resolved] = await resolvePromoMenuRefsForServing(restaurantId, [promo]);
    const rc2 = parsePromoRc(resolved) ?? rc;
    const rItems = new Set<string>();
    const rCats = new Set<string>();
    for (const g of promoGroupsOf(rc2)) {
      for (const id of [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])]) rItems.add(String(id));
      for (const id of g.categoryIds ?? []) rCats.add(String(id));
    }
    const [liveItems, liveCats] = await Promise.all([
      rItems.size
        ? prisma.menuItem.findMany({
            where: { id: { in: [...rItems] } },
            select: { name: true, category: { select: { menuId: true } } },
          })
        : Promise.resolve([] as any[]),
      rCats.size
        ? prisma.menuCategory.findMany({
            where: { id: { in: [...rCats] } },
            select: { name: true, menuId: true },
          })
        : Promise.resolve([] as any[]),
    ]);
    // "Targets on the live menu" = refs on the SERVED menu (legacy null-menu
    // rows count as always-served).
    const names = [
      ...liveCats.filter((c: any) => c.menuId == null || c.menuId === servedMenuId).map((c: any) => c.name as string),
      ...liveItems.filter((i: any) => i.category?.menuId == null || i.category?.menuId === servedMenuId).map((i: any) => i.name as string),
    ];
    const dedup = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    return { stale: true, liveTargetNames: dedup.slice(0, 12), totalLive: dedup.length };
  } catch (e) {
    console.error("[menu] describePromoLiveTargets failed — hiding notice", e);
    return NONE;
  }
}

/**
 * Deep-clone an entire menu (every category, item, variant, and category-/
 * item-/variant-level modifier group) into a NEW draft menu (isActive=false).
 * Items keep their `lineageId` so promotions can be remapped across versions.
 * Mirrors the category-duplicate clone exactly. Returns the new menu id.
 */
export async function duplicateMenu(restaurantId: string, sourceMenuId: string, name: string): Promise<string> {
  const cats = await prisma.menuCategory.findMany({
    where: { menuId: sourceMenuId, restaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      // Category-level modifier groups (menuItemId null).
      modifierGroups: { where: { menuItemId: null }, include: { options: true } },
      menuItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          variants: true,
          // Item-/variant-level modifier groups (menuItemId set).
          modifierGroups: { include: { options: true } },
        },
      },
    },
  });

  return prisma.$transaction(async (tx) => {
    const sortAgg = await tx.menu.aggregate({ where: { restaurantId }, _max: { sortOrder: true } });
    const menu = await tx.menu.create({
      data: { restaurantId, name: name.slice(0, 80) || "Menu copy", isActive: false, sortOrder: (sortAgg._max.sortOrder ?? 0) + 1 },
    });

    for (const c of cats) {
      const newCat = await tx.menuCategory.create({
        data: {
          restaurantId, menuId: menu.id, name: c.name, description: c.description, imageUrl: c.imageUrl,
          isActive: c.isActive, isHidden: c.isHidden, isCatering: c.isCatering, sortOrder: c.sortOrder,
        },
      });
      // Category-level modifier groups.
      for (const g of c.modifierGroups) {
        await tx.modifierGroup.create({
          data: {
            restaurantId: g.restaurantId, categoryId: newCat.id, name: g.name, description: g.description,
            required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption,
            isHidden: g.isHidden, sortOrder: g.sortOrder, libraryGroupId: g.libraryGroupId, supportsHalfHalf: g.supportsHalfHalf,
            options: { create: g.options.map((o) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder })) },
          },
        });
      }
      // Items + variants + item/variant-level modifier groups.
      for (const item of c.menuItems) {
        const newItem = await tx.menuItem.create({
          data: {
            restaurantId, categoryId: newCat.id, lineageId: item.lineageId ?? item.id,
            name: item.name, description: item.description, price: item.price, imageUrl: item.imageUrl,
            isAvailable: item.isAvailable, isFeatured: item.isFeatured, isSoldOut: item.isSoldOut, isHidden: item.isHidden,
            hasVariants: item.hasVariants, forPickup: item.forPickup, forDelivery: item.forDelivery, isCatering: item.isCatering,
            availableDays: item.availableDays, availableFrom: item.availableFrom, availableTo: item.availableTo,
            availabilityMode: item.availabilityMode,
            sortOrder: item.sortOrder, calories: item.calories, allergens: item.allergens, pizzaConfig: item.pizzaConfig,
            comboConfig: item.comboConfig,
          },
        });
        const variantIdMap = new Map<string, string>();
        for (const v of item.variants) {
          const nv = await tx.itemVariant.create({ data: { menuItemId: newItem.id, name: v.name, price: v.price, sortOrder: v.sortOrder, isDefault: v.isDefault } });
          variantIdMap.set(v.id, nv.id);
        }
        for (const g of item.modifierGroups) {
          await tx.modifierGroup.create({
            data: {
              restaurantId: g.restaurantId, menuItemId: newItem.id,
              variantId: g.variantId ? variantIdMap.get(g.variantId) ?? null : null,
              name: g.name, description: g.description, required: g.required, minSelect: g.minSelect,
              maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, isHidden: g.isHidden, sortOrder: g.sortOrder,
              libraryGroupId: g.libraryGroupId, supportsHalfHalf: g.supportsHalfHalf,
              options: { create: g.options.map((o) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder })) },
            },
          });
        }
      }
    }
    return menu.id;
  }, { timeout: 30_000 });
}

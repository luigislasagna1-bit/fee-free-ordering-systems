/**
 * GloriaFood / FoodBooking menu importer.
 *
 * GloriaFood (and its white-label resellers like "Sams Restaurant
 * Systems") expose every restaurant's menu through a public JSON
 * endpoint on the restaurant's branded ordering domain:
 *
 *   GET https://<branded-domain>/api/restaurant/<restaurant_uid>/menu
 *
 * The endpoint is the same one the customer-facing ordering widget
 * fetches before rendering the menu — so what we read is exactly what
 * customers see. No auth needed beyond the standard Origin/Referer
 * headers a normal browser sends.
 *
 * Legal posture: we only call this with the restaurant's own
 * restaurant_uid + branded domain (the restaurant pastes their own
 * embed snippet or URL into our import wizard). We're acting on the
 * restaurant's behalf to migrate THEIR data — same legal foundation
 * as Toast/Square OAuth imports, just without the OAuth step because
 * the endpoint is public-readable.
 *
 * Verified working 2026-05-30 against Luigi's Lasagna & Pizzeria
 * (Sams reseller): 13 categories, 186 items, 219 size variants, 501
 * modifier groups, 12,653 modifier options, fetched in 1.2 s.
 */

// ────────────────────────────────────────────────────────────────────
// GloriaFood JSON shape (subset we care about)
// ────────────────────────────────────────────────────────────────────

export interface GFMenu {
  id: number;
  name: string;
  description: string | null;
  currency: string;
  default_language: string;
  categories: GFCategory[];
}

export interface GFCategory {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  active_begin: string | null;
  active_end: string | null;
  active_days: number; // bitmask, 127 = all days
  sort: number;
  hidden_until: string | null;
  active_exact_from: string | null;
  active_exact_until: string | null;
  items: GFItem[];
  groups: GFGroup[]; // category-level modifier groups (shared across items)
}

export interface GFItem {
  id: number;
  menu_category_id: number;
  name: string;
  description: string | null;
  price: number; // base price; final per-variant = item.price + size.price
  active: boolean;
  active_begin: string | null;
  active_end: string | null;
  active_days: number;
  sort: number;
  tags: string | null;
  hidden_until: string | null;
  active_exact_from: string | null;
  active_exact_until: string | null;
  ingredients: string | null;
  additives: string | null;
  sizes: GFSize[];
  groups: GFGroup[]; // item-level modifier groups
  is_out_of_stock?: boolean;
}

export interface GFSize {
  id: number;
  menu_item_id: number;
  name: string;
  price: number; // DELTA added to item.price; the smallest size is usually 0
  default: boolean;
  groups: GFGroup[]; // variant-level modifier groups (e.g. "Toppings (Large)")
}

export interface GFGroup {
  id: number;
  menu_id: number;
  name: string;
  sort: number;
  required: boolean;
  force_min: number;
  force_max: number;
  allow_quantity: boolean;
  major_group_id: number | null;
  options: GFOption[];
}

export interface GFOption {
  id: number;
  option_group_id: number;
  name: string;
  price: number;
  default: boolean;
  sort: number;
  is_out_of_stock?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// FFOS-shaped preview (what we hand to the admin UI for confirm)
// ────────────────────────────────────────────────────────────────────

export interface ImportPreview {
  source: "gloriafood";
  sourceMenuId: number;
  sourceMenuName: string;
  currency: string;
  /** Locale-style hint for the default language (e.g. "en", "fr"). */
  defaultLanguage: string;
  stats: ImportStats;
  categories: PreviewCategory[];
  /**
   * Modifier groups that live at the category level in GloriaFood
   * (shared across multiple items in a category). FFOS supports this
   * via ModifierGroup.categoryId, so we emit them as separate rows
   * the UI can show "shared across N items in this category."
   */
  categoryGroups: PreviewCategoryGroup[];
}

export interface ImportStats {
  categories: number;
  items: number;
  variants: number;
  modifierGroups: number;
  modifierOptions: number;
  skippedInactive: number;
  skippedHidden: number;
}

export interface PreviewCategory {
  sourceId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isHidden: boolean;
  /** Source image URL on the FoodBooking CDN (high-density variant).
   *  Resolved from the restaurant endpoint's pictures map at preview
   *  time. The commit step downloads from this URL and re-hosts on
   *  Vercel Blob so we never link directly to FoodBooking's CDN. */
  sourceImageUrl: string | null;
  items: PreviewItem[];
}

export interface PreviewCategoryGroup {
  sourceId: number;
  sourceCategoryId: number;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  maxPerOption: number;
  sortOrder: number;
  options: PreviewOption[];
}

export interface PreviewItem {
  sourceId: number;
  name: string;
  description: string | null;
  /** Source image URL on FoodBooking's CDN — see PreviewCategory.sourceImageUrl. */
  sourceImageUrl: string | null;
  /** Base price — what the item sells for when there are no size
   *  variants. When variants exist this equals the price of the
   *  default variant (= item.price + default_size.price). */
  basePrice: number;
  isAvailable: boolean;
  isHidden: boolean;
  isSoldOut: boolean;
  hasVariants: boolean;
  sortOrder: number;
  /** JSON-string-encoded array of weekday indices (Sun=0…Sat=6) the item is
   *  orderable, or null when orderable all week. Lands in MenuItem.fulfilDays —
   *  the per-item "Availability" (Fulfilment Time) the admin modal actually
   *  manages — so an imported day-special is editable + enforced exactly like a
   *  hand-set one (the legacy `availableDays` has no editor; Fabrizio 2026-06-21). */
  fulfilDays: string | null;
  variants: PreviewVariant[];
  /** Item-level modifier groups (apply when no variant is selected
   *  or to all variants — UI shows these as "applies to whole item"). */
  itemGroups: PreviewGroup[];
}

export interface PreviewVariant {
  sourceId: number;
  name: string;
  price: number; // final absolute price (item.price + size.price)
  isDefault: boolean;
  /** Modifier groups specific to this variant ("Extra Toppings (Large)"
   *  is a different group than "Extra Toppings (Small)" in GloriaFood
   *  because pricing per topping varies by pie size). */
  groups: PreviewGroup[];
}

export interface PreviewGroup {
  sourceId: number;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  maxPerOption: number;
  sortOrder: number;
  options: PreviewOption[];
}

export interface PreviewOption {
  sourceId: number;
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

// ────────────────────────────────────────────────────────────────────
// URL / embed-snippet parsing
// ────────────────────────────────────────────────────────────────────

export interface ParsedSource {
  /** restaurant_uid (UUID) — required to hit the menu endpoint. */
  restaurantUid: string;
  /** Optional company_uid — not currently used by /api/restaurant/<uid>/menu
   *  but kept for future endpoints (reservations, order placement). */
  companyUid: string | null;
  /** Branded domain to hit (e.g. luigislasagnamilton.ca). When the
   *  user only pastes UIDs without a domain we fall back to
   *  www.gloriafood.com. */
  brandedDomain: string;
}

/**
 * Accepts anything the restaurant might paste:
 *   • Full embed snippet (<span class="glf-button" data-glf-cuid="..." data-glf-ruid="..."> + script tag)
 *   • Just the restaurant URL (https://www.<their-domain>.ca/ordering/restaurant/menu?restaurant_uid=...)
 *   • Just the restaurant UID (UUID alone)
 * Throws Error with a friendly message when nothing recognisable is found.
 */
export function parseSource(input: string): ParsedSource {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste your GloriaFood embed snippet, ordering URL, or restaurant UID.");

  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // 1) Try as URL (with restaurant_uid query param)
  let brandedDomain = "www.gloriafood.com";
  let restaurantUid: string | null = null;
  let companyUid: string | null = null;

  const urlMatches = trimmed.match(/https?:\/\/[a-zA-Z0-9.-]+(?:\/[^\s"'<>]*)?/g) ?? [];
  for (const raw of urlMatches) {
    try {
      const u = new URL(raw);
      const r = u.searchParams.get("restaurant_uid");
      const c = u.searchParams.get("company_uid");
      if (r && UUID.test(r)) {
        restaurantUid = r;
        brandedDomain = u.hostname;
      }
      if (c && UUID.test(c)) companyUid = c;
    } catch { /* ignore — keep scanning */ }
  }

  // 2) Embed-snippet style — data-glf-ruid / data-glf-cuid
  // Accept single OR double quotes — pasted snippets come both ways, and the
  // ruid attr MUST win over the plain-UUID fallback below (which would grab the
  // cuid, since it appears first → "account deleted" 404). Verified 2026-06-17.
  const ruidAttr = trimmed.match(/data-glf-ruid\s*=\s*["']([^"']+)["']/i)?.[1];
  const cuidAttr = trimmed.match(/data-glf-cuid\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!restaurantUid && ruidAttr && UUID.test(ruidAttr)) restaurantUid = ruidAttr;
  if (!companyUid && cuidAttr && UUID.test(cuidAttr)) companyUid = cuidAttr;

  // 3) Plain UUID — last resort
  if (!restaurantUid) {
    const m = trimmed.match(UUID);
    if (m) restaurantUid = m[0];
  }

  if (!restaurantUid) {
    throw new Error(
      "Couldn't find a restaurant UID. Paste the embed snippet from your GloriaFood admin (Publish → Ordering Button), or the URL of your ordering page.",
    );
  }

  return { restaurantUid, companyUid, brandedDomain };
}

/** True for hosts owned by GloriaFood / FoodBooking. The menu + picture fetch
 *  hits `https://<brandedDomain>/...` where brandedDomain is taken from the
 *  user's pasted URL (parseSource). Behind admin auth that's fine, but for the
 *  UNAUTHENTICATED public import it's an SSRF vector — so the public endpoint
 *  MUST clamp the host with clampToGloriaFoodHost() below. */
export function isGloriaFoodHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "gloriafood.com" || h.endsWith(".gloriafood.com") ||
    h === "foodbooking.com" || h.endsWith(".foodbooking.com") ||
    h === "fbgcdn.com" || h.endsWith(".fbgcdn.com")
  );
}

/** Clamp a parsed source to a SAFE GloriaFood host for public/unauthenticated
 *  imports. A non-GloriaFood brandedDomain (e.g. a crafted URL pointing at an
 *  internal IP) is replaced with the canonical www.gloriafood.com — the API
 *  serves any restaurant by UID, so we keep functionality while making it
 *  impossible to fetch an arbitrary/internal host. */
export function clampToGloriaFoodHost(src: ParsedSource): ParsedSource {
  return isGloriaFoodHost(src.brandedDomain) ? src : { ...src, brandedDomain: "www.gloriafood.com" };
}

// ────────────────────────────────────────────────────────────────────
// Network — fetch menu JSON
// ────────────────────────────────────────────────────────────────────

export async function fetchGloriaFoodMenu(src: ParsedSource): Promise<GFMenu> {
  return fetchGF<GFMenu>(src, `/api/restaurant/${src.restaurantUid}/menu`, "menu");
}

/**
 * Picture lookup table built from the restaurant endpoint. Keys are
 * `{thumbnail_type}-{entity_id}` (e.g. "menu_item-12345"). Values are
 * the absolute URL to the high-density (d2) image on FoodBooking's CDN.
 * Returns an empty map if the endpoint refuses or the response shape
 * is unexpected — we degrade to "no image import" rather than fail
 * the whole import.
 */
export async function fetchGloriaFoodPictures(src: ParsedSource): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rest = await fetchGF<{ pictures?: Record<string, GFPicture> }>(
      src,
      `/api/restaurant/${src.restaurantUid}`,
      "restaurant",
    );
    const pics = rest.pictures ?? {};
    for (const entry of Object.values(pics)) {
      if (!entry?.filename || typeof entry.filename !== "string") continue;
      // Use the PLAIN {filename}.jpg variant — it exists for 100% of photos.
      // The _d2 (high-density/retina) variant is only generated for a MINORITY
      // (~25%); the rest 404, which silently lost ~75% of every menu's photos
      // (only 24/202 landed). Standard density is fine for menu cards/thumbs.
      // Verified 2026-06-17 against Fabrizio's menu: plain 20/20, _d2 5/20.
      const stem = entry.filename.replace(/\.jpg$/i, "");
      const url = `https://www.fbgcdn.com/pictures/${stem}.jpg`;
      const key = `${entry.thumbnail_type}-${entry.entity_id}`;
      map.set(key, url);
    }
  } catch (e) {
    // Don't let a broken pictures endpoint poison the whole import.
    console.warn("[gloriafood import] picture lookup failed:", e instanceof Error ? e.message : String(e));
  }
  return map;
}

interface GFPicture {
  filename: string;
  thumbnail_type: string;
  entity_id: number;
  picture_id?: number;
}

async function fetchGF<T>(src: ParsedSource, path: string, label: string): Promise<T> {
  const url = `https://${src.brandedDomain}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Origin: `https://${src.brandedDomain}`,
      Referer: `https://${src.brandedDomain}/ordering/restaurant/menu?restaurant_uid=${src.restaurantUid}`,
      "User-Agent": "Mozilla/5.0 (compatible; FFOS-MenuImport/1.0)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GloriaFood ${label} fetch failed (HTTP ${res.status}). ${body ? `Detail: ${body.slice(0, 200)}` : ""}`.trim(),
    );
  }
  const json = (await res.json()) as T;
  if (!json || (label === "menu" && !Array.isArray((json as any).categories))) {
    throw new Error(
      `The ${label} endpoint responded but the payload didn't look right.`,
    );
  }
  return json;
}

// ────────────────────────────────────────────────────────────────────
// Mapper — GloriaFood JSON → FFOS-shaped preview
// ────────────────────────────────────────────────────────────────────

/**
 * Convert GloriaFood's `active_days` bitmask to FFOS's JSON-array weekday format.
 *
 * VERIFIED EMPIRICALLY against Luigi's real menu (2026-06-21): GloriaFood is
 * SUNDAY-first — bit 0 = Sun, bit 1 = Mon, … bit 6 = Sat. Calibrated from his
 * named day-specials: "Monday Pizza Special" = 2 (bit 1), "Tuesday" = 4 (bit 2),
 * "WING WEDNESDAYS" = 8 (bit 3), "THURSDAY Special" = 16 (bit 4), "FRIDAY" = 32
 * (bit 5). FFOS's weekday JSON (`fulfilDays`, legacy `availableDays`) uses the SAME Sunday-first indices [0..6]
 * everywhere — customer display (`Date.UTC(2021,7,1+d)`; 2021-08-01 is a Sunday)
 * AND the admin picker (`DAY_NAMES = ["Sun".."Sat"]`). So the bit i → day i map
 * below is correct end-to-end (NOT the off-by-one the old comment implied).
 *
 * Returns null for 127 (every day) or 0 (unset → no restriction = every day; the
 * common case — most of a menu carries 0). Exported for the regression test.
 */
export function bitmaskToDaysJson(mask: number): string | null {
  if (mask === 127 || mask === 0) return null;
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(i);
  }
  return days.length === 7 ? null : JSON.stringify(days);
}

function mapOption(o: GFOption): PreviewOption {
  return {
    sourceId: o.id,
    name: (o.name || "Option").slice(0, 100),
    priceAdjustment: clampMoney(o.price),
    isDefault: !!o.default,
    isAvailable: !o.is_out_of_stock,
    sortOrder: o.sort ?? 0,
  };
}

/** GloriaFood: `force_max = 0` means UNLIMITED ("pick as many as you like" —
 *  the common case for pizza topping groups). The old `Math.max(1, …)` floored
 *  that to 1, silently turning a multi-pick group into single-select. So: 0 →
 *  cap at the option count (effectively no limit within the group); a positive
 *  value is the real max; null/undefined defaults to 1. Used by BOTH the
 *  item/variant group mapper and the category-level group mapper below so they
 *  never drift. (Luigi 2026-06-21 — import-to-try correctness, pizza focus.) */
export function groupMaxSelect(g: GFGroup): number {
  if (g.force_max === 0) return Math.max(1, g.options?.length ?? 99);
  return Math.max(1, g.force_max ?? 1);
}

export function mapGroup(g: GFGroup): PreviewGroup {
  return {
    sourceId: g.id,
    name: (g.name || "Options").slice(0, 100),
    required: !!g.required,
    minSelect: Math.max(0, g.force_min ?? 0),
    // allow_quantity (pick the SAME option multiple times) → maxPerOption,
    // not an inflated maxSelect. The group's max distinct picks comes from
    // groupMaxSelect() (which handles force_max=0 = unlimited).
    maxSelect: groupMaxSelect(g),
    maxPerOption: g.allow_quantity ? 99 : 1,
    sortOrder: g.sort ?? 0,
    options: (g.options ?? []).map(mapOption),
  };
}

function mapVariant(item: GFItem, size: GFSize): PreviewVariant {
  return {
    sourceId: size.id,
    name: (size.name || "Default").slice(0, 80),
    // Final absolute price = base item price + size delta. Verified
    // against the live customer-facing widget which displays the same
    // sum.
    price: clampMoney(item.price + size.price),
    isDefault: !!size.default,
    groups: (size.groups ?? []).map(mapGroup),
  };
}

function clampMoney(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100_000) return 100_000;
  // Two decimals — GloriaFood occasionally returns 1.249999999 from FP math.
  return Math.round(v * 100) / 100;
}

export function mapMenu(menu: GFMenu, pictures?: Map<string, string>): ImportPreview {
  const stats: ImportStats = {
    categories: 0,
    items: 0,
    variants: 0,
    modifierGroups: 0,
    modifierOptions: 0,
    skippedInactive: 0,
    skippedHidden: 0,
  };

  const categoryGroups: PreviewCategoryGroup[] = [];
  const categories: PreviewCategory[] = [];

  for (const cat of menu.categories ?? []) {
    if (!cat.active) {
      stats.skippedInactive++;
      continue;
    }
    stats.categories++;
    const items: PreviewItem[] = [];

    for (const item of cat.items ?? []) {
      if (!item.active) {
        stats.skippedInactive++;
        continue;
      }
      // hidden_until in the past = currently visible. In the future
      // = currently hidden (typical seasonal item like "Heart-shaped
      // pizza available Feb 1-14"). We import them as isHidden=true
      // so the owner can flip them on when the season comes.
      const hiddenUntil = item.hidden_until ? new Date(item.hidden_until) : null;
      const isHiddenSeasonally = hiddenUntil ? hiddenUntil.getTime() > Date.now() : false;
      if (isHiddenSeasonally) stats.skippedHidden++;

      const sizes = item.sizes ?? [];
      const hasVariants = sizes.length > 0;
      // Base price = default size's final price when we have variants,
      // else item.price. FFOS displays MenuItem.price as the "from
      // X.XX" label so anchoring on the default is the right pick.
      const defaultSize = hasVariants ? (sizes.find((s) => s.default) ?? sizes[0]) : null;
      const basePrice = clampMoney(
        defaultSize ? item.price + defaultSize.price : item.price,
      );

      const variants = sizes.map((s) => mapVariant(item, s));
      stats.variants += variants.length;

      const itemGroups = (item.groups ?? []).map(mapGroup);
      stats.modifierGroups += itemGroups.length;
      stats.modifierOptions += itemGroups.reduce((s, g) => s + g.options.length, 0);
      for (const v of variants) {
        stats.modifierGroups += v.groups.length;
        stats.modifierOptions += v.groups.reduce((s, g) => s + g.options.length, 0);
      }

      // Picture lookup — pictures map keys are
      // `{thumbnail_type}-{entity_id}`. Prefer the highest-quality
      // menu-item thumbnail so the imported image looks crisp on
      // both the menu grid and the item detail modal.
      const itemImage =
        pictures?.get(`menu_item-${item.id}`) ??
        pictures?.get(`menu_item_small-${item.id}`) ??
        null;

      items.push({
        sourceId: item.id,
        name: (item.name || "Item").slice(0, 120),
        description: item.description ? item.description.slice(0, 500) : null,
        sourceImageUrl: itemImage,
        basePrice,
        isAvailable: item.active,
        isHidden: isHiddenSeasonally,
        isSoldOut: !!item.is_out_of_stock,
        hasVariants,
        sortOrder: item.sort ?? 0,
        fulfilDays: bitmaskToDaysJson(item.active_days ?? 127),
        variants,
        itemGroups,
      });
      stats.items++;
    }

    for (const g of cat.groups ?? []) {
      categoryGroups.push({
        sourceId: g.id,
        sourceCategoryId: cat.id,
        name: (g.name || "Options").slice(0, 100),
        required: !!g.required,
        minSelect: Math.max(0, g.force_min ?? 0),
        maxSelect: groupMaxSelect(g),
        maxPerOption: g.allow_quantity ? 99 : 1,
        sortOrder: g.sort ?? 0,
        options: (g.options ?? []).map(mapOption),
      });
      stats.modifierGroups++;
      stats.modifierOptions += (g.options ?? []).length;
    }

    const categoryImage =
      pictures?.get(`category-${cat.id}`) ??
      pictures?.get(`category_small-${cat.id}`) ??
      pictures?.get(`category_selector-${cat.id}`) ??
      null;

    categories.push({
      sourceId: cat.id,
      name: (cat.name || "Menu").slice(0, 60),
      description: cat.description ? cat.description.slice(0, 500) : null,
      sourceImageUrl: categoryImage,
      sortOrder: cat.sort ?? 0,
      isActive: cat.active,
      isHidden: false,
      items,
    });
  }

  return {
    source: "gloriafood",
    sourceMenuId: menu.id,
    sourceMenuName: menu.name,
    currency: menu.currency || "CAD",
    defaultLanguage: menu.default_language || "en",
    stats,
    categories,
    categoryGroups,
  };
}

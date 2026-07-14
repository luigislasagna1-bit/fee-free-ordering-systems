/**
 * Uber Eats menu importer.
 *
 * Uber Eats renders its storefront from a structured JSON API — the same
 * endpoints the web ordering page calls — so, exactly like the GloriaFood
 * importer, we read the menu as data rather than scraping HTML:
 *
 *   POST https://www.ubereats.com/api/getStoreV1?localeCode=<cc>
 *        { storeUuid, diningMode:"PICKUP", time:{asap:true} }
 *     → store info + sections/subsections + every item (title, description,
 *       price in CENTS, section/subsection uuids, imageUrl, hasCustomizations).
 *
 *   POST https://www.ubereats.com/api/getMenuItemV1?localeCode=<cc>
 *        { itemRequestType:"ITEM", storeUuid, sectionUuid, subsectionUuid, menuItemUuid }
 *     → that item's customizationsList (modifier groups: title + min/maxPermitted,
 *       options with prices, nested childCustomizationList for combos).
 *
 * getStoreV1 carries item prices + photos but NOT modifiers (Uber loads those on
 * item click), so we fetch getMenuItemV1 only for the items whose
 * `hasCustomizations` flag is set. Verified 2026-07-14 against Koozina
 * Mediterranean (Milton): 10 categories, 71 items, photos on the 5 items Uber
 * has images for, modifier groups with correct min/max + option prices.
 *
 * Output is the SAME `ImportPreview` shape the GloriaFood importer emits, so the
 * whole downstream `mapMenu → commitSandboxMenu / admin apply` pipeline is reused
 * untouched. Uber has no separate "size" concept (sizes are just a required
 * single-select modifier group) and no category-level shared groups, so every
 * Uber customization lands as an item-level group; `variants` and
 * `categoryGroups` are always empty.
 *
 * Legal posture mirrors GloriaFood: we act on the restaurant's behalf to migrate
 * THEIR OWN listing, pasted by them into the import wizard. The host is fixed
 * (www.ubereats.com) and the only user input is the store UUID (a query param,
 * not a URL), so there is no SSRF surface — no host clamp needed.
 */

import type {
  ImportPreview,
  ImportStats,
  PreviewCategory,
  PreviewItem,
  PreviewGroup,
  PreviewOption,
} from "./gloriafood";

// ────────────────────────────────────────────────────────────────────
// Source parsing — pull the store UUID out of whatever the user pastes
// ────────────────────────────────────────────────────────────────────

export interface UberSource {
  /** Canonical store UUID (037fb8a9-fa88-516a-93c6-07075223dba7). */
  storeUuid: string;
  /** Uber locale/country code from the URL path (/ca/, /us/…). Defaults "ca". */
  localeCode: string;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Decode Uber's base64url store token (the last path segment of a store URL,
 *  e.g. "A3-4qfqIUWqTxgcHUiPbpw") into a canonical UUID. Returns null if it
 *  isn't a 16-byte token. */
export function decodeUberStoreToken(token: string): string | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const buf = Buffer.from(pad, "base64");
    if (buf.length !== 16) return null;
    const h = buf.toString("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  } catch {
    return null;
  }
}

/**
 * Accepts anything the restaurant might paste:
 *   • Full Uber Eats store URL: https://www.ubereats.com/ca/store/koozina/A3-4qfqIUWqTxgcHUiPbpw?...
 *   • A raw store UUID
 * Throws a friendly Error when no store id can be found.
 */
export function parseUberSource(input: string): UberSource {
  const trimmed = (input || "").trim();
  if (!trimmed) throw new Error("Paste your Uber Eats store link.");

  let localeCode = "ca";

  // Try as a URL first — grab the locale segment + the store token.
  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/)?.[0];
  if (urlMatch) {
    try {
      const u = new URL(urlMatch);
      if (/(^|\.)ubereats\.com$/i.test(u.hostname)) {
        const parts = u.pathname.split("/").filter(Boolean); // ["ca","store","koozina","<token>"]
        const locale = parts[0];
        if (locale && /^[a-z]{2}$/i.test(locale)) localeCode = locale.toLowerCase();
        const storeIdx = parts.indexOf("store");
        const token = storeIdx >= 0 ? parts[storeIdx + 2] : undefined; // slug is +1, token is +2
        if (token) {
          if (UUID_RE.test(token)) return { storeUuid: token.match(UUID_RE)![0], localeCode };
          const decoded = decodeUberStoreToken(token);
          if (decoded) return { storeUuid: decoded, localeCode };
        }
      }
    } catch {
      /* fall through to raw-uuid scan */
    }
  }

  // Raw UUID anywhere in the text.
  const raw = trimmed.match(UUID_RE)?.[0];
  if (raw) return { storeUuid: raw, localeCode };

  throw new Error(
    "Couldn't find an Uber Eats store from that link. Paste the full store URL from the Uber Eats page (the one with /store/ in it).",
  );
}

// ────────────────────────────────────────────────────────────────────
// Network
// ────────────────────────────────────────────────────────────────────

const UBER_ORIGIN = "https://www.ubereats.com";
const UBER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/** Uber has bot-challenged the request (reCAPTCHA). getStoreV1 is tolerant, but
 *  getMenuItemV1 (modifiers) challenges an over-eager datacenter IP. We surface
 *  this loudly rather than silently importing a modifier-less menu. */
export class UberBlockedError extends Error {
  constructor() {
    super("Uber Eats is temporarily blocking automated menu reads from our server. Please wait a few minutes and try again.");
    this.name = "UberBlockedError";
  }
}

/** Reduce a Set-Cookie list to a request Cookie header (name=value pairs). */
function toCookieHeader(setCookies: string[]): string {
  return setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** One Uber XHR call. Threads a cookie session through (bot defense keys on
 *  session continuity — warming from getStoreV1 makes getMenuItemV1 far more
 *  likely to pass), returns any refreshed cookie, and throws UberBlockedError on
 *  a reCAPTCHA/botdefense challenge. */
async function uberCall<T>(
  path: string,
  localeCode: string,
  body: unknown,
  cookie: string,
  label: string,
): Promise<{ data: T; cookie: string }> {
  const res = await fetch(`${UBER_ORIGIN}${path}?localeCode=${encodeURIComponent(localeCode)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      // Uber's web API requires a CSRF header on these XHR endpoints; the
      // literal "x" is what the ordering page sends for read-only calls.
      "x-csrf-token": "x",
      origin: UBER_ORIGIN,
      referer: `${UBER_ORIGIN}/`,
      "user-agent": UBER_UA,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const setCookies = typeof (res.headers as any).getSetCookie === "function" ? (res.headers as any).getSetCookie() : [];
  const nextCookie = setCookies.length ? toCookieHeader(setCookies) : cookie;
  const text = await res.text().catch(() => "");
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON (challenge HTML) */ }

  if (json?.metadata?.botdefense?.state === "challenge" || /botdefense|recaptcha|px-captcha/i.test(text)) {
    throw new UberBlockedError();
  }
  if (!res.ok) {
    throw new Error(`Uber Eats ${label} fetch failed (HTTP ${res.status}). ${text.slice(0, 160)}`.trim());
  }
  if (json?.status !== "success" || !json.data) {
    throw new Error(`Uber Eats ${label} responded but the payload didn't look right (status=${json?.status ?? "?"}).`);
  }
  return { data: json.data as T, cookie: nextCookie };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Raw Uber shapes (only the fields we read).
interface UberStoreRaw {
  title?: string;
  currencyCode?: string;
  sections?: { uuid: string; title?: string; subsectionUuids?: string[] }[];
  catalogSectionsMap?: Record<string, unknown>;
}
interface UberItemRaw {
  uuid: string;
  title?: string;
  itemDescription?: string;
  price?: number; // cents
  imageUrl?: string;
  sectionUuid: string;
  subsectionUuid: string;
  hasCustomizations?: boolean;
  isSoldOut?: boolean;
  isAvailable?: boolean;
}
interface UberCustomization {
  uuid?: string;
  title?: string;
  minPermitted?: number;
  maxPermitted?: number;
  options?: UberOption[];
}
interface UberOption {
  uuid?: string;
  title?: string;
  price?: number; // cents
  childCustomizationList?: UberCustomization[];
  quantityInfo?: { maxPermitted?: number };
}

export async function fetchUberStore(src: UberSource): Promise<UberStoreRaw> {
  const { data } = await uberCall<UberStoreRaw>(
    "/api/getStoreV1",
    src.localeCode,
    { storeUuid: src.storeUuid, diningMode: "PICKUP", time: { asap: true } },
    "",
    "store",
  );
  return data;
}

// ────────────────────────────────────────────────────────────────────
// Extraction — walk the store payload into ordered categories + items
// ────────────────────────────────────────────────────────────────────

export interface UberCategory {
  uuid: string;
  title: string;
  items: UberItemRaw[];
}

/** Pull the ordered categories (= Uber subsections) + their items out of a
 *  getStoreV1 payload. Items live scattered through `catalogSectionsMap`; each
 *  carries its subsectionUuid, and subsection titles come from the section
 *  header payloads. Deterministic + tolerant of Uber's nesting. */
export function extractUberCategories(store: UberStoreRaw): UberCategory[] {
  const csm = store.catalogSectionsMap ?? {};

  // 1. Collect every item (a node with title+price+uuid+subsectionUuid).
  const items: UberItemRaw[] = [];
  const seenItem = new Set<string>();
  // 2. Collect subsectionUuid → title from any node exposing a catalogSectionUUID + title.
  const titleByUuid = new Map<string, string>();

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) visit(v);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, any>;

    if (
      typeof o.title === "string" &&
      typeof o.uuid === "string" &&
      typeof o.subsectionUuid === "string" &&
      (typeof o.price === "number" || o.priceTagline)
    ) {
      if (!seenItem.has(o.uuid)) {
        seenItem.add(o.uuid);
        items.push(o as UberItemRaw);
      }
    }

    const cu: string | undefined = o.catalogSectionUUID;
    if (cu && !titleByUuid.has(cu)) {
      const t = findTitle(o.payload);
      if (t) titleByUuid.set(cu, t);
    }
    for (const v of Object.values(o)) visit(v);
  };
  visit(csm);

  // 3. Group items by subsection, ordered by sections[].subsectionUuids.
  const bySub = new Map<string, UberItemRaw[]>();
  for (const it of items) {
    if (!bySub.has(it.subsectionUuid)) bySub.set(it.subsectionUuid, []);
    bySub.get(it.subsectionUuid)!.push(it);
  }

  const orderedSubUuids: string[] = [];
  for (const s of store.sections ?? []) for (const su of s.subsectionUuids ?? []) orderedSubUuids.push(su);
  // Include any subsection that has items but wasn't in the section order (tail).
  for (const su of bySub.keys()) if (!orderedSubUuids.includes(su)) orderedSubUuids.push(su);

  const cats: UberCategory[] = [];
  for (const su of orderedSubUuids) {
    const its = bySub.get(su);
    if (!its || its.length === 0) continue;
    cats.push({ uuid: su, title: titleByUuid.get(su) || "Menu", items: its });
  }
  return cats;
}

/** Best-effort title extraction from a catalog-section header payload. Uber
 *  nests the visible title under a few payload keys; we scan for the first
 *  string `title` (or `title.text`). */
function findTitle(payload: unknown): string | null {
  let found: string | null = null;
  const scan = (node: unknown, depth: number): void => {
    if (found || depth > 4 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node) scan(v, depth + 1);
      return;
    }
    const o = node as Record<string, any>;
    if (typeof o.title === "string" && o.title.trim()) {
      found = o.title.trim();
      return;
    }
    if (o.title && typeof o.title === "object" && typeof o.title.text === "string" && o.title.text.trim()) {
      found = o.title.text.trim();
      return;
    }
    for (const v of Object.values(o)) scan(v, depth + 1);
  };
  scan(payload, 0);
  return found;
}

// ────────────────────────────────────────────────────────────────────
// Full fetch — store + per-item customizations
// ────────────────────────────────────────────────────────────────────

export interface UberMenu {
  title: string;
  currency: string;
  categories: {
    uuid: string;
    title: string;
    items: (UberItemRaw & { customizations: UberCustomization[] })[];
  }[];
}

/**
 * Fetch a complete Uber menu: the store payload (reliable), then getMenuItemV1
 * for every item flagged `hasCustomizations`. The item-detail endpoint is
 * bot-defended, so we go GENTLY — sequential, cookie-warmed from the store call,
 * a paced delay + one retry per item — and, crucially, we DON'T silently ship a
 * modifier-less menu: if Uber challenges us and NONE of the items with
 * customizations came back, we throw UberBlockedError so the caller can tell the
 * owner to retry. A partial success (some modifiers blocked) imports what landed
 * and is reported via `modifiersBlocked`.
 */
export async function fetchUberMenu(
  src: UberSource,
  opts: { onProgress?: (done: number, total: number) => void } = {},
): Promise<UberMenu & { modifiersFetched: number; modifiersBlocked: number; itemsWithCustomizations: number }> {
  const storeCall = await uberCall<UberStoreRaw>(
    "/api/getStoreV1",
    src.localeCode,
    { storeUuid: src.storeUuid, diningMode: "PICKUP", time: { asap: true } },
    "",
    "store",
  );
  let cookie = storeCall.cookie; // warm session → getMenuItemV1 is far likelier to pass
  const store = storeCall.data;
  const cats = extractUberCategories(store);

  const toDetail: { sectionUuid: string; subsectionUuid: string; uuid: string }[] = [];
  for (const c of cats) for (const it of c.items) if (it.hasCustomizations) toDetail.push(it);

  const customizationsByItem = new Map<string, UberCustomization[]>();
  let fetched = 0;
  let blocked = 0;
  let done = 0;

  for (const it of toDetail) {
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const r = await uberCall<{ customizationsList?: UberCustomization[] }>(
          "/api/getMenuItemV1",
          src.localeCode,
          { itemRequestType: "ITEM", storeUuid: src.storeUuid, sectionUuid: it.sectionUuid, subsectionUuid: it.subsectionUuid, menuItemUuid: it.uuid },
          cookie,
          "item",
        );
        cookie = r.cookie;
        customizationsByItem.set(it.uuid, r.data.customizationsList ?? []);
        fetched++;
        ok = true;
      } catch (e) {
        if (e instanceof UberBlockedError) {
          // Bot-challenged: once it triggers, the IP stays challenged, so stop
          // hammering — count the rest as blocked and break out.
          blocked += toDetail.length - done;
          done = toDetail.length;
          opts.onProgress?.(done, toDetail.length);
          if (fetched === 0) throw new UberBlockedError(); // total block → fail loudly
          // partial: return what we have (below)
          return buildResult();
        }
        if (attempt === 1) blocked++; // transient, gave up after retry
        else await sleep(400);
      }
    }
    done++;
    opts.onProgress?.(done, toDetail.length);
    await sleep(150); // pace — be gentle so we don't trip the bot defense
  }

  return buildResult();

  function buildResult() {
    return {
      title: store.title || "Imported menu",
      currency: store.currencyCode || "CAD",
      categories: cats.map((c) => ({
        uuid: c.uuid,
        title: c.title,
        items: c.items.map((it) => ({ ...it, customizations: customizationsByItem.get(it.uuid) ?? [] })),
      })),
      modifiersFetched: fetched,
      modifiersBlocked: blocked,
      itemsWithCustomizations: toDetail.length,
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// Mapper — UberMenu → ImportPreview (same shape as the GloriaFood importer)
// ────────────────────────────────────────────────────────────────────

function cents(v: number | undefined | null): number {
  if (!Number.isFinite(v as number) || (v as number) < 0) return 0;
  return Math.round((v as number)) / 100;
}

/** Flatten an Uber customization tree into flat PreviewGroups. Top-level groups
 *  map directly; a nested `childCustomizationList` (Uber's combo mechanism) is
 *  appended as additional groups so no options are lost. Nested groups become
 *  unconditional on the item (they can't be conditional in FFOS's flat model) —
 *  a faithful-but-flattened import the owner can fine-tune. `idGen` hands out the
 *  sequential integer sourceIds the shared preview types expect. */
function mapCustomizations(list: UberCustomization[], idGen: () => number): PreviewGroup[] {
  const groups: PreviewGroup[] = [];
  const walk = (cl: UberCustomization[]): void => {
    for (const c of cl) {
      const options = c.options ?? [];
      const min = Math.max(0, c.minPermitted ?? 0);
      const max = c.maxPermitted && c.maxPermitted > 0 ? c.maxPermitted : Math.max(1, options.length || 1);
      const group: PreviewGroup = {
        sourceId: idGen(),
        name: (c.title || "Options").slice(0, 100),
        required: min > 0,
        minSelect: min,
        maxSelect: Math.max(min, max),
        // Uber per-option repeat is exposed via quantityInfo.maxPermitted; take
        // the max across the group's options (rare; defaults to single-pick).
        maxPerOption: Math.max(1, ...options.map((o) => o.quantityInfo?.maxPermitted ?? 1)),
        sortOrder: groups.length,
        options: options.map((o): PreviewOption => ({
          sourceId: idGen(),
          name: (o.title || "Option").slice(0, 100),
          priceAdjustment: cents(o.price),
          isDefault: false,
          isAvailable: true,
          sortOrder: 0,
        })),
      };
      groups.push(group);
      // Recurse into combo children so their options are captured too.
      for (const o of options) if (o.childCustomizationList?.length) walk(o.childCustomizationList);
    }
  };
  walk(list);
  // Re-number sortOrder to final order.
  groups.forEach((g, i) => { g.sortOrder = i; g.options.forEach((o, oi) => { o.sortOrder = oi; }); });
  return groups;
}

export function mapUberMenu(menu: UberMenu): ImportPreview {
  const stats: ImportStats = {
    categories: 0, items: 0, variants: 0, modifierGroups: 0, modifierOptions: 0,
    skippedInactive: 0, skippedHidden: 0,
  };
  let nextId = 1;
  const idGen = () => nextId++;

  const categories: PreviewCategory[] = [];
  for (const c of menu.categories) {
    stats.categories++;
    const items: PreviewItem[] = [];
    c.items.forEach((it, i) => {
      const itemGroups = mapCustomizations(it.customizations ?? [], idGen);
      stats.modifierGroups += itemGroups.length;
      stats.modifierOptions += itemGroups.reduce((s, g) => s + g.options.length, 0);
      items.push({
        sourceId: idGen(),
        name: (it.title || "Item").slice(0, 120),
        description: it.itemDescription ? it.itemDescription.slice(0, 500) : null,
        sourceImageUrl: it.imageUrl && it.imageUrl.trim() ? it.imageUrl : null,
        basePrice: cents(it.price),
        isAvailable: it.isAvailable !== false,
        isHidden: false,
        isSoldOut: !!it.isSoldOut,
        hasVariants: false, // Uber models sizes as required single-select groups, not separate variants
        sortOrder: i,
        fulfilDays: null,
        variants: [],
        itemGroups,
      });
      stats.items++;
    });
    categories.push({
      sourceId: idGen(),
      name: (c.title || "Menu").slice(0, 60),
      description: null,
      sourceImageUrl: null,
      sortOrder: categories.length,
      isActive: true,
      isHidden: false,
      items,
    });
  }

  return {
    source: "ubereats",
    sourceMenuId: 0,
    sourceMenuName: menu.title,
    currency: menu.currency || "CAD",
    defaultLanguage: "en",
    stats,
    categories,
    categoryGroups: [],
  };
}

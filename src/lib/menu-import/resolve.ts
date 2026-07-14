/**
 * Source-agnostic menu-import resolver. Detects which platform a pasted link is
 * from and produces the common `ImportPreview` shape, so the admin + public
 * import routes (and their commit paths) stay identical regardless of source.
 *
 *   • Uber Eats — an ubereats.com store URL → the getStoreV1/getMenuItemV1 adapter.
 *   • GloriaFood — an embed snippet / ordering URL / bare restaurant UID.
 *
 * A bare UUID stays GloriaFood (both platforms use UUIDs, and GloriaFood is the
 * long-standing default); Uber is only chosen from an explicit ubereats.com URL.
 */
import {
  parseSource,
  clampToGloriaFoodHost,
  fetchGloriaFoodMenu,
  fetchGloriaFoodPictures,
  mapMenu,
  type ImportPreview,
} from "./gloriafood";
import { parseUberSource, fetchUberMenu, mapUberMenu } from "./ubereats";

export type MenuImportSource = "gloriafood" | "ubereats";

/** Which importer a pasted string routes to. Explicit ubereats.com URL → Uber;
 *  everything else (snippets, GloriaFood URLs, bare UUIDs) → GloriaFood. */
export function detectMenuSource(input: string): MenuImportSource {
  return /ubereats\.com/i.test(input) ? "ubereats" : "gloriafood";
}

export interface ResolvedImport {
  source: MenuImportSource;
  preview: ImportPreview;
  /** Stable per-restaurant identifier from the source (UID) — used as the
   *  sandbox's sourceLabel + for logging. */
  sourceLabel: string;
}

/**
 * Fetch + map a pasted menu link into an `ImportPreview`.
 *  - `publicSafe`: for the UNAUTHENTICATED public funnel — SSRF-clamps the
 *    GloriaFood host. (Uber is inherently safe: fixed www.ubereats.com host,
 *    the only user input is the store UUID query param.)
 */
export async function buildImportPreview(
  input: string,
  opts: { publicSafe?: boolean } = {},
): Promise<ResolvedImport> {
  if (detectMenuSource(input) === "ubereats") {
    const src = parseUberSource(input);
    const menu = await fetchUberMenu(src);
    return { source: "ubereats", preview: mapUberMenu(menu), sourceLabel: src.storeUuid };
  }
  let parsed = parseSource(input);
  if (opts.publicSafe) parsed = clampToGloriaFoodHost(parsed);
  const [menu, pictures] = await Promise.all([fetchGloriaFoodMenu(parsed), fetchGloriaFoodPictures(parsed)]);
  return { source: "gloriafood", preview: mapMenu(menu, pictures), sourceLabel: parsed.restaurantUid };
}

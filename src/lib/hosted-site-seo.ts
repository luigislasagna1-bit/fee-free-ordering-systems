/**
 * Programmatic SEO helpers for the hosted marketing site.
 *
 * GloriaFood's hosted sites win Google search by generating a footer
 * full of `{cuisine} × {city}` links — each one a separate landing
 * page at /<keyword-slug> on the restaurant's domain, with the H1 +
 * <title> + meta description tuned to that exact search query.
 *
 * Example: a pizza restaurant in Milton produces landing pages for
 *   - /italian-food-delivery-mississauga
 *   - /pizza-delivery-oakville
 *   - /burger-takeout-milton
 *   - /pasta-delivery-burlington
 *   - ... (cuisines × surrounding cities × delivery|takeout)
 *
 * This module provides:
 *   - SURROUNDING_CITIES: a map of "primary metro area" → ordered list
 *     of cities within it (matched against Restaurant.city, case
 *     insensitive)
 *   - buildSeoLinks(restaurant): returns the full list of
 *     {slug, label, cuisine, city, type} for a given restaurant
 *   - parseSeoSlug(slug): inverse — turn a URL slug back into
 *     {cuisine, city, type, label} so the landing page can render
 *     correct headings and meta
 *
 * The intent is for the footer to render ALL the links inline (small
 * font, low contrast, multi-column) so the page stays clean for human
 * visitors but search engines crawl every permutation. Each link goes
 * to /<slug>/<seo-slug> which is rendered by the same hosted page
 * with overrides for title / H1 / description.
 */

/** Metro areas grouped by their "anchor" city. Keys are lowercase. */
export const SURROUNDING_CITIES: Record<string, string[]> = {
  // GTA — Greater Toronto Area
  milton: [
    "Milton",
    "Mississauga",
    "Oakville",
    "Burlington",
    "Hamilton",
    "Halton Hills",
    "Georgetown",
    "Brampton",
    "Toronto",
    "Acton",
    "Campbellville",
    "Hornby",
  ],
  toronto: [
    "Toronto",
    "Mississauga",
    "Etobicoke",
    "Scarborough",
    "North York",
    "Vaughan",
    "Markham",
    "Richmond Hill",
    "Brampton",
    "Oakville",
    "Burlington",
  ],
  mississauga: [
    "Mississauga",
    "Toronto",
    "Oakville",
    "Brampton",
    "Milton",
    "Burlington",
    "Etobicoke",
  ],
  oakville: [
    "Oakville",
    "Burlington",
    "Mississauga",
    "Milton",
    "Hamilton",
  ],
  burlington: [
    "Burlington",
    "Oakville",
    "Hamilton",
    "Milton",
    "Stoney Creek",
    "Waterdown",
  ],
  hamilton: [
    "Hamilton",
    "Burlington",
    "Stoney Creek",
    "Dundas",
    "Ancaster",
    "Waterdown",
  ],
  brampton: [
    "Brampton",
    "Mississauga",
    "Toronto",
    "Caledon",
    "Vaughan",
    "Etobicoke",
  ],
  // Add more metros here as we onboard restaurants in other areas.
};

/** Common service-type words paired with a cuisine to form a keyword. */
const SERVICE_TYPES = ["delivery", "takeout"] as const;

/** Words that go between {cuisine} and {service} to read naturally.
 *  e.g. "italian FOOD delivery", but "pizza delivery" (no "food" filler). */
const CUISINE_NEEDS_FOOD_FILLER = new Set(["italian", "thai", "indian", "mexican", "chinese", "japanese", "korean", "vietnamese", "greek", "lebanese", "ethiopian", "comfort"]);

/** A cuisine keyword normalized for slug construction. */
function normalizeCuisine(raw: string): { slug: string; label: string } | null {
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  // De-duplicate variants. "pizza" and "Pizza" → "pizza".
  // Multi-word cuisines like "comfort food" become "comfort-food".
  const slug = clean.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const label = raw
    .trim()
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return { slug, label };
}

/** Slugify a city name for use in URLs. "Halton Hills" → "halton-hills". */
function slugifyCity(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Reverse of slugifyCity — best-effort restoration of the display name. */
function unslugifyCity(slug: string, fallback: string): string {
  if (!slug) return fallback;
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export type SeoLink = {
  /** URL path segment, e.g. "italian-food-delivery-mississauga". */
  slug: string;
  /** Display label, e.g. "Italian Food Delivery Mississauga". */
  label: string;
  cuisine: string;
  city: string;
  type: "delivery" | "takeout";
};

/** Build the full list of SEO links for a restaurant, deduplicated and ordered. */
export function buildSeoLinks(input: {
  city: string | null;
  cuisineType: string | null;
  marketplaceTags?: string[];
}): SeoLink[] {
  // Resolve the metro area from the restaurant's city. Falls back to a
  // "single-city" map containing just the restaurant's own city when we
  // don't have surrounding-city data for that location yet.
  const metroKey = (input.city || "").trim().toLowerCase();
  const cities = SURROUNDING_CITIES[metroKey] ?? (input.city ? [input.city] : []);
  if (cities.length === 0) return [];

  // Build a deduplicated cuisine list from cuisineType + marketplaceTags.
  const cuisineRaws: string[] = [];
  if (input.cuisineType) cuisineRaws.push(input.cuisineType);
  for (const t of input.marketplaceTags || []) cuisineRaws.push(t);
  const seenCuisine = new Set<string>();
  const cuisines: Array<{ slug: string; label: string }> = [];
  for (const raw of cuisineRaws) {
    const n = normalizeCuisine(raw);
    if (!n || seenCuisine.has(n.slug)) continue;
    seenCuisine.add(n.slug);
    cuisines.push(n);
  }
  // If the restaurant has no cuisines configured, ensure at least one
  // generic "Restaurant" / "Food" link gets generated per city.
  if (cuisines.length === 0) {
    cuisines.push({ slug: "food", label: "Food" });
  }

  const links: SeoLink[] = [];
  for (const c of cuisines) {
    const filler = CUISINE_NEEDS_FOOD_FILLER.has(c.slug) ? "food-" : "";
    const fillerLabel = CUISINE_NEEDS_FOOD_FILLER.has(c.slug) ? " Food" : "";
    for (const cityName of cities) {
      const citySlug = slugifyCity(cityName);
      if (!citySlug) continue;
      for (const svc of SERVICE_TYPES) {
        const slug = `${c.slug}-${filler}${svc}-${citySlug}`;
        const label = `${c.label}${fillerLabel} ${svc.charAt(0).toUpperCase() + svc.slice(1)} ${cityName}`;
        links.push({ slug, label, cuisine: c.label, city: cityName, type: svc });
      }
    }
  }
  return links;
}

/** Inverse — parse a URL slug back into a SeoLink-like object. */
export function parseSeoSlug(slug: string): {
  cuisine: string;
  city: string;
  type: "delivery" | "takeout";
  label: string;
} | null {
  if (!slug) return null;
  // Detect type by trailing -delivery-XXX or -takeout-XXX pattern.
  const mDelivery = /^(.*)-delivery-(.+)$/.exec(slug);
  const mTakeout = /^(.*)-takeout-(.+)$/.exec(slug);
  const m = mDelivery || mTakeout;
  if (!m) return null;
  const type: "delivery" | "takeout" = mDelivery ? "delivery" : "takeout";
  let cuisinePart = m[1]; // e.g. "italian-food" or "pizza"
  const citySlug = m[2];

  // Strip trailing "-food" filler that we appended for ethnic cuisines.
  if (cuisinePart.endsWith("-food")) cuisinePart = cuisinePart.slice(0, -"-food".length);

  const cuisine = cuisinePart
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  const city = unslugifyCity(citySlug, citySlug);
  const filler = CUISINE_NEEDS_FOOD_FILLER.has(cuisinePart.toLowerCase()) ? " Food" : "";
  const label = `${cuisine}${filler} ${type.charAt(0).toUpperCase() + type.slice(1)} ${city}`;
  return { cuisine, city, type, label };
}

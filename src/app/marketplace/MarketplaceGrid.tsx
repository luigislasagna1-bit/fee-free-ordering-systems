"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Search, MapPin, Star, Sparkles, X } from "lucide-react";

/** Single listing as passed in from the server. Keep this in sync with the
 *  shape returned by listPublicMarketplaceListings — not imported directly
 *  to avoid pulling Prisma types into a client bundle. */
export type GridListing = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  cuisineType: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  marketplaceBanner: string | null;
  marketplaceTagline: string | null;
  marketplaceTags: string[];
  marketplaceFeatured: boolean;
  /** When the restaurant signed up — used for "Newest" sort. */
  createdAt: string;
};

type SortMode = "default" | "newest" | "alphabetical";

/**
 * Interactive marketplace grid: text search across name/cuisine/tags/city,
 * cuisine-tag filter chips, and a sort dropdown. All client-side from the
 * listings array we get on the initial server render — keeps SEO crawlers
 * happy AND gives customers instant filtering with no roundtrip.
 *
 * Scales fine up to a few thousand listings; if the marketplace ever grows
 * past ~5k restaurants we'd move filtering server-side with an index on
 * Restaurant.cuisineType + a tags table.
 */
export function MarketplaceGrid({ listings }: { listings: GridListing[] }) {
  const t = useTranslations("marketplace");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("default");

  // Derive available cuisines from the data so the filter chips reflect
  // what's actually browsable. Sorted by frequency (most-common first).
  const cuisines = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of listings) {
      const c = l.cuisineType?.trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      for (const tag of l.marketplaceTags) {
        const t = tag.trim();
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = listings.filter((l) => {
      if (activeCuisine) {
        const tags = [l.cuisineType, ...l.marketplaceTags].filter(Boolean) as string[];
        if (!tags.some((t) => t.toLowerCase() === activeCuisine.toLowerCase())) {
          return false;
        }
      }
      if (q) {
        const haystack = [
          l.name,
          l.city ?? "",
          l.cuisineType ?? "",
          l.marketplaceTagline ?? "",
          ...l.marketplaceTags,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (sort === "newest") {
      out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === "alphabetical") {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    }
    // "default" keeps the server's ordering: featured first, then by name.
    return out;
  }, [listings, query, activeCuisine, sort]);

  const featured = filtered.filter((l) => l.marketplaceFeatured);
  const regular = filtered.filter((l) => !l.marketplaceFeatured);
  const showFeaturedSection = sort === "default" && featured.length > 0;

  return (
    <>
      {/* ─── Search bar ───────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full pl-10 pr-9 py-2.5 rounded-full border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("clearSearch")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-full border border-gray-200 bg-gray-50 text-sm px-3 py-2.5 focus:outline-none focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              aria-label={t("sortAria")}
            >
              <option value="default">{t("sortFeatured")}</option>
              <option value="newest">{t("sortNewest")}</option>
              <option value="alphabetical">{t("sortAlpha")}</option>
            </select>
          </div>

          {cuisines.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => setActiveCuisine(null)}
                className={`flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 transition border ${
                  activeCuisine === null
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                }`}
              >
                {t("allCuisines")}
              </button>
              {cuisines.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCuisine(activeCuisine === c ? null : c)}
                  className={`flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 transition border ${
                    activeCuisine?.toLowerCase() === c.toLowerCase()
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {filtered.length === 0 ? (
          <NoResults
            isEmpty={listings.length === 0}
            hasFilters={!!query || !!activeCuisine}
            onClear={() => {
              setQuery("");
              setActiveCuisine(null);
            }}
          />
        ) : (
          <>
            {showFeaturedSection && (
              <section className="mb-8">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                  {t("featured")}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featured.map((l) => (
                    <RestaurantTile key={l.id} listing={l} featured />
                  ))}
                </div>
              </section>
            )}

            <section>
              {showFeaturedSection && (
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                  {t("allRestaurants")}
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(showFeaturedSection ? regular : filtered).map((l) => (
                  <RestaurantTile key={l.id} listing={l} featured={l.marketplaceFeatured && !showFeaturedSection} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function NoResults({
  isEmpty,
  hasFilters,
  onClear,
}: {
  isEmpty: boolean;
  hasFilters: boolean;
  onClear: () => void;
}) {
  const t = useTranslations("marketplace");
  if (isEmpty) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {t("emptyTitle")}
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          {t.rich("emptyBody", {
            b: (c) => <span className="font-semibold text-emerald-600">{c}</span>,
          })}
        </p>
        <Link
          href="/login"
          className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition"
        >
          {t("restaurantLogin")}
        </Link>
      </div>
    );
  }
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Search className="w-7 h-7 text-gray-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{t("noMatchesTitle")}</h2>
      <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
        {t("noMatchesBody")}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="inline-block px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition"
        >
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}

/** Single restaurant tile in the marketplace grid. */
function RestaurantTile({
  listing,
  featured = false,
}: {
  listing: GridListing;
  featured?: boolean;
}) {
  const t = useTranslations("marketplace");
  const bannerUrl = listing.marketplaceBanner || listing.bannerUrl || null;

  return (
    <Link
      href={`/marketplace/${listing.slug}`}
      className={`group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition border ${
        featured ? "border-emerald-300 ring-2 ring-emerald-100" : "border-gray-100"
      }`}
    >
      <div className="relative h-32 sm:h-40 bg-gradient-to-br from-emerald-200 to-emerald-100 overflow-hidden">
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt={listing.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        {featured && (
          <span className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3 fill-white" /> {t("featured")}
          </span>
        )}
        {listing.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.logoUrl}
            alt=""
            className="absolute bottom-2 left-2 w-12 h-12 rounded-xl border-2 border-white shadow-md object-cover bg-white"
          />
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-gray-900 leading-tight truncate">{listing.name}</h3>
        </div>
        {listing.marketplaceTagline && (
          <p className="text-xs text-gray-600 line-clamp-1 italic">{listing.marketplaceTagline}</p>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          {listing.city && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {listing.city}
            </span>
          )}
          {listing.cuisineType && <span>· {listing.cuisineType}</span>}
        </div>
        {listing.marketplaceTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {listing.marketplaceTags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-600 rounded-full px-2 py-0.5"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

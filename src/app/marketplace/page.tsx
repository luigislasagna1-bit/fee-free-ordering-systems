import Link from "next/link";
import { Search, MapPin, Star, Sparkles } from "lucide-react";
import { listPublicMarketplaceListings } from "@/lib/marketplace";

/**
 * Public marketplace browse page — the customer entry point.
 *
 * Visually inspired by GloriaFood / Fantuan / UberEats: a grid of
 * restaurant tiles, each linking through to that restaurant's
 * existing order page. The marketplace is intentionally SIMPLER than
 * the big aggregators — no per-restaurant fees, no surge pricing, no
 * 4-page checkout. Just "tap → order".
 *
 * Server-rendered so the grid is SEO-indexable. Customer interactions
 * happen on the existing /order/[slug] flow we already have.
 */

export const metadata = {
  title: "Marketplace — Fee Free Ordering",
  description:
    "Order from local restaurants without surge pricing or 30% commissions. Restaurants on our marketplace pay a flat monthly fee instead of per-order kickbacks, so prices stay low and menus stay full.",
};

export default async function MarketplacePage() {
  const listings = await listPublicMarketplaceListings();
  const featured = listings.filter((l) => l.marketplaceFeatured);
  const regular = listings.filter((l) => !l.marketplaceFeatured);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-br from-orange-500 to-pink-500 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wider opacity-90">
              Fee Free Marketplace
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
            Order local. Keep more in their pockets.
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-white/90">
            Every restaurant here pays a flat monthly subscription — never a 30% commission. That means your
            menu prices are the menu prices. No service fees. No surge. No upsells. Just food.
          </p>

          {/* Comparison ribbon */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3.5 text-sm">
              <div className="font-bold text-xl">$0</div>
              <div className="text-white/85">in extra customer fees</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3.5 text-sm">
              <div className="font-bold text-xl">0%</div>
              <div className="text-white/85">commission to restaurants</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3.5 text-sm">
              <div className="font-bold text-xl">100%</div>
              <div className="text-white/85">independent local restaurants</div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Search bar (placeholder for M2 filter UI) ────────────────── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search restaurants, cuisines, or dishes…"
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:bg-white focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              disabled
              title="Search comes in Phase M2 — for now, browse the grid below"
            />
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {listings.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-orange-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              We're just getting started
            </h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              No restaurants on the marketplace yet. If you run a restaurant, subscribe to the
              <span className="font-semibold text-orange-600"> Marketplace Listing</span> add-on
              from your admin dashboard to get listed here.
            </p>
            <Link
              href="/login"
              className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition"
            >
              Restaurant log in
            </Link>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-orange-500 fill-orange-500" />
                  Featured
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featured.map((l) => (
                    <RestaurantTile key={l.id} listing={l} featured />
                  ))}
                </div>
              </section>
            )}

            <section>
              {featured.length > 0 && (
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                  All restaurants
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {regular.map((l) => (
                  <RestaurantTile key={l.id} listing={l} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* ─── Footer pitch for restaurants ─────────────────────────────── */}
      <footer className="bg-white border-t border-gray-100 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Restaurant owner? Get listed.
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Flat <span className="font-bold text-gray-900">$199.99/month max</span> (or per-order, whichever is cheaper)
              — no commissions, no extra customer fees, no exclusivity contracts. UberEats charges
              about <span className="font-bold text-gray-900">$200 in commission on $660 of orders.</span> On our
              marketplace, $200 buys you unlimited orders for the entire month.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:justify-end">
            <Link
              href="/signup"
              className="px-5 py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition text-center"
            >
              Get listed for free
            </Link>
            <Link
              href="/pricing"
              className="px-5 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition text-center"
            >
              See pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Single restaurant tile in the marketplace grid. */
function RestaurantTile({
  listing,
  featured = false,
}: {
  listing: Awaited<ReturnType<typeof listPublicMarketplaceListings>>[number];
  featured?: boolean;
}) {
  // Banner falls back from marketplace-specific to restaurant default to gradient.
  const bannerUrl = listing.marketplaceBanner || listing.bannerUrl || null;

  return (
    <Link
      href={`/marketplace/${listing.slug}`}
      className={`group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition border ${
        featured ? "border-orange-300 ring-2 ring-orange-100" : "border-gray-100"
      }`}
    >
      {/* Banner */}
      <div className="relative h-32 sm:h-40 bg-gradient-to-br from-orange-300 to-pink-300 overflow-hidden">
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt={listing.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        {featured && (
          <span className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3 fill-white" /> Featured
          </span>
        )}
        {/* Logo overlay */}
        {listing.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.logoUrl}
            alt=""
            className="absolute bottom-2 left-2 w-12 h-12 rounded-xl border-2 border-white shadow-md object-cover bg-white"
          />
        )}
      </div>

      {/* Body */}
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
          <div className="mt-2 flex gap-1 flex-wrap">
            {listing.marketplaceTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

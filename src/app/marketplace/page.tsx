import Link from "next/link";
import { Sparkles, User } from "lucide-react";
import { listPublicMarketplaceListings } from "@/lib/marketplace";
import { MarketplaceGrid, type GridListing } from "./MarketplaceGrid";
import { getCurrentCustomer } from "@/lib/customer-session";

/**
 * Public marketplace browse page — the customer entry point.
 *
 * Visually inspired by GloriaFood / Fantuan / UberEats: a grid of
 * restaurant tiles, each linking through to that restaurant's
 * existing order page. The marketplace is intentionally SIMPLER than
 * the big aggregators — no per-restaurant fees, no surge pricing, no
 * 4-page checkout. Just "tap → order".
 *
 * Server-renders the listings array for SEO/crawl, then hands off to
 * a client component (MarketplaceGrid) that owns search + sort + filter
 * state without a roundtrip.
 */

export const metadata = {
  title: "Marketplace — Fee Free Ordering",
  description:
    "Order from local restaurants without surge pricing or 30% commissions. Restaurants on our marketplace pay a flat monthly fee instead of per-order kickbacks, so prices stay low and menus stay full.",
};

export default async function MarketplacePage() {
  const [raw, currentCustomer] = await Promise.all([
    listPublicMarketplaceListings(),
    getCurrentCustomer(),
  ]);

  // Serialise to plain JSON for the client boundary. We strip Prisma Decimal
  // / Date wrappers here so React doesn't choke at the server→client edge.
  const listings: GridListing[] = raw.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    cuisineType: r.cuisineType,
    logoUrl: r.logoUrl,
    bannerUrl: r.bannerUrl,
    marketplaceBanner: r.marketplaceBanner,
    marketplaceTagline: r.marketplaceTagline,
    marketplaceTags: r.marketplaceTags,
    marketplaceFeatured: r.marketplaceFeatured,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt ?? ""),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-br from-emerald-500 to-pink-500 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wider opacity-90">
                Fee Free Marketplace
              </span>
            </div>
            <Link
              href={currentCustomer ? "/account" : "/account/login"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-xs font-semibold transition"
            >
              <User className="w-3.5 h-3.5" />
              {currentCustomer
                ? (currentCustomer.name?.split(" ")[0] || "My account")
                : "Sign in"}
            </Link>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
            Order local. Keep more in their pockets.
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-white/90">
            Every restaurant here pays a flat monthly subscription — never a 30% commission. That means your
            menu prices are the menu prices. No service fees. No surge. No upsells. Just food.
          </p>

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

      <MarketplaceGrid listings={listings} />

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
              className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition text-center"
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

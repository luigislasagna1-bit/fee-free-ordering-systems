import Link from "next/link";
import { Sparkles, User, Smartphone, Rocket } from "lucide-react";
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
  // PWA wiring — phones get an "Add to Home Screen" prompt that
  // installs the marketplace as a standalone app. This is the
  // poor-man's native app: no App Store review cycle, no separate
  // codebase, but a real home-screen icon + splash + standalone
  // chrome (no browser address bar). The native Capacitor wrapper
  // for marketplace remains a separate later effort that needs
  // app-store certificates + icon design.
  manifest: "/manifest-marketplace.webmanifest",
  themeColor: "#10B981",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default" as const,
    title: "Marketplace",
  },
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
      {/* ─── Slim branded header ───────────────────────────────────────
          Compact UberEats-style top strip — get the customer LOOKING AT
          RESTAURANTS as fast as possible (Luigi: "we're wasting a lot of
          space on top of the main marketplace page, it should be focused
          on attracting customers and orders. Move that info to the bottom
          or a separate page.").
          The gradient is now mono-emerald (light green on the right, per
          the same UAT note) — the navy slate-900 we had on the right was
          "too dark, make it more of the light green color." */}
      <header className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 text-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-bold leading-tight truncate">Fee Free Marketplace</div>
              <div className="text-[11px] sm:text-xs text-white/85 leading-tight truncate">
                0% commission · Local restaurants · No surge pricing
              </div>
            </div>
          </div>
          <Link
            href={currentCustomer ? "/account" : "/account/login"}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-xs font-semibold transition"
          >
            <User className="w-3.5 h-3.5" />
            {currentCustomer
              ? (currentCustomer.name?.split(" ")[0] || "My account")
              : "Sign in"}
          </Link>
        </div>
      </header>

      {/* Restaurants come first — same priority as UberEats/DoorDash. */}
      <MarketplaceGrid listings={listings} />

      {/* ─── Why-this-marketplace pitch (moved from the top hero) ──────
          Customer-facing trust block. Was at the top eating prime real
          estate; now lives below the grid so first-page focus stays on
          actual restaurants. */}
      <section className="bg-white border-t border-gray-100 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center mb-8 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
              Order local. Keep more in their pockets.
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Every restaurant here pays a flat monthly subscription — never a 30% commission. Menu prices are the menu prices. No service fees. No surge. No upsells. Just food.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center">
              <div className="font-bold text-3xl text-emerald-600">$0</div>
              <div className="text-sm text-gray-600 mt-1">in extra customer fees</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center">
              <div className="font-bold text-3xl text-emerald-600">0%</div>
              <div className="text-sm text-gray-600 mt-1">commission to restaurants</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center">
              <div className="font-bold text-3xl text-emerald-600">100%</div>
              <div className="text-sm text-gray-600 mt-1">independent local restaurants</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Native apps Coming Soon notice ───────────────────────────────
          PWA install works on iOS Safari + Android Chrome today (Add to
          Home Screen). Native wrappers via Capacitor are scaffolded but
          not yet in either store — call that out honestly so visitors
          aren't searching the App Store and coming up empty. */}
      <section className="bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 sm:p-5 max-w-3xl mx-auto">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-bold text-amber-900">Native iOS &amp; Android apps</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
                  <Rocket className="w-2.5 h-2.5" />
                  Coming Soon
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
                The full-fat native apps are in the pipeline. In the meantime, tap your browser&apos;s
                <span className="font-semibold"> share menu</span> and choose
                <span className="font-semibold"> &ldquo;Add to Home Screen&rdquo;</span> — you&apos;ll get the marketplace as a real app icon, splash screen and full-screen experience. No App Store required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer pitch for restaurants ─────────────────────────────── */}
      <footer className="bg-gray-50 border-t border-gray-200">
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

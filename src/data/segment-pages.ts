/**
 * Segment marketing pages — /for/restaurant-groups and /for/virtual-brands
 * (COMPETITOR-TOWNCLUB-PLAN.md action #8, Luigi 2026-07-06).
 *
 * Rendered by src/app/for/[segment]/page.tsx — statically generated at build
 * time with `dynamicParams = false` so ONLY the slugs listed here render.
 * Sibling of the solution engine (src/data/solution-pages.ts → /[slug]) and the
 * competitor engine (src/data/competitors.ts → /vs/[slug]): same SSG +
 * SoftwareApplication + FAQPage JSON-LD + internal cross-links playbook.
 *
 * ENGLISH-ONLY by design (same established exception as /vs + /online-ordering-for
 * + the solution pages). The product UI is fully 38-locale; these acquisition
 * pages are not.
 *
 * SHIPPED FEATURES ONLY. Every claim traces to real code: parent/child brand
 * inheritance per-setting with brand LOCKS (src/lib/inherited-settings.ts,
 * src/lib/brand.ts), the brand dashboard aggregating per-location order/revenue
 * tiles + invite link (BrandDashboardClient), live brand-menu inheritance,
 * true white-label on verified custom domains, per-ITEM day/time visibility +
 * fulfilment windows (src/lib/menu-visibility.ts + menu-fulfilment.ts — NOT a
 * brand-level daypart master switch), the Kitchen Order App ring/print/missed-
 * call, and per-restaurant customer databases (Customer.restaurantId — each
 * brand keeps its own; the brand dashboard aggregates order/revenue stats).
 * NO add-on dollar figures (DB-driven; /pricing publishes live numbers).
 * "Real human support", never "24/7".
 */

export interface SegmentBenefit {
  title: string;
  body: string;
}
export interface SegmentFaq {
  q: string;
  a: string;
}
export interface SegmentPage {
  slug: string;
  /** Short human label for the footer link + cross-link pills. */
  label: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  eyebrow: string;
  intro: string;
  painPoint: SegmentBenefit;
  /** Exactly 4 (2×2 grid) — richer than the solution pages' 3. */
  benefits: SegmentBenefit[];
  /** 5, page-specific (drives the FAQPage JSON-LD). */
  faqs: SegmentFaq[];
}

export const SEGMENT_PAGES: SegmentPage[] = [
  {
    slug: "restaurant-groups",
    label: "Restaurant groups",
    metaTitle: "Online Ordering for Restaurant Groups & Multi-Location Brands | Fee Free Ordering",
    metaDescription:
      "Run every location from one login. Push your brand menu to all sites, let each location tweak hours and prices, and keep 100% of every direct order. 0% commission, free for your first 100 orders/mo.",
    h1: "One brand, every location, one login",
    eyebrow: "MULTI-LOCATION",
    intro:
      "Growing from one restaurant to five doesn't have to mean five disconnected systems and five commission bills. Fee Free Ordering runs your whole group from a single account: build the menu once at the brand level, push it to every location, and let each site adjust the details that are genuinely local — while you keep 100% of every direct order.",
    painPoint: {
      title: "Every new location multiplies the busywork",
      body: "Open a second location on most platforms and you've just doubled your admin: a separate dashboard to log into, the menu re-entered by hand, a price change that has to be made five times, and five separate commission cheques going out the door. A real multi-location system lets you make a change once and see it everywhere — without giving up per-location control where it actually matters.",
    },
    benefits: [
      {
        title: "Build the menu once, inherit it everywhere",
        body: "Set your menu at the brand level and every location can inherit it live. Update a price or add a dish at the brand, and inheriting locations pick it up automatically — no re-keying the same menu into five accounts.",
      },
      {
        title: "Let each location own what's local",
        body: "Inheritance is per-setting and per-location. Any site can keep the brand menu but set its own opening hours, its own delivery zones, and its own item availability — or flip “everything from brand” back on with one switch. Each setting is independent, so locations stay consistent where it counts and flexible where it doesn't.",
      },
      {
        title: "Lock what head office needs to control",
        body: "For settings you don't want a franchisee changing — the menu, hours, zones, availability — the brand can LOCK them. A locked setting is read-only at the location and clearly marked “Managed by your brand,” so your standards hold across the group without micromanaging every site.",
      },
      {
        title: "One dashboard across the whole group",
        body: "Sign in once and see a brand dashboard with every location as a tile — today's orders, revenue, pending tickets, and published status side by side. Drill into any single location to manage it, then jump back to the group view. Invite a co-owner or manager to a new location with a single link.",
      },
    ],
    faqs: [
      {
        q: "Can I manage all my locations from one account?",
        a: "Yes. Your brand parent account shows a group dashboard with every location as a tile — orders today, revenue, pending tickets, and whether each site is published — and you can drill into any location to manage it, then switch back. You can also invite a co-owner or manager to run a specific location with their own login.",
      },
      {
        q: "If I change the menu at head office, does it update every location?",
        a: "Every location set to inherit the brand menu reads your current menu live, so a price change or a new dish at the brand shows up at those locations automatically. Locations you've set to a custom menu keep their own — inheritance is a per-location choice.",
      },
      {
        q: "Can one location have different hours or prices than the rest?",
        a: "Yes. Inheritance is per setting: a location can inherit the brand menu but set its own opening hours, delivery zones, and item availability locally. Flip any of them between “from brand” and “set here” independently, or switch everything back to the brand with one master toggle.",
      },
      {
        q: "Can I stop a location from changing certain settings?",
        a: "Yes. As the brand you can lock the menu, hours, zones, or availability for any location. A locked setting becomes read-only for that location and is labelled “Managed by your brand,” which is how you keep franchise standards consistent across the group.",
      },
      {
        q: "Do I pay commission or a separate fee per location?",
        a: "0% commission on every direct order, at every location. The core platform is free for your first 100 orders each month; beyond that you add only the optional pieces you need (online card payments, a multi-location add-on, marketing) and pay only for what you use — no per-location contracts or surprise tiers.",
      },
    ],
  },
  {
    slug: "virtual-brands",
    label: "Virtual brands & ghost kitchens",
    metaTitle: "Online Ordering for Virtual Brands & Ghost Kitchens | Fee Free Ordering",
    metaDescription:
      "Run multiple delivery brands out of one kitchen — each with its own menu, its own branded domain, and its own storefront — all from a single login. 0% commission, free for your first 100 orders/mo.",
    h1: "Every brand its own storefront. One kitchen behind them all.",
    eyebrow: "VIRTUAL BRANDS & GHOST KITCHENS",
    intro:
      "A ghost kitchen only pays off when each brand looks like a real, standalone business — not a menu tab on somebody else's app. Fee Free Ordering gives every virtual brand its own storefront, its own menu, and its own branded domain, while you run all of them from one login and one kitchen. And with 0% commission on direct orders, the margin that makes ghost kitchens work actually stays with you.",
    painPoint: {
      title: "Delivery apps rent you a slot; they don't build you a brand",
      body: "List a virtual brand on a marketplace and you're renting a listing: 20–30% off every order, a “storefront” that's really their app, and a customer who belongs to them, not you. To run virtual brands profitably you need each one to be a real, ownable business — its own site, its own customers, its own margin — coordinated from a single back office.",
    },
    benefits: [
      {
        title: "A separate storefront per brand",
        body: "Each virtual brand is its own storefront with its own menu, theme colours, and ordering page — not a sub-section of a shared one. Diners see a focused, standalone brand; you manage them all from one account and switch between them in a click.",
      },
      {
        title: "A branded domain for every brand",
        body: "Point a verified custom domain at each brand and the customer sees zero platform branding — your name in the browser tab, your favicon, your share image, your theme. Every virtual brand can look like the independent business it's pretending to be, right down to the URL.",
      },
      {
        title: "Day-parted menus for breakfast, lunch, and late-night concepts",
        body: "Run a wings brand at night and a breakfast brand in the morning from the same line. Each item can be shown only during its window and made orderable only for the days and times you set, so a menu — or a whole concept — appears exactly when its kitchen is running it.",
      },
      {
        title: "One kitchen, one login, all the tickets",
        body: "However many brands you run, orders from all of them ring on the Kitchen Order App and print to your thermal printer — on iOS and Android, even screen-off, with a missed-order phone call if one slips through. Add a new brand from the same account whenever you want to test a concept.",
      },
    ],
    faqs: [
      {
        q: "Can I run multiple brands from one kitchen and one account?",
        a: "Yes. Each virtual brand is its own storefront — its own menu, theme, and ordering page — and they all live under a single login. You switch between brands in your dashboard, and orders from every brand come into the same Kitchen Order App and thermal printer at your one physical kitchen.",
      },
      {
        q: "Can each brand have its own website domain?",
        a: "Yes. Point a verified custom domain at each brand and the ordering experience is fully white-labelled — your brand's name, favicon, theme, and share image, with no “Fee Free Ordering” branding shown to the customer. Each virtual brand can live on its own URL.",
      },
      {
        q: "Can different brands run different menus at different times of day?",
        a: "Yes — per item. You can set any menu item to be visible only during a window and orderable only on the days and times you choose, so a breakfast concept shows in the morning and a late-night concept shows at night. It's controlled item-by-item and by day-and-time, which is what lets several concepts share one kitchen.",
      },
      {
        q: "Do the brands share customers and reporting, or stay separate?",
        a: "Each brand keeps its own customer database and storefront identity — a diner who orders from your wings brand is a customer of that brand, kept separate from your breakfast brand. For running the kitchen you get a group view of orders and revenue across everything under your account, while the customer relationships stay cleanly separated per brand.",
      },
      {
        q: "What does it cost to run several brands?",
        a: "0% commission on every direct order, for every brand. The core platform is free for your first 100 orders each month; branded custom domains and other extras are optional à-la-carte add-ons, so you only pay for what each brand actually uses.",
      },
    ],
  },
];

export function getSegmentPage(slug: string): SegmentPage | undefined {
  return SEGMENT_PAGES.find((p) => p.slug === slug);
}

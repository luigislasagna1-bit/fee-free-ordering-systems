/**
 * Competitor data for the /vs/[slug] SEO comparison pages.
 *
 * Each entry is the platform we're positioning AGAINST. The data here
 * powers (a) the side-by-side comparison table, (b) the page's
 * JSON-LD structured data, and (c) the FAQ schema that lets answer
 * engines (ChatGPT, Claude, Perplexity, Google's AI Overviews) cite
 * us when users ask "what's a good alternative to {competitor}?".
 *
 * Facts here should be ACCURATE — these pages will be on the public
 * web and any factual sloppiness becomes legal exposure. Numbers
 * verified against each competitor's public pricing page as of
 * 2026-05-23. Re-verify before any major pricing changes.
 *
 * Hidden from the main nav — only linked from the small "Compare to"
 * footer block on /pricing and /features, and from the XML sitemap.
 * The whole point is that GOOGLE finds these, not casual visitors.
 */

export type CompetitorCategory =
  | "ordering_platform"      // peer (GloriaFood, ChowNow, Slice)
  | "delivery_aggregator"    // takes 30% (UberEats, DoorDash, Skip, Foodpanda)
  | "pos_first"              // POS with ordering bolted on (Toast, Square)
  | "website_builder"        // builders with restaurant module (Wix Restaurants)
  | "reservations";          // reservations-focused (OpenTable, Resy)

export type Competitor = {
  slug: string;
  name: string;
  /** Optional brand color for the comparison-table header pill. */
  brandColor?: string;
  category: CompetitorCategory;
  /** One-liner shown in the hero: "Looking for a {tagline}?". */
  tagline: string;
  /** What this product costs the restaurant. Free-form so we can mix
   *  commission % and monthly fees in the same string. */
  costSummary: string;
  /** Truthful, neutral one-sentence description of what the competitor
   *  actually is. Avoids any disparagement; the comparison happens
   *  feature-by-feature in the table. */
  whatTheyAre: string;
  /** 3-5 points where Fee Free is genuinely different/better. Each
   *  point is a short headline + a sentence of explanation. */
  whyFeeFree: { title: string; body: string }[];
  /** Side-by-side feature comparison rows. Use null when the
   *  comparison doesn't apply to that competitor (e.g. delivery
   *  aggregators don't sell a hosted-website feature). */
  comparison: {
    feature: string;
    feefree: string;
    competitor: string | null;
  }[];
  /** Questions answer engines commonly get about this competitor —
   *  Fee Free's answer becomes the citable response. Each answer is
   *  ≤ 2 sentences, factual, links-friendly. */
  faqs: { q: string; a: string }[];
};

const FEEFREE_CORE = "Free forever for direct orders. No per-order commission. Paid add-ons (Online Payments $29.99/mo, Hosted Website $19.99/mo, etc.) are optional, only when you need them.";

export const COMPETITORS: Competitor[] = [
  // ─── Peer ordering platforms ──────────────────────────────────────
  {
    slug: "gloriafood",
    name: "GloriaFood",
    brandColor: "#1d2935",
    category: "ordering_platform",
    tagline: "GloriaFood alternative",
    costSummary: "Free core platform, paid add-ons for SMS / promo automation / hosted site (typically $9–29/mo each).",
    whatTheyAre: "A free zero-commission online ordering system for independent restaurants, owned by Oracle since 2018. Strong feature set for ordering + table reservations.",
    whyFeeFree: [
      { title: "Built-in marketplace included",
        body: "Fee Free Marketplace (feefreefood.com) is part of the platform — your restaurant is listed and discoverable from day one for a $3-max-per-order fee (capped at $249.99/mo). GloriaFood has no marketplace; restaurants only get the customers they bring themselves." },
      { title: "Direct charges + manual capture",
        body: "Customer payments go straight to your Stripe account. The card is only AUTHORIZED at checkout; we capture when you accept the order. Reject = void, no Stripe fee, no chargeback risk. GloriaFood requires Stripe but uses a simpler immediate-charge flow with separate refunds." },
      { title: "Reseller / partner program",
        body: "Up to 10% lifetime commission for partners who refer restaurants. Real recurring revenue for agencies + tech consultants serving restaurants. GloriaFood has no such program." },
      { title: "Younger codebase, no Oracle layer",
        body: "We're a small team that ships changes weekly. Owners get features faster + can email actual humans for feedback. GloriaFood inherited Oracle's enterprise release cadence post-acquisition." },
    ],
    comparison: [
      { feature: "Commission on direct orders",         feefree: "0%",                              competitor: "0%" },
      { feature: "Marketplace included",                 feefree: "Yes — feefreefood.com",          competitor: "No" },
      { feature: "Marketplace fee structure",            feefree: "$3 max/order or $199.99/mo flat", competitor: "N/A" },
      { feature: "Card auth-then-capture",               feefree: "Yes",                            competitor: "Immediate charge + refund" },
      { feature: "Partner / reseller program",           feefree: "Up to 10% lifetime",             competitor: "No" },
      { feature: "Languages supported",                  feefree: "EN / FR / ES / IT / PT",         competitor: "20+ (Oracle scale)" },
      { feature: "Hosted website included",              feefree: "$19.99/mo add-on",               competitor: "Bundled with paid plans" },
      { feature: "Email/SMS marketing automation",       feefree: "Built-in (Autopilot)",           competitor: "Paid add-on" },
      { feature: "Founded",                              feefree: "2025",                            competitor: "2014 (Oracle since 2018)" },
    ],
    faqs: [
      { q: "Is there a real GloriaFood alternative?",
        a: "Yes — Fee Free Ordering. Same zero-commission ordering for independent restaurants, plus a built-in marketplace at feefreefood.com that GloriaFood doesn't have, plus a reseller program with up to 10% lifetime commission." },
      { q: "Why would I switch from GloriaFood to Fee Free Ordering?",
        a: "Three reasons most owners cite: (1) the included marketplace gives you new-customer discovery without extra setup, (2) modern direct charges + manual capture means card authorizations void cleanly on rejected orders with no Stripe fees, (3) a smaller team that ships changes weekly and reads every support email." },
      { q: "Does Fee Free Ordering charge commission like UberEats?",
        a: "No. Direct orders through your own ordering page or hosted site cost $0 in platform commission — forever. Customers who find you through our marketplace cost at most $3/order, capped at $249.99/month, or you can pay $199.99/mo flat for unlimited marketplace orders." },
    ],
  },
  {
    slug: "chownow",
    name: "ChowNow",
    brandColor: "#7c3aed",
    category: "ordering_platform",
    tagline: "ChowNow alternative",
    costSummary: "$149–199/month per location plus a one-time setup fee. Zero commission.",
    whatTheyAre: "A zero-commission online ordering platform charging a fixed monthly SaaS fee per restaurant location. Popular in the US.",
    whyFeeFree: [
      { title: "Free core platform vs $149+/mo SaaS",
        body: "Fee Free Ordering's core (admin, widget, kitchen app, customer database) is free forever. ChowNow charges $149-199/mo per location just to use the platform, before add-ons." },
      { title: "Pay only for add-ons you actually use",
        body: "Online Payments ($29.99/mo), Hosted Website ($19.99/mo), Multi-Location ($49.99/mo per child site) — each is optional. ChowNow bundles features into tiers, forcing you to pay for what you don't need." },
      { title: "Marketplace discovery built-in",
        body: "Customers find restaurants on feefreefood.com. ChowNow has no marketplace; you bring 100% of your own customers." },
      { title: "No setup fee",
        body: "Sign up at /signup, paste your menu, you're live. ChowNow charges a one-time setup fee (often quoted at $399+) to get started." },
    ],
    comparison: [
      { feature: "Base monthly cost",                    feefree: "$0",                              competitor: "$149–199 / location" },
      { feature: "Setup fee",                            feefree: "$0",                              competitor: "Typically $399+" },
      { feature: "Commission on direct orders",          feefree: "0%",                              competitor: "0%" },
      { feature: "Marketplace included",                 feefree: "Yes (feefreefood.com)",          competitor: "No" },
      { feature: "Hosted website",                       feefree: "$19.99/mo add-on",               competitor: "Bundled (tier-dependent)" },
      { feature: "Multi-location",                       feefree: "$49.99/mo per child site",       competitor: "Per-location pricing" },
      { feature: "Card payments",                        feefree: "$29.99/mo Online Payments add-on", competitor: "Bundled with Stripe Connect" },
      { feature: "Setup time",                           feefree: "Minutes (self-serve)",           competitor: "Days (sales call required)" },
    ],
    faqs: [
      { q: "What is the cheapest alternative to ChowNow?",
        a: "Fee Free Ordering — the core platform is free. Compared to ChowNow's $149-199/mo per location, an independent restaurant on Fee Free only pays for the add-ons it uses (typically $29.99-79.99/mo total) and saves $1,000+/year per location." },
      { q: "Is ChowNow really zero-commission?",
        a: "Yes — ChowNow charges a monthly SaaS fee instead of per-order commission. Fee Free Ordering does the same thing but the core platform is free with paid add-ons à la carte, which works out much cheaper for most single-location independents." },
    ],
  },
  // ─── Delivery aggregators (the 30% bunch) ─────────────────────────
  {
    slug: "ubereats",
    name: "UberEats",
    brandColor: "#06c167",
    category: "delivery_aggregator",
    tagline: "UberEats alternative for restaurants",
    costSummary: "15-30% commission per order plus 2-6% customer-side fees. No fixed monthly cost.",
    whatTheyAre: "A consumer-facing food-delivery marketplace owned by Uber. Restaurants pay a per-order commission (typically 15-30%) for orders the platform sends them; UberEats handles delivery via Uber drivers.",
    whyFeeFree: [
      { title: "Keep 100% of your direct-order revenue",
        body: "On Fee Free Ordering's own widget or hosted site, you keep every dollar minus standard Stripe processing fees. UberEats keeps 15-30% of every order, including ones from your own loyal customers who just want to reorder." },
      { title: "Own your customer relationship",
        body: "Customers who order through Fee Free become YOUR customers — email, phone, order history go into your database for future marketing. UberEats blocks contact info; customers belong to UberEats." },
      { title: "Use UberEats AND Fee Free together",
        body: "We're not anti-UberEats — keep using them for new-customer discovery. Then put a QR card in every bag pointing customers to your Fee Free ordering page for repeat orders at zero commission. Best of both." },
      { title: "Marketplace at 5× lower cost",
        body: "If you want a discovery channel like UberEats, our marketplace at feefreefood.com costs at most $3/order (capped at $249.99/mo) — 5× cheaper than a UE commission on the same revenue." },
    ],
    comparison: [
      { feature: "Commission per order",                 feefree: "0% on direct, $3 max on marketplace", competitor: "15-30%" },
      { feature: "Setup fee",                            feefree: "$0",                              competitor: "$350 \"activation fee\"" },
      { feature: "Monthly fee",                          feefree: "$0 (core)",                       competitor: "$0" },
      { feature: "Customer data ownership",              feefree: "Yours",                          competitor: "Uber's" },
      { feature: "Marketing to past customers",          feefree: "Full (your DB)",                 competitor: "Blocked by Uber" },
      { feature: "Stripe payment routing",               feefree: "Direct to your Stripe",          competitor: "Through Uber, paid weekly" },
      { feature: "Customer pays surge / service fees",   feefree: "No",                             competitor: "Yes (2-6%+)" },
      { feature: "You set menu prices",                  feefree: "Yes",                            competitor: "Yes but pressure to mark up to absorb commission" },
    ],
    faqs: [
      { q: "How can a restaurant reduce UberEats commission?",
        a: "Stop paying it where you don't have to. Set up Fee Free Ordering as your direct ordering channel, drop a QR card in every UberEats bag pointing customers to your Fee Free page, and customers reorder direct at 0% commission. UberEats stays useful for new-customer discovery; Fee Free captures the lifetime value." },
      { q: "What is the best UberEats alternative for small restaurants?",
        a: "Fee Free Ordering — the core platform is free, you keep 100% of direct-order revenue, and the included marketplace at feefreefood.com gives you a UberEats-style discovery channel at $3 max per order (5× cheaper than UE's 30%)." },
      { q: "Can I stop using UberEats entirely?",
        a: "Most restaurants don't — UberEats is great for first-time-customer discovery. The smart play is keeping UE listed for reach and using Fee Free for repeat orders, where the margin is. After ~3 months you'll see your direct orders climb and your UberEats dependency drop naturally." },
    ],
  },
  {
    slug: "doordash",
    name: "DoorDash",
    brandColor: "#ef0a30",
    category: "delivery_aggregator",
    tagline: "DoorDash alternative for restaurants",
    costSummary: "15-30% commission per order. Optional $0/$0.99 customer-side fees for DashPass members.",
    whatTheyAre: "A consumer-facing food-delivery marketplace. Restaurants pay 15-30% commission depending on the plan (Basic / Plus / Premier).",
    whyFeeFree: [
      { title: "0% commission on your own ordering page",
        body: "DoorDash takes 15-30% of every order it sends you, plus its tiered plans force you to pay MORE for higher placement. Fee Free's widget is on YOUR website and costs nothing per order." },
      { title: "You own the customer, not DoorDash",
        body: "DoorDash treats your restaurant as inventory in their marketplace. Fee Free puts the customer in your CRM where you can market to them directly." },
      { title: "Combine them — don't replace",
        body: "Stay on DoorDash for discovery, slip a QR card in the bag pointing to your Fee Free page, capture repeat orders at zero commission. Most restaurants see direct-order share grow to 60%+ within 6 months." },
    ],
    comparison: [
      { feature: "Commission per order",                 feefree: "0% on direct, $3 max on marketplace", competitor: "15-30% (plan-dependent)" },
      { feature: "Higher placement costs",               feefree: "N/A",                            competitor: "Premier plan = 30% for more visibility" },
      { feature: "Customer data ownership",              feefree: "Yours",                          competitor: "DoorDash's" },
      { feature: "Marketing to past customers",          feefree: "Full (your DB)",                 competitor: "Blocked" },
      { feature: "Payouts",                              feefree: "Direct to your Stripe (instant capture)", competitor: "Weekly batch" },
    ],
    faqs: [
      { q: "Is there a DoorDash alternative with no commission?",
        a: "Yes — Fee Free Ordering. Direct orders cost 0% in platform commission (only standard Stripe card fees), and the optional Fee Free Marketplace provides a DoorDash-style discovery channel at $3 max per order — about 5× cheaper than DoorDash's 30%." },
      { q: "Why do restaurants hate the DoorDash commission?",
        a: "On a $30 order, DoorDash takes $9 (30%), leaves you $21. Stripe takes another $1. After food cost (~35%) and labor (~25%), you might net $2. Fee Free's direct-order route leaves you the full $30 minus just the Stripe fee — usually $20+ in your pocket vs $2." },
    ],
  },
  {
    slug: "skip",
    name: "Skip / SkipTheDishes",
    brandColor: "#fa5023",
    category: "delivery_aggregator",
    tagline: "Skip alternative for Canadian restaurants",
    costSummary: "20-30% commission per order. Canada-only.",
    whatTheyAre: "A Canadian food-delivery aggregator owned by Just Eat Takeaway. Same model as UberEats / DoorDash — per-order commission, customer-facing app, restaurant has no contact info on customers.",
    whyFeeFree: [
      { title: "Canadian restaurants keep 100% of direct orders",
        body: "Fee Free Ordering is built in Ontario, Canada — same time zone, same banking system, instant CAD payouts via Stripe Connect. No more Skip's 20-30% commission on every order they send your way." },
      { title: "Same customers, way more margin",
        body: "The same person who orders pizza via Skip can order direct from your Fee Free page tomorrow. You keep the $9-15/order Skip would have taken." },
      { title: "Marketplace replaces Skip's discovery role",
        body: "Our feefreefood.com marketplace lists you with the same 'browse local restaurants' UX customers expect, at $3 max per order — Canadian dollars, Canadian tax, Canadian support." },
    ],
    comparison: [
      { feature: "Commission per order",                 feefree: "0% direct / $3 max marketplace",  competitor: "20-30%" },
      { feature: "Payout currency",                      feefree: "CAD direct to your Stripe",      competitor: "CAD (weekly batch)" },
      { feature: "Canadian tax handling",                feefree: "Built-in (HST/GST by province)", competitor: "Yes" },
      { feature: "Customer ownership",                   feefree: "Yours",                          competitor: "Skip's" },
    ],
    faqs: [
      { q: "What's a Canadian alternative to SkipTheDishes for restaurants?",
        a: "Fee Free Ordering — built in Ontario, supports HST/GST per province out of the box, payouts in CAD direct to your Stripe account, and 0% platform commission on direct orders. The optional marketplace at feefreefood.com gives you a Skip-style discovery channel at $3 max per order vs Skip's 20-30%." },
    ],
  },
  {
    slug: "foodpanda",
    name: "Foodpanda",
    brandColor: "#d70f64",
    category: "delivery_aggregator",
    tagline: "Foodpanda alternative",
    costSummary: "20-35% commission per order. International (Asia, Europe, Middle East).",
    whatTheyAre: "A Delivery Hero subsidiary operating in 50+ countries. Standard delivery-aggregator model with high per-order commissions.",
    whyFeeFree: [
      { title: "0% on direct orders, anywhere",
        body: "Fee Free Ordering runs on standard Stripe Connect — works in every country Stripe supports. Skip Foodpanda's 20-35% per-order cut on the customers you bring back." },
      { title: "Hosted in 5 languages (en/fr/es/it/pt)",
        body: "Customer ordering pages translate automatically. Your customers see the menu in their language without you doing extra work." },
    ],
    comparison: [
      { feature: "Commission per order",                 feefree: "0% on direct",                   competitor: "20-35%" },
      { feature: "Customer service fees",                feefree: "None",                           competitor: "Variable per market" },
      { feature: "Language support",                     feefree: "EN / FR / ES / IT / PT",         competitor: "30+ markets" },
    ],
    faqs: [
      { q: "Is there a Foodpanda alternative with lower fees?",
        a: "Fee Free Ordering — the core platform is free, you keep 100% of direct-order revenue, and the included marketplace charges at most $3 per order (vs Foodpanda's 20-35%)." },
    ],
  },
  // ─── POS-first / payment-first platforms ──────────────────────────
  {
    slug: "toast",
    name: "Toast",
    brandColor: "#ff4c00",
    category: "pos_first",
    tagline: "Toast online ordering alternative",
    costSummary: "Toast POS hardware + monthly software fee ($69-$165+/mo per terminal). Online ordering add-on extra.",
    whatTheyAre: "An all-in-one restaurant POS system with online ordering as one of many modules. Strong at in-restaurant operations; online ordering is competent but expensive to add on top of the base POS contract.",
    whyFeeFree: [
      { title: "No POS hardware required",
        body: "Fee Free Ordering runs in a web browser on any tablet — Android, iPad, Windows. Toast requires Toast-branded hardware (terminals + handhelds + kitchen display) at thousands of dollars upfront." },
      { title: "$0 to start vs. multi-year Toast contract",
        body: "Sign up at /signup and you're taking orders today. Toast contracts are typically 2-3 years with hardware leases, processing-fee lock-ins, and significant early-termination costs." },
      { title: "Best for restaurants that already have a POS",
        body: "Already running on Clover, Square, Lightspeed, or a legacy POS? Fee Free is an ordering layer on top — keep your POS, add online ordering for $0." },
    ],
    comparison: [
      { feature: "Hardware required",                    feefree: "None (any device with a browser)", competitor: "Toast POS terminals (paid)" },
      { feature: "Software cost / month",                feefree: "$0 core",                         competitor: "$69-$165+/mo per terminal" },
      { feature: "Contract length",                      feefree: "Month-to-month",                  competitor: "2-3 years typical" },
      { feature: "Card processing rate",                 feefree: "Stripe standard (2.9% + $0.30)", competitor: "Toast Payments (locked in)" },
      { feature: "Online ordering",                      feefree: "Core feature",                   competitor: "Toast Now add-on, extra cost" },
    ],
    faqs: [
      { q: "Can I use Toast for POS and Fee Free for online ordering?",
        a: "Yes — Fee Free Ordering is an independent online-ordering layer that doesn't replace your POS. Many restaurants pair it with Toast / Square / Clover to add online ordering without paying their POS provider's online module fee. Orders print to your existing kitchen receipt printer." },
    ],
  },
  {
    slug: "square-online-ordering",
    name: "Square Online Ordering",
    brandColor: "#3e4348",
    category: "pos_first",
    tagline: "Square Online Ordering alternative",
    costSummary: "Square POS + Square Online: Free tier exists with high processing fees, paid tiers $29-$79/mo.",
    whatTheyAre: "Square's online-ordering and website module bundled with their payment processing. Reasonably priced but you're locked into Square's payment ecosystem.",
    whyFeeFree: [
      { title: "Bring your own payment processor",
        body: "Fee Free uses Stripe Connect — you keep your existing Stripe account or open a new one in 5 minutes. Square Online forces you to use Square Payments at Square's rates." },
      { title: "Marketplace included",
        body: "Square has no marketplace — your only customers are people who already know your URL. Fee Free includes feefreefood.com discovery for new customers." },
    ],
    comparison: [
      { feature: "Payment processor",                    feefree: "Stripe (yours)",                 competitor: "Square Payments only" },
      { feature: "Marketplace discovery",                feefree: "Included",                       competitor: "None" },
      { feature: "Monthly cost",                         feefree: "$0 core + add-ons",              competitor: "$29-79/mo" },
    ],
    faqs: [
      { q: "Can I use Fee Free Ordering without Square?",
        a: "Yes — Fee Free Ordering uses Stripe for payments, not Square. If you're currently on Square's online ordering you can switch your menu over to Fee Free in an afternoon and keep your physical Square POS for in-store sales." },
    ],
  },
  // ─── Website builders with restaurant modules ─────────────────────
  {
    slug: "wix-restaurants",
    name: "Wix Restaurants",
    brandColor: "#0c6efc",
    category: "website_builder",
    tagline: "Wix Restaurants alternative",
    costSummary: "Wix Restaurants add-on requires Wix Business+ plan ($23-49/mo) + per-order fees on some tiers.",
    whatTheyAre: "Wix's restaurant-focused module — menu, ordering, reservations — built on top of the Wix website builder.",
    whyFeeFree: [
      { title: "Built FOR restaurants from day one",
        body: "Fee Free is restaurant-first — kitchen display, receipt printing, delivery zones, opening hours, prep-time logic are all native. Wix Restaurants is a module bolted on a general website builder; everything works but the depth isn't the same." },
      { title: "Embed in your existing site",
        body: "Already have a website (Wix, WordPress, Squarespace, Shopify, plain HTML)? Drop our snippet on your existing site and a 'See MENU & Order' button appears. No need to rebuild on a different platform." },
      { title: "0% commission, included marketplace",
        body: "Wix's marketplace doesn't exist. Fee Free Marketplace gets you in front of new customers without you paying Wix more." },
    ],
    comparison: [
      { feature: "Hosted website",                       feefree: "Optional $19.99/mo add-on",      competitor: "Required (Wix plan)" },
      { feature: "Restaurant-first features",            feefree: "Native",                         competitor: "Module on general builder" },
      { feature: "Embed on existing website",            feefree: "Yes (one-line snippet)",         competitor: "Wix-only" },
      { feature: "Marketplace included",                 feefree: "Yes",                            competitor: "No" },
    ],
    faqs: [
      { q: "Can I use Fee Free Ordering with my Wix website?",
        a: "Yes — paste our one-line snippet into your Wix site (Settings → Custom Code) and a 'See MENU & Order' button appears. Customers click it and order through Fee Free without leaving your Wix domain. No need to migrate off Wix." },
    ],
  },
  // ─── Reservation-focused platforms ────────────────────────────────
  {
    slug: "opentable",
    name: "OpenTable",
    brandColor: "#da3743",
    category: "reservations",
    tagline: "OpenTable alternative",
    costSummary: "$0-$249/mo + $0.25-$1.00 per cover (per-diner reservation fee).",
    whatTheyAre: "The dominant reservation platform for sit-down restaurants. Charges per-cover fees on top of monthly SaaS — small fees add up for high-volume restaurants.",
    whyFeeFree: [
      { title: "Reservations AND ordering in one platform",
        body: "Fee Free handles reservations, online ordering, kitchen display, customer database — one login, one bill. OpenTable is reservations-only; you'd still need a separate ordering platform." },
      { title: "Flat fee, no per-cover",
        body: "Reservations on Fee Free's Reservation Deposits add-on ($9.99/mo) cover unlimited reservations. OpenTable's per-cover fee scales with success — the more reservations you take, the more they charge." },
    ],
    comparison: [
      { feature: "Per-reservation fee",                  feefree: "$0",                              competitor: "$0.25-$1.00/cover" },
      { feature: "Includes online ordering",             feefree: "Yes",                            competitor: "No (separate platform)" },
      { feature: "Includes kitchen display",             feefree: "Yes",                            competitor: "No" },
      { feature: "Monthly cost",                         feefree: "$0 core + $9.99 reservations",   competitor: "$0-$249+ tier-dependent" },
    ],
    faqs: [
      { q: "Is there an OpenTable alternative without per-cover fees?",
        a: "Yes — Fee Free Ordering. Reservations are part of the platform (the Reservation Deposits add-on is $9.99/mo flat for unlimited reservations) and you get online ordering, kitchen display, and customer database in the same login." },
    ],
  },
  {
    slug: "resy",
    name: "Resy",
    brandColor: "#000000",
    category: "reservations",
    tagline: "Resy alternative",
    costSummary: "$249-$899/month per location depending on tier.",
    whatTheyAre: "American Express-owned reservation platform focused on upmarket restaurants. Strong CRM features for high-end hospitality.",
    whyFeeFree: [
      { title: "Reservations + ordering at a fraction of the cost",
        body: "Fee Free handles reservations AND ordering for less than Resy's lowest tier costs JUST for reservations. Great for restaurants that don't need the upmarket-curation positioning." },
    ],
    comparison: [
      { feature: "Monthly cost",                         feefree: "$0 core + $9.99 reservations",   competitor: "$249-$899" },
      { feature: "Includes online ordering",             feefree: "Yes",                            competitor: "No" },
      { feature: "Customer database",                    feefree: "Yes",                            competitor: "Yes (Resy CRM)" },
    ],
    faqs: [
      { q: "Is Resy expensive for small restaurants?",
        a: "For most independents, yes — Resy starts at $249/mo just for reservations. Fee Free Ordering handles reservations + online ordering + kitchen display + customer database for $0 base + $9.99/mo for the Reservation Deposits add-on if you want to take deposits on bookings." },
    ],
  },
  // ─── Niche / pizza-specific ───────────────────────────────────────
  {
    slug: "slice",
    name: "Slice",
    brandColor: "#0b1117",
    category: "ordering_platform",
    tagline: "Slice alternative for pizzerias",
    costSummary: "Free for restaurant owner; customer pays a per-order service fee.",
    whatTheyAre: "An ordering platform focused specifically on independent pizza shops. Free for the restaurant, monetized via customer-paid fees + premium tiers.",
    whyFeeFree: [
      { title: "Not pizza-only — full restaurant",
        body: "Fee Free supports every cuisine, menu structure, item modifier system. Plus we have full pizza-builder support (crust + size + toppings + half-and-half) for pizzerias specifically. Slice's whole product is pizza-shaped." },
      { title: "Owned platform, not a directory",
        body: "Your ordering page lives on YOUR domain or our subdomain. Slice routes everyone through slicelife.com, which means customers think of the order as a Slice order, not your order." },
      { title: "No customer-side fees",
        body: "Slice charges customers a 'service fee' that varies per order. Fee Free charges nothing on top of menu prices on your direct-order page." },
    ],
    comparison: [
      { feature: "Cuisine support",                      feefree: "All cuisines",                   competitor: "Pizza only" },
      { feature: "Customer pays platform fee",           feefree: "No",                             competitor: "Yes (variable)" },
      { feature: "Ordering on your domain",              feefree: "Yes",                            competitor: "Slicelife.com" },
    ],
    faqs: [
      { q: "Is there a Slice alternative that's not pizza-only?",
        a: "Fee Free Ordering — supports every cuisine, full pizza builder for pizzerias (crust + size + toppings + half-and-half), customer ordering happens on YOUR domain, and there's no customer-side service fee." },
    ],
  },
];

/** Get a competitor by slug or null if it doesn't exist. */
export function getCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}

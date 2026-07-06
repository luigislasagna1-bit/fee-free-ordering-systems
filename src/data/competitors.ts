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
  /** Optional event-driven notice rendered as an amber banner under the
   *  hero (e.g. "GloriaFood is shutting down — migration guide →").
   *  Must be FACTUAL + sourced; this is urgency, not FUD. 2026-07-05. */
  notice?: { text: string; href: string; linkLabel: string };
  /** Optional real-numbers pricing table, rendered as a dedicated section
   *  between the cost-summary cards and the "why switch" grid. Every existing
   *  entry omits it and renders byte-identical. RULE: never put OUR add-on
   *  dollar figures in `feefree` — quote our side as "$0", "0%", "First 100
   *  orders/mo free", "Optional add-on — see /pricing", or "No". Competitor
   *  side carries their real, sourced numbers with hedged phrasing (Luigi
   *  2026-07-06, COMPETITOR-TOWNCLUB-PLAN.md action #2). Canonical row order:
   *  Setup fee · Monthly cost · Commission on direct orders · Hidden /
   *  customer-side fees · Contract / commitment · Free to try (no demo call). */
  pricingTable?: {
    rows: { label: string; feefree: string; competitor: string | null }[];
    footnote?: string;
  };
};

const FEEFREE_CORE = "Free forever for direct orders. No per-order commission. Paid add-ons (Online Payments $29.99/mo, Hosted Website $19.99/mo, etc.) are optional, only when you need them.";

export const COMPETITORS: Competitor[] = [
  {
  "slug": "grubhub",
  "name": "GrubHub",
  "category": "delivery_aggregator",
  "tagline": "GrubHub alternative for restaurants",
  "costSummary": "As of 2026, GrubHub typically charges a per-order commission on a tiered marketing-plus-delivery model (Basic, Plus, Premium), per their published pricing — commonly in the mid-teens to roughly 30% of each order depending on tier and whether you self-deliver. There is generally no fixed monthly software fee, but the percentage applies to every order the marketplace sends you, so the cost compounds on repeat customers.",
  "whatTheyAre": "GrubHub is a US consumer-facing food-delivery marketplace. Restaurants list inside the GrubHub app and pay a per-order commission for the orders the platform routes to them, with the option to use GrubHub couriers or self-deliver at a lower rate.",
  "whyFeeFree": [
    {
      "title": "0% commission on direct orders, forever",
      "body": "On your own Fee Free Ordering page you keep the full menu price — no per-order percentage. Your first 100 orders every month are free, and beyond that you only ever add optional à-la-carte tools you choose. A regular who already loves you should not cost you a commission every time they reorder."
    },
    {
      "title": "The diner becomes your customer, not the marketplace's",
      "body": "Every Fee Free order drops the customer's name, contact and order history into your own built-in CRM, so you can run GrowthNet Autopilot win-back emails, SMS, coupons and Smart Links. On an aggregator the diner relationship and the data sit behind the platform's marketing wall."
    },
    {
      "title": "Run both — GrubHub for reach, Fee Free for repeat orders",
      "body": "These are not mutually exclusive. Keep your GrubHub listing for first-time discovery, then put a QR code on receipts and in delivery bags pointing to your Fee Free page. Regulars reorder direct at 0% and your commission bill shrinks as your direct share grows."
    },
    {
      "title": "Try it before you commit anything",
      "body": "Paste your existing menu link and Fee Free rebuilds the whole menu — sizes, modifier groups, photos — onto a live ordering page in seconds, with no signup required. You can see your own restaurant ordering before you decide to move a single order off GrubHub."
    }
  ],
  "comparison": [
    {
      "feature": "Commission on direct orders",
      "feefree": "0% (you keep the full menu price)",
      "competitor": "N/A — GrubHub is itself the order channel"
    },
    {
      "feature": "Free monthly orders",
      "feefree": "First 100 orders every month free",
      "competitor": "Per-order commission on every order (as of 2026)"
    },
    {
      "feature": "Customer data + contact info",
      "feefree": "Yours, in a built-in CRM",
      "competitor": "Typically held by the marketplace"
    },
    {
      "feature": "Win-back marketing to past diners",
      "feefree": "Built-in GrowthNet (Autopilot email + SMS, coupons)",
      "competitor": "Restricted to the platform's own promo tools"
    },
    {
      "feature": "Branded ordering page",
      "feefree": "Your name, colors and logo on pickup, delivery, dine-in, catering",
      "competitor": "A listing inside the GrubHub app"
    },
    {
      "feature": "Pricing model",
      "feefree": "Free core + optional à-la-carte add-ons",
      "competitor": "Tiered per-order commission (typically, as of 2026)"
    }
  ],
  "faqs": [
    {
      "q": "Is there a GrubHub alternative with no commission?",
      "a": "Yes. Fee Free Ordering charges 0% commission on direct orders placed through your own branded page, and your first 100 orders every month are free. You keep the full menu price instead of handing over a per-order percentage."
    },
    {
      "q": "How do restaurants lower their GrubHub fees?",
      "a": "The proven move is to stop paying a percentage where you don't have to. Stand up a free Fee Free ordering page, put a QR code on receipts and in delivery bags, and let regulars reorder direct at 0%. Keep GrubHub for first-time discovery while your commission-free direct share climbs."
    },
    {
      "q": "Can I keep my GrubHub listing and use Fee Free Ordering too?",
      "a": "Absolutely — most owners run both. GrubHub stays useful for reaching new diners, while Fee Free captures the repeat orders at zero commission and keeps each customer in your own database for future marketing."
    },
    {
      "q": "Does Fee Free Ordering run its own delivery drivers like GrubHub?",
      "a": "Fee Free gives you a delivery order type with your own zones, fees, ETAs and minimums, fulfilled by your own staff or driver. It does not operate a courier pool the way GrubHub does (a managed driver pool is coming soon) — in exchange you keep 100% of the order value today."
    }
  ]
},
  {
  "slug": "seamless",
  "name": "Seamless",
  "category": "delivery_aggregator",
  "tagline": "Seamless alternative for restaurants",
  "costSummary": "As of 2026, Seamless operates on the same marketplace-commission model as its sibling brand GrubHub, per their published pricing — a tiered per-order percentage rather than a flat software subscription. There is typically no standalone monthly fee, but every order the app sends you carries the percentage cut, which is felt most by busy New York spots with lots of repeat diners.",
  "whatTheyAre": "Seamless is a US food-ordering marketplace, especially well known in New York City, that operates as a GrubHub brand. For a restaurant it behaves like GrubHub: list inside the app and pay a per-order commission on the orders it brings you.",
  "whyFeeFree": [
    {
      "title": "Keep the whole ticket on direct orders",
      "body": "When a diner orders from your own Fee Free page you keep the full amount — there's no marketplace percentage skimmed off the top, and your first 100 orders each month are free. On a high-volume NYC menu that difference adds up fast."
    },
    {
      "title": "Own the regular instead of renting them",
      "body": "Seamless customers belong to the marketplace. With Fee Free, every order builds your own customer list with contact details and order history, so GrowthNet can market repeat business directly with Autopilot emails, SMS and coupons rather than you paying to reach the same person again."
    },
    {
      "title": "Layer Fee Free on top — don't rip Seamless out",
      "body": "Plenty of New York spots keep Seamless for the foot traffic it brings and add a Fee Free page for regulars. A QR code on the receipt nudges repeat orders to the 0% channel without you giving up the listing."
    },
    {
      "title": "A branded page that is unmistakably yours",
      "body": "Your Fee Free ordering page carries your own name, colors and logo across pickup, delivery, dine-in and catering, in any of 38 languages. On Seamless the order feels like a Seamless order; on Fee Free it feels like your restaurant."
    }
  ],
  "comparison": [
    {
      "feature": "Commission on direct orders",
      "feefree": "0% (full ticket is yours)",
      "competitor": "N/A — Seamless is itself the order channel"
    },
    {
      "feature": "Free monthly orders",
      "feefree": "First 100 orders every month free",
      "competitor": "Per-order commission applies (typically, as of 2026)"
    },
    {
      "feature": "Customer relationship",
      "feefree": "Yours — full CRM + order history",
      "competitor": "Typically held by Seamless / GrubHub"
    },
    {
      "feature": "Repeat-order marketing",
      "feefree": "Built-in GrowthNet (Autopilot email + SMS, coupons)",
      "competitor": "Marketplace promo tools only"
    },
    {
      "feature": "Branded ordering page",
      "feefree": "Your name, colors and logo; 38 languages",
      "competitor": "A listing inside the Seamless app"
    },
    {
      "feature": "Pricing model",
      "feefree": "Free core + optional à-la-carte add-ons",
      "competitor": "Tiered per-order commission (per published pricing)"
    }
  ],
  "faqs": [
    {
      "q": "What's the difference between Seamless and GrubHub for restaurants?",
      "a": "For a restaurant they are effectively the same system — Seamless is a GrubHub brand and, as of 2026, shares its tiered commission model. If you want to reduce that cut on repeat customers, a 0%-commission direct channel like Fee Free Ordering is the lever."
    },
    {
      "q": "Is there a Seamless alternative that doesn't take a percentage?",
      "a": "Yes. Fee Free Ordering charges 0% on direct orders through your own branded page, and your first 100 orders every month are free, so you keep the full menu price instead of a per-order percentage."
    },
    {
      "q": "Can I use Fee Free Ordering alongside my Seamless listing?",
      "a": "Yes — they coexist. Keep Seamless for reaching new diners and run a Fee Free page for regulars who reorder direct at zero commission. Many owners watch their direct-order share rise once they put a QR code on receipts."
    },
    {
      "q": "Will moving some orders to Fee Free hurt my Seamless presence?",
      "a": "Orders placed on your own Fee Free page are entirely separate from Seamless and don't touch your listing there. You simply move repeat business to a 0%-commission channel while Seamless keeps doing its discovery job."
    }
  ]
},
  {
  "slug": "just-eat",
  "name": "Just Eat",
  "category": "delivery_aggregator",
  "tagline": "Just Eat alternative for restaurants",
  "costSummary": "As of 2026, Just Eat typically charges a per-order commission that varies by country and by whether you self-deliver or use their courier network, per their published pricing, and historically there has often been a one-time joining fee. There is generally no fixed software subscription, but the commission applies to every order the marketplace sends you.",
  "whatTheyAre": "Just Eat is a food-ordering and delivery marketplace operating across the UK, Europe and other markets. Restaurants list inside the app and pay a per-order commission, with the option to self-deliver or use Just Eat's courier network at different rates.",
  "whyFeeFree": [
    {
      "title": "0% commission on orders you already earned",
      "body": "A customer who reorders their usual Friday curry shouldn't cost you a commission every single week. On your own Fee Free page that repeat order is 0%, and your first 100 orders every month are free — you keep the full menu price."
    },
    {
      "title": "Settles to your own account, in your own currency",
      "body": "Fee Free runs on Stripe, so payouts land in your own account in your local currency. Whether you're in the UK or elsewhere in Europe, your direct orders settle to you rather than via a marketplace batch."
    },
    {
      "title": "Your menu, your language, your brand",
      "body": "Your Fee Free ordering page carries your name and colors and renders automatically in 38 languages, including French. On Just Eat the order feels like a Just Eat order; on Fee Free it's unmistakably yours."
    },
    {
      "title": "Keep Just Eat for discovery, Fee Free for the margin",
      "body": "The two run side by side. Keep your Just Eat listing for first-time diners and add a Fee Free page with a QR code on bags and receipts, so regulars reorder direct at zero commission while your marketplace dependency naturally shrinks."
    }
  ],
  "comparison": [
    {
      "feature": "Commission on direct orders",
      "feefree": "0% (full ticket is yours)",
      "competitor": "N/A — Just Eat is itself the order channel"
    },
    {
      "feature": "Free monthly orders",
      "feefree": "First 100 orders every month free",
      "competitor": "Per-order commission applies (typically, as of 2026)"
    },
    {
      "feature": "Joining / activation fee",
      "feefree": "None",
      "competitor": "Often a one-time joining fee (per published terms)"
    },
    {
      "feature": "Customer data ownership",
      "feefree": "Yours — built-in CRM",
      "competitor": "Typically held by Just Eat"
    },
    {
      "feature": "Payout",
      "feefree": "Direct to your own account, in local currency",
      "competitor": "Marketplace batch payout"
    },
    {
      "feature": "Languages on the ordering page",
      "feefree": "38 languages, automatic (incl. French)",
      "competitor": "Per-market localisation"
    }
  ],
  "faqs": [
    {
      "q": "Is there a Just Eat alternative with lower fees for restaurants?",
      "a": "Yes. Fee Free Ordering charges 0% commission on direct orders through your own branded page, and your first 100 orders every month are free, so you keep the full menu price instead of a per-order percentage."
    },
    {
      "q": "How can I reduce my Just Eat commission?",
      "a": "Move repeat customers to a direct channel. Set up a free Fee Free ordering page, add a QR code to bags and receipts, and let regulars reorder at 0%. Keep Just Eat for new-customer discovery while your commission-free direct orders grow."
    },
    {
      "q": "Does Fee Free Ordering arrange delivery drivers like Just Eat?",
      "a": "Fee Free gives you a delivery order type with your own zones, fees, ETAs and minimums, fulfilled by your own staff or driver. It does not provide a courier network like Just Eat's today (managed dispatch is coming soon) — in exchange you keep the full order value."
    },
    {
      "q": "Can I keep my Just Eat listing and add Fee Free?",
      "a": "Yes — the two run side by side. Just Eat keeps bringing new diners while Fee Free handles repeat orders at zero commission and stores those customers in your own database for future marketing."
    }
  ]
},
  {
  "slug": "menufy",
  "name": "Menufy",
  "category": "ordering_platform",
  "tagline": "Menufy alternative",
  "costSummary": "As of 2026, Menufy markets itself as free to the restaurant with no monthly fee and is typically monetized through a customer-paid convenience or service fee added at checkout, plus standard card processing, per their published model. Terms can vary, so confirm current details with Menufy directly.",
  "whatTheyAre": "Menufy is a US online-ordering platform for independent restaurants that builds you an ordering site and menu. It is generally free for the restaurant, with revenue coming largely from a service or convenience fee charged to the customer at checkout.",
  "whyFeeFree": [
    {
      "title": "No customer-side fee on your direct page",
      "body": "Where Menufy commonly recovers its cost through a convenience fee added to the diner's total, Fee Free adds nothing on top of your menu prices on a direct order. A cleaner checkout total means fewer abandoned carts — and your first 100 orders every month are free."
    },
    {
      "title": "A real native kitchen app, not just an order feed",
      "body": "Fee Free's Kitchen Order App is native iOS and Android: new orders ring instantly even with the screen off, a missed order can phone-call the owner, and there's auto-accept with an accept countdown. Tickets print over WiFi to Star, Epson, Bixolon and Citizen receipt printers straight from the tablet."
    },
    {
      "title": "Built-in marketing and CRM, not just ordering",
      "body": "GrowthNet gives you Smart Links, QR codes, Autopilot win-back emails, SMS, a customer database and promotions/coupons in the same login as your ordering page — so you can actually bring diners back, not just take a single order."
    }
  ],
  "comparison": [
    {
      "feature": "Cost to the restaurant",
      "feefree": "Free core; first 100 orders/month free",
      "competitor": "Free to the restaurant (typically, as of 2026)"
    },
    {
      "feature": "Fee charged to the customer",
      "feefree": "None on direct orders",
      "competitor": "Often a customer convenience fee (per published model)"
    },
    {
      "feature": "Native kitchen app (rings screen-off)",
      "feefree": "Yes — iOS + Android, missed-order phone call",
      "competitor": "Order notifications"
    },
    {
      "feature": "WiFi thermal printing",
      "feefree": "Star, Epson, Bixolon, Citizen from the tablet",
      "competitor": "Varies"
    },
    {
      "feature": "Built-in marketing (email/SMS/CRM)",
      "feefree": "GrowthNet: Autopilot, Smart Links, coupons",
      "competitor": "Limited"
    },
    {
      "feature": "Menu import to try",
      "feefree": "Paste a link, live page in seconds, no signup",
      "competitor": "Setup via Menufy"
    }
  ],
  "faqs": [
    {
      "q": "Is Menufy really free for restaurants?",
      "a": "As of 2026 Menufy is generally free to the restaurant, but it commonly recovers its cost through a convenience fee charged to the customer at checkout. Fee Free Ordering is also free for the core platform, your first 100 orders each month are free, and there's no fee added to the customer's total on direct orders."
    },
    {
      "q": "What's a good Menufy alternative with no customer fees?",
      "a": "Fee Free Ordering. The core platform is free, direct orders add nothing on top of your menu prices, and you also get a native kitchen app, WiFi thermal printing and built-in marketing in the same place."
    },
    {
      "q": "Can I import my existing menu into Fee Free Ordering?",
      "a": "Yes. Paste your menu link and Fee Free rebuilds the full menu — sizes, crusts, modifier groups and photos — onto a live ordering page in seconds, with no signup required to try it first."
    },
    {
      "q": "Does Fee Free Ordering handle the kitchen side like a real system?",
      "a": "Yes. The native Kitchen Order App rings new orders instantly even with the screen off, can phone-call the owner on a missed order, supports auto-accept with a countdown, and prints tickets over WiFi to Star, Epson, Bixolon and Citizen printers."
    }
  ]
},
  {
  "slug": "flipdish",
  "name": "Flipdish",
  "category": "ordering_platform",
  "tagline": "Flipdish alternative",
  "costSummary": "As of 2026, Flipdish is typically sold through a sales-led, quote-based process and generally pairs a monthly subscription with a per-order or commission-style fee for branded website, app and kiosk packages, per their published model. Pricing is usually custom, so confirm current terms with Flipdish directly.",
  "whatTheyAre": "Flipdish is an online-ordering company that builds branded websites, apps and kiosks for restaurants and chains. It typically bundles ordering with a subscription and a per-order fee, and is often sold through a sales-led, quote-based process.",
  "whyFeeFree": [
    {
      "title": "Free core platform vs a quote-based subscription",
      "body": "Fee Free's core — admin, branded ordering page, native kitchen app and customer database — is free, and your first 100 orders each month are free. Flipdish, per its published model, typically pairs a monthly subscription with a per-order fee negotiated through sales."
    },
    {
      "title": "Self-serve in minutes, no sales call",
      "body": "Sign up, paste your menu link, and you have a live ordering page in seconds — with sizes, crusts, modifier groups and photos. There's no demo-then-quote cycle; you can try the import without even creating an account."
    },
    {
      "title": "Pay only for the add-ons you actually use",
      "body": "Instead of a bundled package, Fee Free lets you assemble exactly the stack you need from optional à-la-carte add-ons — you pay only for what you turn on. Custom domains and reservation deposits are on the roadmap (coming soon), while reservations and reserve-then-order are already live."
    }
  ],
  "comparison": [
    {
      "feature": "Base pricing model",
      "feefree": "Free core + optional à-la-carte add-ons",
      "competitor": "Subscription + per-order fee (custom quote, as of 2026)"
    },
    {
      "feature": "Free monthly orders",
      "feefree": "First 100 orders/month free",
      "competitor": "Per-order fee typically applies"
    },
    {
      "feature": "Onboarding",
      "feefree": "Self-serve; menu import in seconds, no signup to try",
      "competitor": "Typically sales-led, custom quote"
    },
    {
      "feature": "Native kitchen app (rings screen-off)",
      "feefree": "Yes — iOS + Android, missed-order call, auto-accept",
      "competitor": "App / terminal"
    },
    {
      "feature": "Built-in marketing + CRM",
      "feefree": "GrowthNet included (Autopilot, Smart Links, coupons)",
      "competitor": "Available, often packaged"
    },
    {
      "feature": "Try before you buy",
      "feefree": "Live ordering page from a pasted menu link, no account",
      "competitor": "Demo / sales process"
    }
  ],
  "faqs": [
    {
      "q": "How much does Flipdish cost compared to Fee Free Ordering?",
      "a": "As of 2026, Flipdish pricing is generally custom — typically a monthly subscription plus a per-order fee quoted by their sales team. Fee Free Ordering's core platform is free, your first 100 orders each month are free, and you only pay for the optional à-la-carte add-ons you choose."
    },
    {
      "q": "Is there a Flipdish alternative I can set up without a sales call?",
      "a": "Yes — Fee Free Ordering is fully self-serve. Paste your menu link and a live ordering page rebuilds in seconds, with sizes, crusts, modifier groups and photos, before you even create an account."
    },
    {
      "q": "Does Fee Free Ordering give me a branded ordering page like Flipdish?",
      "a": "Yes. Your ordering page carries your name, colors and logo, and supports pickup, delivery, dine-in and catering, each with their own fees and ETAs. Custom domains are coming soon; in the meantime you can keep your existing website and link your Fee Free page from its Order button."
    },
    {
      "q": "Can Fee Free Ordering handle multiple locations?",
      "a": "Yes — multi-location management is part of the platform, available as an optional add-on so a small group can run several sites while still starting from a free core platform."
    }
  ]
},
  {
  "slug": "owner-com",
  "name": "Owner.com",
  "category": "ordering_platform",
  "tagline": "Owner.com alternative",
  "pricingTable": {
    "rows": [
      { "label": "Setup fee", "feefree": "$0", "competitor": "~$800 one-time (per figures cited in published compare tables, as of 2026)" },
      { "label": "Monthly cost", "feefree": "$0 core + optional add-ons", "competitor": "~$500/mo (sales-quoted; not publicly published)" },
      { "label": "Commission on direct orders", "feefree": "0%", "competitor": "0% (per their published model)" },
      { "label": "Hidden / customer-side fees", "feefree": "None on direct orders", "competitor": "None claimed on direct orders" },
      { "label": "Contract / commitment", "feefree": "None — cancel anytime", "competitor": "Sales-led; term varies by quote" },
      { "label": "Free to try (no demo call)", "feefree": "Yes — paste your menu, live in seconds", "competitor": "No — demo/sales call to see pricing" }
    ],
    "footnote": "Owner.com does not publish a pricing page; the figures above come from third-party and competitor compare tables current as of 2026. Confirm live terms with Owner.com. Our numbers are public at /pricing."
  },
  "costSummary": "As of 2026, Owner.com is generally sold as a flat monthly subscription covering a branded website, online ordering, a mobile app and automated marketing, with no per-order commission, per their published model. Pricing is typically sales-led, so confirm current terms with Owner.com directly.",
  "whatTheyAre": "Owner.com is a platform that gives independent restaurants a branded website, online ordering, a mobile app and automated marketing under a flat monthly subscription with no per-order commission. It is typically sold through a sales/demo process.",
  "whyFeeFree": [
    {
      "title": "Free core platform vs a flat monthly subscription",
      "body": "Owner.com, per its published model, bundles its website, ordering and marketing into a flat monthly fee. Fee Free's core platform is free, your first 100 orders a month are free, and the same essentials — ordering, native kitchen app and CRM — cost nothing to start."
    },
    {
      "title": "À-la-carte, so you don't pay for the whole bundle",
      "body": "Want online card payments but not a hosted website? Turn on just what you need. Each piece is a separate optional add-on, so a single-location independent isn't paying for an enterprise bundle — you pay only for what you use."
    },
    {
      "title": "Try it before you ever talk to anyone",
      "body": "Paste your menu link and a live ordering page builds in seconds with no account and no demo call. Owner.com's onboarding is typically sales-led; Fee Free's is self-serve from the first click."
    },
    {
      "title": "Both are commission-free — Fee Free adds the operations depth",
      "body": "Like Owner.com, Fee Free takes 0% commission on direct orders. On top of that you get a native Kitchen Order App that rings even screen-off, can phone-call the owner on a missed order, and prints over WiFi to Star, Epson, Bixolon and Citizen printers."
    }
  ],
  "comparison": [
    {
      "feature": "Pricing model",
      "feefree": "Free core + optional à-la-carte add-ons",
      "competitor": "Flat monthly subscription (custom quote, as of 2026)"
    },
    {
      "feature": "Commission on direct orders",
      "feefree": "0%",
      "competitor": "0% (per published model)"
    },
    {
      "feature": "Free monthly orders",
      "feefree": "First 100 orders/month free",
      "competitor": "Included within the subscription"
    },
    {
      "feature": "Native kitchen app (rings screen-off)",
      "feefree": "Yes — iOS + Android, missed-order call, auto-accept",
      "competitor": "Order notifications"
    },
    {
      "feature": "Onboarding",
      "feefree": "Self-serve; instant menu import, no signup to try",
      "competitor": "Typically sales-led demo"
    },
    {
      "feature": "Built-in marketing + CRM",
      "feefree": "GrowthNet included (Autopilot, Smart Links, coupons)",
      "competitor": "Included in subscription"
    }
  ],
  "faqs": [
    {
      "q": "How does Owner.com pricing compare to Fee Free Ordering?",
      "a": "As of 2026, Owner.com is typically a flat monthly subscription covering a website, ordering, app and marketing. Fee Free Ordering's core is free with your first 100 orders/month free, and you add only the optional pieces you need — so a single-location restaurant usually pays less to start."
    },
    {
      "q": "Is Owner.com commission-free, and is Fee Free the same?",
      "a": "Both charge 0% commission on direct orders. The difference is the base cost: Owner.com bundles everything into a monthly subscription, while Fee Free's core platform is free and add-ons are optional and à-la-carte."
    },
    {
      "q": "Can I get a branded restaurant website with Fee Free like Owner.com offers?",
      "a": "Yes — a hosted branded ordering page is part of the platform, with optional add-ons available. You can also keep your existing website and simply link your free Fee Free ordering page from its menu or Order button. Custom domains are coming soon."
    },
    {
      "q": "Does Fee Free Ordering include marketing automation like Owner.com?",
      "a": "Yes. GrowthNet includes Autopilot win-back emails, SMS, Smart Links, QR codes, a customer database and promotions/coupons, all in the same login as your ordering page."
    }
  ]
},
  {
  "slug": "popmenu",
  "name": "Popmenu",
  "category": "ordering_platform",
  "tagline": "Popmenu alternative",
  "pricingTable": {
    "rows": [
      { "label": "Setup fee", "feefree": "$0", "competitor": "Varies by plan (sales-quoted)" },
      { "label": "Monthly cost", "feefree": "$0 core + optional add-ons", "competitor": "From ~$399/mo entry tier (per published pricing, as of 2026)" },
      { "label": "Commission on direct orders", "feefree": "0%", "competitor": "0% (per their model)" },
      { "label": "Hidden / customer-side fees", "feefree": "None on direct orders", "competitor": "None claimed on direct orders" },
      { "label": "Contract / commitment", "feefree": "None — cancel anytime", "competitor": "Often an annual term (confirm at quote)" },
      { "label": "Free to try (no demo call)", "feefree": "Yes — paste your menu, live in seconds", "competitor": "No — demo/sales call" }
    ],
    "footnote": "Popmenu pricing is tiered and largely sales-led; the ~$399/mo figure reflects commonly cited entry pricing as of 2026. Confirm live terms with Popmenu. Our numbers are public at /pricing."
  },
  "costSummary": "As of 2026, Popmenu is typically sold as a tiered monthly subscription for an interactive website, online ordering and marketing tools, with no per-order commission, per their published model. Pricing is generally sales-led, so confirm current terms with Popmenu directly.",
  "whatTheyAre": "Popmenu is a restaurant marketing and online-ordering platform known for interactive, dynamic menus, a branded website and automated marketing. It is generally sold as a tiered monthly subscription with no per-order commission, through a sales/demo process.",
  "whyFeeFree": [
    {
      "title": "Free core platform vs a tiered subscription",
      "body": "Popmenu's interactive website and marketing come, per its published model, as a tiered monthly subscription. Fee Free's core — branded ordering page, native kitchen app and customer database — is free, with your first 100 orders each month free."
    },
    {
      "title": "Operations depth, not just a polished menu",
      "body": "Beyond an attractive ordering page, Fee Free ships a native Kitchen Order App that rings new orders even screen-off, can phone-call the owner on a missed order, and prints tickets over WiFi to Star, Epson, Bixolon and Citizen printers — the back-of-house side a marketing-first tool can leave thin."
    },
    {
      "title": "Marketing included without the bundle price",
      "body": "GrowthNet gives you Smart Links, QR codes, Autopilot win-back emails, SMS, a CRM and promotions/coupons inside the free core, so you get automated marketing without committing to a tiered subscription up front."
    },
    {
      "title": "Try the menu import with no demo",
      "body": "Paste your menu link and a live, photo-rich ordering page builds in seconds — no account, no sales call. You can see your own menu working before deciding anything."
    }
  ],
  "comparison": [
    {
      "feature": "Pricing model",
      "feefree": "Free core + optional à-la-carte add-ons",
      "competitor": "Tiered monthly subscription (custom quote, as of 2026)"
    },
    {
      "feature": "Commission on direct orders",
      "feefree": "0%",
      "competitor": "0% (per published model)"
    },
    {
      "feature": "Free monthly orders",
      "feefree": "First 100 orders/month free",
      "competitor": "Included within the subscription"
    },
    {
      "feature": "Native kitchen app (rings screen-off)",
      "feefree": "Yes — iOS + Android, missed-order call, auto-accept",
      "competitor": "Order notifications"
    },
    {
      "feature": "Built-in marketing + CRM",
      "feefree": "GrowthNet included in the free core",
      "competitor": "Core to the subscription"
    },
    {
      "feature": "Onboarding",
      "feefree": "Self-serve; instant menu import, no signup to try",
      "competitor": "Typically sales-led demo"
    }
  ],
  "faqs": [
    {
      "q": "How much does Popmenu cost versus Fee Free Ordering?",
      "a": "As of 2026, Popmenu is typically a tiered monthly subscription quoted by sales. Fee Free Ordering's core platform is free, your first 100 orders each month are free, and marketing tools come built in — so most independents pay less to start."
    },
    {
      "q": "Is there a Popmenu alternative with strong kitchen and ordering tools?",
      "a": "Yes — Fee Free Ordering. Alongside a branded ordering page it includes a native Kitchen Order App that rings new orders even with the screen off, can phone-call the owner on a missed order, and prints over WiFi to Star, Epson, Bixolon and Citizen printers."
    },
    {
      "q": "Does Fee Free Ordering include marketing automation like Popmenu?",
      "a": "Yes. GrowthNet bundles Autopilot win-back emails, SMS, Smart Links, QR codes, a customer database and promotions/coupons into the free core platform, so automated marketing doesn't require a separate subscription."
    },
    {
      "q": "Can I keep my current website and still use Fee Free Ordering?",
      "a": "Yes. Keep your existing site and add a free Fee Free branded ordering page, then link it from your site's menu or Order button — or embed the free ordering widget directly. There's nothing to install in your CMS and 0% commission on direct orders."
    }
  ]
},
  // ─── Peer ordering platforms ──────────────────────────────────────
  {
    slug: "gloriafood",
    name: "GloriaFood",
    brandColor: "#1d2935",
    category: "ordering_platform",
    tagline: "GloriaFood alternative",
    costSummary: "Free core platform, paid add-ons for SMS / promo automation / hosted site (typically $9–29/mo each). Note: Oracle has announced end-of-life for the entire GloriaFood product line — last day of service April 30, 2027.",
    whatTheyAre: "A free zero-commission online ordering system for independent restaurants, owned by Oracle since 2018. Strong feature set for ordering + table reservations — but Oracle has announced the product line's end-of-life, with a last day of service of April 30, 2027 and no data retention afterwards.",
    notice: {
      text: "Oracle is shutting GloriaFood down: last day of service April 30, 2027, no data retention afterwards, and no replacement product.",
      href: "/gloriafood-alternative",
      linkLabel: "Read the migration guide — import your menu free",
    },
    whyFeeFree: [
      { title: "Automated GloriaFood menu import — photos included",
        body: "Paste your GloriaFood ordering link and your entire menu is recreated automatically: categories, items, size variants and every modifier group and option (a verified production import moved 12,653 modifier options in 1.2 seconds), with food photos transferred in the background. No retyping, and you can preview your live page before creating an account." },
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
      { feature: "Languages supported",                  feefree: "38 languages",         competitor: "20+ (Oracle scale)" },
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
    pricingTable: {
      rows: [
        { label: "Setup fee", feefree: "$0", competitor: "One-time setup fee (often cited ~$399, as of 2026)" },
        { label: "Monthly cost", feefree: "$0 core + optional add-ons", competitor: "~$150–199/mo per location (per published pricing)" },
        { label: "Commission on direct orders", feefree: "0%", competitor: "0% to the restaurant" },
        { label: "Hidden / customer-side fees", feefree: "None on direct orders", competitor: "7% \"Support Local Fee\" charged to diners on ChowNow app/marketplace orders" },
        { label: "Contract / commitment", feefree: "None — cancel anytime", competitor: "Monthly SaaS; confirm term at signup" },
        { label: "Free to try (no demo call)", feefree: "Yes — paste your menu, live in seconds", competitor: "No — sales call to activate" },
      ],
      footnote: "ChowNow's 7% diner-side \"Support Local Fee\" applies to orders through ChowNow's own app/marketplace, not necessarily your embedded direct widget — confirm which of your orders it touches. Figures as of 2026; our numbers are public at /pricing.",
    },
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
    pricingTable: {
      rows: [
        { label: "Setup fee", feefree: "$0", competitor: "$0 to join (activation may apply)" },
        { label: "Monthly cost", feefree: "$0 core + optional add-ons", competitor: "$0 fixed — but 15–30% per order" },
        { label: "Commission on direct orders", feefree: "0% (Stripe card fees only)", competitor: "15–30% per order (plan-dependent)" },
        { label: "Hidden / customer-side fees", feefree: "None on direct orders", competitor: "Diner delivery + service fees on every order" },
        { label: "Contract / commitment", feefree: "None — cancel anytime", competitor: "Plan-based; higher placement = higher tier" },
        { label: "Free to try (no demo call)", feefree: "Yes — paste your menu, live in seconds", competitor: "Marketplace onboarding, not self-serve ordering software" },
      ],
      footnote: "DoorDash is a delivery marketplace, not direct ordering software — the comparison is direct-ordering economics vs marketplace commission. Commission tiers as of 2026; our numbers are public at /pricing.",
    },
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
      { title: "Hosted in 38 languages",
        body: "Customer ordering pages translate automatically. Your customers see the menu in their language without you doing extra work." },
    ],
    comparison: [
      { feature: "Commission per order",                 feefree: "0% on direct",                   competitor: "20-35%" },
      { feature: "Customer service fees",                feefree: "None",                           competitor: "Variable per market" },
      { feature: "Language support",                     feefree: "38 languages",         competitor: "30+ markets" },
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
  {
    slug: "bentobox",
    name: "BentoBox",
    brandColor: "#d5451f",
    category: "website_builder",
    tagline: "BentoBox alternative",
    costSummary: "BentoBox is a restaurant website and commerce platform (owned by Fiserv) sold as a monthly subscription for a designed hospitality website with online ordering, catering and gift cards. Pricing is sales-led and not fully published, and some capabilities such as loyalty have been offered as paid add-ons cited around $199/mo extra, so confirm current terms with BentoBox directly.",
    whatTheyAre: "BentoBox is a design-led restaurant website and online-ordering platform, now part of Fiserv, aimed at restaurants that want a polished branded website with ordering, events, catering and gift cards. It is sold as a monthly subscription through a sales process.",
    pricingTable: {
      rows: [
        { label: "Setup fee", feefree: "$0", competitor: "Onboarding/design fee (sales-quoted)" },
        { label: "Monthly cost", feefree: "$0 core + optional add-ons", competitor: "Monthly subscription (sales-quoted; not fully published)" },
        { label: "Commission on direct orders", feefree: "0%", competitor: "Low/none per their model; payment processing separate" },
        { label: "Hidden / customer-side fees", feefree: "None on direct orders", competitor: "Loyalty offered as a paid add-on cited around +$199/mo" },
        { label: "Contract / commitment", feefree: "None — cancel anytime", competitor: "Typically an annual term (confirm at quote)" },
        { label: "Free to try (no demo call)", feefree: "Yes — paste your menu, live in seconds", competitor: "No — demo/sales call" },
      ],
      footnote: "BentoBox pricing is sales-led; the +$199/mo loyalty add-on figure reflects commonly cited terms as of 2026. Confirm live terms with BentoBox. Our numbers are public at /pricing.",
    },
    whyFeeFree: [
      { title: "Free core platform vs a sales-quoted subscription",
        body: "BentoBox is a monthly subscription for a designed website and ordering, sold through a demo. Fee Free's core — branded ordering page, native Kitchen Order App and CRM — is free, with your first 100 orders each month free and every price public at /pricing." },
      { title: "Loyalty is built in, not a $199/mo add-on",
        body: "Promotions, VIP assignment, Reward Dollars store credit, automations and sign-up bonuses come inside the platform. BentoBox has offered loyalty as a paid add-on cited around +$199/mo on top of the base subscription." },
      { title: "Kitchen hardware BentoBox doesn't cover",
        body: "Fee Free's native Kitchen Order App rings orders even with the phone locked, auto-accepts, phone-calls the owner on a missed order, and prints over WiFi to Star, Epson, Bixolon and Citizen printers. A website-first platform typically leaves this to your POS." },
      { title: "38 languages + reserve-then-order",
        body: "Your ordering page speaks 38 languages, and customers can book a table, pre-order and pay a deposit in one checkout — reach and a combined booking flow a US-focused website builder doesn't offer." },
      { title: "Self-serve, public pricing, keep-your-site option",
        body: "Paste your menu and go live in minutes, or keep any existing site and embed our free ordering widget. No demo call to see the price." },
      { title: "Where BentoBox is genuinely strong",
        body: "BentoBox makes genuinely beautiful, hospitality-grade websites, with strong events, catering and gift-card tooling and Fiserv-backed payments — if a designer-quality marketing site is your priority and the subscription fits, they're a strong pick. Fee Free's edge is a free core, built-in loyalty, deep kitchen tooling, 38-language support and public pricing." },
    ],
    comparison: [
      { feature: "Pricing model", feefree: "Free core + optional à-la-carte add-ons", competitor: "Monthly subscription (sales-quoted)" },
      { feature: "Published pricing", feefree: "Yes — public at /pricing", competitor: "No — demo/sales call" },
      { feature: "Commission on direct orders", feefree: "0%", competitor: "Low/none per their model" },
      { feature: "Loyalty / rewards", feefree: "Built in (Reward Dollars, VIP, automations)", competitor: "Paid add-on (cited ~+$199/mo)" },
      { feature: "Native kitchen app (rings phone-locked)", feefree: "Yes — iOS + Android, missed-order call, thermal print", competitor: "Not a focus (POS-dependent)" },
      { feature: "Languages", feefree: "38 languages", competitor: "English-first" },
      { feature: "Reserve-then-order (book + pre-order + deposit)", feefree: "Yes — one checkout", competitor: "Reservations/events tooling" },
      { feature: "Onboarding", feefree: "Self-serve; instant menu import, no signup to try", competitor: "Sales-led design/onboarding" },
    ],
    faqs: [
      { q: "How does BentoBox pricing compare to Fee Free Ordering?", a: "BentoBox is a sales-quoted monthly subscription for a designed website and ordering, with loyalty offered as a paid add-on cited around +$199/mo. Fee Free Ordering's core is free with your first 100 orders/month free, loyalty built in, and all pricing public at /pricing — usually far less to start for an independent." },
      { q: "Does Fee Free include loyalty like BentoBox's add-on?", a: "Yes, in the platform: promotions, VIP assignment, Reward Dollars store credit, automations and sign-up bonuses — no separate loyalty subscription. BentoBox has offered loyalty as a paid add-on cited around +$199/mo." },
      { q: "Can I keep a BentoBox-style website and still use Fee Free Ordering?", a: "Yes. Keep any existing site and embed the free Fee Free ordering widget, or link your free branded ordering page from your menu or Order button. Nothing to install, 0% commission on direct orders, and pricing is public at /pricing." },
    ],
  },
  {
    slug: "spothopper",
    name: "SpotHopper",
    brandColor: "#2f6df6",
    category: "website_builder",
    tagline: "SpotHopper alternative",
    costSummary: "SpotHopper is an all-in-one restaurant marketing, website and booking platform sold as a monthly subscription, often on an annual contract, through a sales/demo process. Pricing is not publicly published and is quoted per restaurant, so confirm current terms with SpotHopper directly.",
    whatTheyAre: "SpotHopper is an all-in-one marketing, website, email/social and reservations suite for restaurants, sold as a managed monthly subscription — typically on an annual contract via a sales team, with pricing quoted per restaurant.",
    pricingTable: {
      rows: [
        { label: "Setup fee", feefree: "$0", competitor: "Setup/onboarding fee (sales-quoted)" },
        { label: "Monthly cost", feefree: "$0 core + optional add-ons", competitor: "Monthly subscription, sales-quoted (not published)" },
        { label: "Commission on direct orders", feefree: "0%", competitor: "Model varies; confirm at quote" },
        { label: "Hidden / customer-side fees", feefree: "None on direct orders", competitor: "None claimed; processing separate" },
        { label: "Contract / commitment", feefree: "None — cancel anytime", competitor: "Commonly an annual contract" },
        { label: "Free to try (no demo call)", feefree: "Yes — paste your menu, live in seconds", competitor: "No — demo/sales call" },
      ],
      footnote: "SpotHopper does not publish pricing and is typically sold on an annual contract; terms are quoted per restaurant as of 2026. Confirm live terms with SpotHopper. Our numbers are public at /pricing.",
    },
    whyFeeFree: [
      { title: "Free core vs a managed annual subscription",
        body: "SpotHopper is a managed monthly subscription, usually on an annual contract sold through a demo. Fee Free's core is free, your first 100 orders each month are free, there's no contract, and every price is public at /pricing." },
      { title: "No annual lock-in",
        body: "Cancel anytime — the core platform is free and add-ons are month-to-month. SpotHopper is commonly sold on an annual commitment, so confirm the term before you sign." },
      { title: "Ordering + kitchen depth, not just marketing",
        body: "Fee Free is built around taking and running orders: a native Kitchen Order App that rings even with the phone locked, auto-accept, missed-order phone call, and WiFi thermal printing to Star, Epson, Bixolon and Citizen — plus reserve-then-order in one checkout. SpotHopper leads with marketing and websites." },
      { title: "38 languages + true white-label",
        body: "Your ordering page speaks 38 languages, and on a verified custom domain it carries zero Fee Free branding — reach and ownership a managed marketing suite typically doesn't provide." },
      { title: "Self-serve and transparent",
        body: "See the price and try it yourself: paste your menu and a live ordering page builds in seconds, no demo call, no quote required to learn what it costs." },
      { title: "Where SpotHopper is genuinely strong",
        body: "SpotHopper's done-for-you marketing — websites, email, social, review and reservations management handled by their team — is a real draw for owners who want to hand marketing off entirely and are comfortable with an annual contract. Fee Free's edge is a free core, no lock-in, deep kitchen/ordering tooling, 38 languages and fully public pricing." },
    ],
    comparison: [
      { feature: "Pricing model", feefree: "Free core + optional à-la-carte add-ons", competitor: "Managed monthly subscription (sales-quoted)" },
      { feature: "Published pricing", feefree: "Yes — public at /pricing", competitor: "No — demo/sales call" },
      { feature: "Contract", feefree: "None — cancel anytime", competitor: "Commonly annual" },
      { feature: "Commission on direct orders", feefree: "0%", competitor: "Model varies (confirm at quote)" },
      { feature: "Native kitchen app (rings phone-locked)", feefree: "Yes — iOS + Android, missed-order call, thermal print", competitor: "Not a focus" },
      { feature: "Languages", feefree: "38 languages", competitor: "English-first" },
      { feature: "Reserve-then-order (book + pre-order + deposit)", feefree: "Yes — one checkout", competitor: "Reservations tooling" },
      { feature: "Onboarding", feefree: "Self-serve; instant menu import, no signup to try", competitor: "Managed, sales-led" },
    ],
    faqs: [
      { q: "How does SpotHopper pricing compare to Fee Free Ordering?", a: "SpotHopper doesn't publish pricing and is typically sold as a managed monthly subscription on an annual contract via a demo. Fee Free Ordering's core is free with your first 100 orders/month free, no contract, and all pricing public at /pricing." },
      { q: "Is there a SpotHopper alternative without an annual contract?", a: "Yes — Fee Free Ordering. The core platform is free, add-ons are month-to-month, and you can cancel anytime. You also get ordering-and-kitchen depth SpotHopper's marketing-first suite doesn't emphasize: locked-phone ring, missed-order phone call and WiFi thermal printing." },
      { q: "Does Fee Free do marketing like SpotHopper?", a: "Fee Free includes GrowthNet — win-back email/SMS automation, Smart Links, QR codes, a CRM and promotions — built into the free core. It's more self-serve than SpotHopper's fully-managed service, but there's no annual contract and the pricing is public." },
    ],
  },
  {
    slug: "town",
    name: "Town",
    brandColor: "#111827",
    category: "ordering_platform",
    tagline: "Town (town.club) alternative",
    costSummary: "Town is a US restaurant ordering and loyalty platform (a Texas rebrand of the BlueVerse deals app) sold at a flat $300/mo through a demo-only funnel with no published pricing page. Their own competitor compare table lists a $500 setup fee while their blog claims no setup fees, so confirm current terms with Town directly.",
    whatTheyAre: "Town (town.club) is a US, English-only restaurant ordering, marketing and loyalty platform — a Texas rebrand of the BlueVerse consumer deals app. Storefronts run on town.club subdomains with a \"Powered by\" footer, and pricing is shown only through a booked demo.",
    notice: {
      text: "Town publishes no pricing page and sells through a demo. Their own competitor compare table lists a $500 setup fee while their blog says there are no setup fees — confirm in writing before signing.",
      href: "/pricing",
      linkLabel: "See our public pricing instead",
    },
    pricingTable: {
      rows: [
        { label: "Setup fee", feefree: "$0", competitor: "$0 per their blog, but $500 per their own compare table (contradiction, as of 2026)" },
        { label: "Monthly cost", feefree: "$0 core + optional add-ons", competitor: "$300/mo flat (shown only via demo; no pricing page)" },
        { label: "Commission on direct orders", feefree: "0%", competitor: "0% per their model" },
        { label: "Hidden / customer-side fees", feefree: "None on direct orders", competitor: "None claimed" },
        { label: "Contract / commitment", feefree: "None — cancel anytime", competitor: "Demo-quoted; confirm term" },
        { label: "Free to try (no demo call)", feefree: "Yes — paste your menu, live in seconds", competitor: "No — demo-only funnel" },
      ],
      footnote: "Town does not publish a pricing page; the $300/mo and $500 setup figures are from their demo funnel and their own competitor compare table respectively (as of 2026), and their setup-fee claims contradict each other. Confirm live terms with Town. Our numbers are public at /pricing.",
    },
    whyFeeFree: [
      { title: "Public flat pricing vs a demo-only funnel",
        body: "Town shows pricing only after a booked demo and has no pricing page — and its own compare table lists a $500 setup fee that its blog denies. Fee Free's core is free, your first 100 orders each month are free, and every number is public at /pricing with no demo required." },
      { title: "True white-label vs town.club subdomains",
        body: "On a verified custom domain your Fee Free ordering page carries zero platform branding. Town's storefronts run on town.club subdomains with a \"Powered by\" footer, so the platform's brand stays on your customer's screen." },
      { title: "38 languages vs English-only",
        body: "Fee Free speaks 38 languages out of the box — a real advantage even in Texas, where many diners are Spanish-first. Town is US and English-only." },
      { title: "Kitchen hardware Town never mentions",
        body: "Fee Free's native Kitchen Order App rings orders even with the phone locked (Android + iOS), auto-accepts, phone-calls the owner on a missed order, and prints over WiFi to Star, Epson, Bixolon and Citizen printers. Town's marketing doesn't cover the kitchen at all." },
      { title: "Deeper loyalty, promotions and reserve-then-order",
        body: "Visible and hidden promos, VIP assignment, Reward Dollars store credit, automations and sign-up bonuses — plus book-a-table + pre-order + deposit in one checkout, and a half/half pizza builder. Town offers basic points loyalty." },
      { title: "Where Town is genuinely strong",
        body: "Town's marketing craft is genuinely sharp — enemy-first messaging against the delivery apps, outcome-as-headline testimonials and an interactive savings calculator that lands. If polished, numbers-driven copy is what wins you over, they do that well. What's underneath is thinner: no published pricing, town.club subdomains, English-only, and a half-finished site — where Fee Free is deeper on kitchen tooling, languages, white-label and transparent pricing." },
    ],
    comparison: [
      { feature: "Published pricing", feefree: "Yes — public at /pricing", competitor: "No — demo-only funnel" },
      { feature: "Monthly cost", feefree: "$0 core + optional add-ons", competitor: "$300/mo flat (via demo)" },
      { feature: "Setup fee", feefree: "$0", competitor: "$0 (blog) vs $500 (their compare table) — contradiction" },
      { feature: "Commission on direct orders", feefree: "0%", competitor: "0% per their model" },
      { feature: "True white-label on custom domain", feefree: "Yes — zero platform branding", competitor: "town.club subdomain + \"Powered by\"" },
      { feature: "Languages", feefree: "38 languages", competitor: "English-only" },
      { feature: "Native kitchen app (rings phone-locked)", feefree: "Yes — iOS + Android, missed-order call, thermal print", competitor: "Not mentioned" },
      { feature: "Loyalty / promotions depth", feefree: "Reward Dollars, VIP, visible/hidden promos, automations", competitor: "Basic points" },
      { feature: "Reserve-then-order (book + pre-order + deposit)", feefree: "Yes — one checkout", competitor: "Basic reservations" },
      { feature: "Availability", feefree: "Built in Canada; CAD/GST-correct; global", competitor: "US / Texas, English-only" },
    ],
    faqs: [
      { q: "How much does Town (town.club) cost?", a: "Town is sold at a flat $300/mo through a demo — it has no published pricing page — and its own competitor compare table lists a $500 setup fee while its blog says there are no setup fees. Fee Free Ordering's core is free with your first 100 orders/month free and all pricing public at /pricing." },
      { q: "Is there a Town alternative with public pricing and no demo?", a: "Yes — Fee Free Ordering. Pricing is fully public at /pricing, you can paste your menu and go live in minutes with no demo call, the core is free, and you get true white-label on your own domain instead of a town.club subdomain." },
      { q: "What does Fee Free Ordering do that Town doesn't?", a: "A native Kitchen Order App that rings even with the phone locked, missed-order phone call and WiFi thermal printing; 38 languages versus English-only; true white-label versus town.club subdomains; and deeper promotions, Reward Dollars loyalty and reserve-then-order — all on public pricing." },
    ],
  },
];

/** Get a competitor by slug or null if it doesn't exist. */
export function getCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}

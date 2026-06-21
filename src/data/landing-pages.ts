/**
 * Programmatic SEO landing pages — "Online ordering for {pizzerias / sushi
 * restaurants / …}". Rendered by src/app/online-ordering-for/[slug]/page.tsx,
 * statically generated at build time, listed in the sitemap, and cross-linked.
 *
 * Strategy (Luigi 2026-06-21): capture high-intent organic search like
 * "pizza online ordering system" / "online ordering for restaurants" and funnel
 * it into the import-to-try wedge (/import) + signup. Mirrors the proven
 * /vs/[slug] engine (SSG + JSON-LD + cross-links).
 *
 * ENGLISH-ONLY by design — same established exception as the /vs pages. The
 * product UI is fully 38-locale; these acquisition pages are not.
 *
 * Substantive, NOT thin: each page has a unique cuisine-specific intro, pain
 * point, benefits, and FAQ. Every claim maps to a SHIPPED feature (0% commission,
 * free for the first 100 orders/mo, GloriaFood import, Kitchen Order App, WiFi
 * thermal printing, reservations, GrowthNet marketing). Start small + real
 * (8 pages) — do NOT mass-generate hundreds of near-duplicates (Google penalty).
 */

export interface LandingBenefit {
  title: string;
  body: string;
}
export interface LandingFaq {
  q: string;
  a: string;
}
export interface LandingPage {
  slug: string;
  /** Singular lowercase noun: "pizzeria". */
  noun: string;
  /** Plural noun: "pizzerias" — used in the H1 "Online ordering for {nounPlural}". */
  nounPlural: string;
  /** The dish word, for "every {food} order". */
  food: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Short uppercase-styled eyebrow above the H1. */
  eyebrow: string;
  /** 2–3 sentence hero intro. */
  intro: string;
  painPoint: LandingBenefit;
  benefits: LandingBenefit[];
  faqs: LandingFaq[];
}

export const LANDING_PAGES: LandingPage[] = [
  {
    slug: "pizza",
    noun: "pizzeria",
    nounPlural: "pizzerias",
    food: "pizza",
    metaTitle: "Online Ordering for Pizzerias — 0% Commission | Fee Free Ordering",
    metaDescription:
      "A commission-free online ordering system built for pizzerias: every size, crust, and topping group imported perfectly from your GloriaFood menu. Keep 100% of every pizza order.",
    h1: "Online ordering for pizzerias",
    eyebrow: "Built for pizza",
    intro:
      "Pizza is the most-ordered food online — and the most punished by delivery-app commissions. Fee Free Ordering gives your pizzeria its own branded ordering page where pickup, delivery, and catering orders cost you 0% commission. Your sizes, crusts, and topping groups come across exactly right, because we built the import on a real 12,000-option pizzeria menu.",
    painPoint: {
      title: "Commissions eat your thinnest margins",
      body: "A large pizza nets a few dollars after dough, cheese, and labour — then a marketplace takes 20–30% and the order is barely worth making. Direct orders on your own page keep that margin where it belongs: with you.",
    },
    benefits: [
      {
        title: "Your toppings, sizes & crusts — imported perfectly",
        body: "Most importers flatten Small/Medium/Large into separate products and drop modifier groups. Ours folds sizes into one product with a selector and keeps every 'pick your toppings' group — pick-any-amount included. Paste your GloriaFood link and see it live in seconds.",
      },
      {
        title: "Friday-night rushes, handled",
        body: "Orders ring on the Kitchen Order App the instant they land — even with the screen off — and print straight to a WiFi thermal receipt printer. Miss one and it can call your phone. No tablet babysitting on your busiest night.",
      },
      {
        title: "Turn one-time customers into regulars",
        body: "Every pizza order builds YOUR customer list, not a marketplace's. GrowthNet's Smart Links, QR codes on the box, and Autopilot win-back offers bring them back to order direct — commission-free — next time.",
      },
    ],
    faqs: [
      {
        q: "Can it handle pizza sizes and 'choose any toppings'?",
        a: "Yes — this is exactly what we built it for. Sizes fold into one product with a size selector (not separate listings), and 'pick any toppings' groups import with no artificial limit. We verified it on a real pizzeria menu with over 12,000 topping options.",
      },
      {
        q: "How do I move my menu over?",
        a: "Paste your existing GloriaFood menu link on our import page and we rebuild it — every pizza, size, crust, topping group, and photo — on a live ordering page in seconds. No account needed to see it. Like it? Claim it and it's yours.",
      },
      {
        q: "What does it cost a pizzeria?",
        a: "0% commission on every direct order, and free for your first 100 orders each month. Need card payments online or more orders? Add only the à-la-carte add-ons you want. No contracts.",
      },
      {
        q: "Does delivery work?",
        a: "Yes — offer pickup, delivery, dine-in, and catering, each with its own fees, ETAs, and minimums. You can use your own drivers or our driver-pool add-on. You keep 100% of the food total on direct orders either way.",
      },
    ],
  },
  {
    slug: "sushi",
    noun: "sushi restaurant",
    nounPlural: "sushi restaurants",
    food: "sushi",
    metaTitle: "Online Ordering for Sushi Restaurants — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering for sushi restaurants: à-la-carte rolls, combos, and platters, plus table reservations. Keep 100% of every order and own your customers.",
    h1: "Online ordering for sushi restaurants",
    eyebrow: "Built for sushi",
    intro:
      "Sushi sells on presentation and freshness — neither of which survives a 30% marketplace cut. Fee Free Ordering gives your restaurant a branded page where à-la-carte rolls, combo boats, and platters are easy to order for pickup or delivery, and where you can take table reservations too. 0% commission on every direct order.",
    painPoint: {
      title: "Premium product, discount margins",
      body: "Quality fish is expensive and perishable. Handing a third of each ticket to a delivery app turns your best sellers into break-even orders. Direct ordering protects the margin on the dishes you're proudest of.",
    },
    benefits: [
      {
        title: "Combos & platters that are easy to order",
        body: "Build combo boats and party platters with clean modifier groups (choose your rolls, add-ons, sauces). Imported straight from your GloriaFood menu with photos, so customers order the big-ticket items with confidence.",
      },
      {
        title: "Takeout and the dining room, together",
        body: "Take online pickup and delivery orders AND table reservations from the same branded page — with reserve-then-order so guests can book a table and pre-order in one step. Orders and bookings land on your Kitchen Order App instantly.",
      },
      {
        title: "Own the relationship, not just the order",
        body: "Every order grows your own customer list. Win regulars back with GrowthNet Smart Links and SMS offers instead of paying a marketplace to rent you the same customer again.",
      },
    ],
    faqs: [
      {
        q: "Can customers reserve a table and order online?",
        a: "Yes. You can take table reservations from the same page, and reserve-then-order lets a guest book a table and pre-order their food in one checkout. Both land on your Kitchen Order App.",
      },
      {
        q: "How do I get my menu online?",
        a: "Paste your GloriaFood link on our import page — your rolls, combos, platters, modifier groups, and photos rebuild on a live page in seconds, no signup needed. Claim it when you're ready.",
      },
      {
        q: "What does it cost?",
        a: "0% commission on direct orders and free for your first 100 orders each month. Optional add-ons (online card payments, more orders, multi-location) only if you need them.",
      },
      {
        q: "Can I take payment online?",
        a: "Yes — connect your own Stripe account with the Online Payments add-on and funds go straight to you. Cash and pay-at-counter are free out of the box.",
      },
    ],
  },
  {
    slug: "burgers",
    noun: "burger restaurant",
    nounPlural: "burger restaurants",
    food: "burger",
    metaTitle: "Online Ordering for Burger Restaurants — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering for burger joints: build-your-own modifiers, combos, and fast pickup + delivery. Keep 100% of every order.",
    h1: "Online ordering for burger joints",
    eyebrow: "Built for burgers",
    intro:
      "Burgers live and die on customization and speed. Fee Free Ordering gives your burger joint a branded ordering page where build-your-own modifiers and combos are effortless, orders fly to the kitchen the moment they're placed, and you pay 0% commission on every direct order.",
    painPoint: {
      title: "Volume without margin isn't a business",
      body: "Burger joints run on volume and tight food costs. A 25–30% marketplace commission on a $12 combo is the difference between profit and busywork. Direct orders keep the volume AND the margin.",
    },
    benefits: [
      {
        title: "Build-your-own, done right",
        body: "Patties, cheese, toppings, sauces, 'make it a combo' — all import cleanly as modifier groups from your GloriaFood menu, so customers customise in a couple of taps and you get the ticket exactly as they want it.",
      },
      {
        title: "Fast kitchen, no missed tickets",
        body: "Orders ring instantly on the Kitchen Order App and print to a WiFi thermal printer. On a lunch rush that never stops, nothing slips — and an unaccepted order can ring your phone.",
      },
      {
        title: "Build a regular crowd",
        body: "Every order adds to your own customer list. QR codes on the bag and GrowthNet win-back offers turn a delivery-app one-timer into a direct regular you never pay commission on again.",
      },
    ],
    faqs: [
      {
        q: "Can customers fully customise their burger?",
        a: "Yes — every modifier group (patties, cheese, toppings, sauces, combo upgrades) imports from your GloriaFood menu and shows as quick tap-to-add options at checkout.",
      },
      {
        q: "How fast can I be live?",
        a: "Minutes. Paste your GloriaFood menu link, watch it rebuild on a live ordering page, and claim it. No rebuilding your menu by hand.",
      },
      {
        q: "What's the cost?",
        a: "0% commission on direct orders, free for your first 100 orders a month, and à-la-carte add-ons only when you want them. No contracts.",
      },
      {
        q: "Pickup and delivery both?",
        a: "Yes — pickup, delivery, and dine-in, each configured independently, with your own drivers or our driver-pool add-on.",
      },
    ],
  },
  {
    slug: "mexican",
    noun: "Mexican restaurant",
    nounPlural: "Mexican restaurants",
    food: "order",
    metaTitle: "Online Ordering for Mexican Restaurants — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering for Mexican restaurants and taquerias: customizable tacos, burritos, family meals, and catering. Keep 100% of every order.",
    h1: "Online ordering for Mexican restaurants",
    eyebrow: "Built for taquerias",
    intro:
      "From tacos to family-size catering trays, Mexican menus are all about choices — proteins, salsas, sides. Fee Free Ordering turns those into clean, tap-to-add options on your own branded page, with 0% commission on every direct pickup, delivery, and catering order.",
    painPoint: {
      title: "Family meals shouldn't feed the middleman",
      body: "A $60 family order is exactly the kind of ticket marketplaces love to skim 25–30% from. On your own page, that whole catering and family-meal margin stays in your pocket.",
    },
    benefits: [
      {
        title: "Every choice, cleanly captured",
        body: "Proteins, fillings, salsas, sides, spice — all import as modifier groups from your GloriaFood menu, so a build-your-own burrito or a family taco kit is easy to order and arrives at the kitchen exactly right.",
      },
      {
        title: "Catering and big orders made simple",
        body: "Offer catering as its own service with its own settings, and let customers schedule orders in advance — perfect for parties and office lunches. Everything lands on your Kitchen Order App and prints to your thermal printer.",
      },
      {
        title: "Keep your regulars regular",
        body: "Build your own customer list with every order, then bring people back with GrowthNet Smart Links and SMS offers — direct, commission-free, again and again.",
      },
    ],
    faqs: [
      {
        q: "Can customers build their own tacos or burritos?",
        a: "Yes — proteins, fillings, salsas, sides, and spice levels all import as modifier groups and show as quick options at checkout.",
      },
      {
        q: "Do you support catering and scheduled orders?",
        a: "Yes. Catering is its own service type with its own settings, and customers can schedule orders in advance for parties and office lunches.",
      },
      {
        q: "How do I get started?",
        a: "Paste your GloriaFood menu link on our import page and your full menu — items, modifier groups, photos — rebuilds live in seconds. No account needed to try it.",
      },
      {
        q: "What does it cost?",
        a: "0% commission on direct orders, free for your first 100 orders a month, with optional add-ons only when you need them.",
      },
    ],
  },
  {
    slug: "chinese",
    noun: "Chinese restaurant",
    nounPlural: "Chinese restaurants",
    food: "order",
    metaTitle: "Online Ordering for Chinese Restaurants — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering for Chinese restaurants: large menus, combo dinners, and family meals imported cleanly. Keep 100% of every delivery order.",
    h1: "Online ordering for Chinese restaurants",
    eyebrow: "Built for Chinese restaurants",
    intro:
      "Big menus and combo dinners are a Chinese-restaurant staple — and delivery is a huge share of the business. Fee Free Ordering gives you a branded ordering page that handles large menus and combos with ease, at 0% commission on every direct order, so high-volume delivery actually pays.",
    painPoint: {
      title: "High delivery volume, low retained margin",
      body: "When most of your orders are delivery and a marketplace takes a quarter to a third of each, you're working hard to fund their growth. Direct ordering flips that — the volume works for you.",
    },
    benefits: [
      {
        title: "Large menus & combo dinners, organised",
        body: "Dozens of dishes, combo plates, and family dinners import from your GloriaFood menu into clean categories and modifier groups — easy to browse, easy to order, photos included.",
      },
      {
        title: "Delivery that doesn't cost you a third",
        body: "Run delivery your way — your own drivers or our driver-pool add-on — and keep 100% of the food total on direct orders. Orders ring instantly on the Kitchen Order App and print to your thermal printer.",
      },
      {
        title: "Your customers, your list",
        body: "Every order grows your own customer database. Bring repeat diners back with GrowthNet offers instead of renting them from a delivery app over and over.",
      },
    ],
    faqs: [
      {
        q: "Can it handle a large menu with combos?",
        a: "Yes — large menus, combo plates, and family dinners import cleanly into categories with modifier groups and photos, straight from your GloriaFood link.",
      },
      {
        q: "How quickly can I switch?",
        a: "Paste your GloriaFood menu link and the whole menu rebuilds on a live ordering page in seconds — no manual re-entry. Try it with no account, then claim it.",
      },
      {
        q: "What does it cost?",
        a: "0% commission on direct orders and free for your first 100 orders a month. Add card payments or more orders only when you need them.",
      },
      {
        q: "Can I keep using my own delivery drivers?",
        a: "Yes — use your own drivers, or add our driver pool. Either way you keep 100% of the food total on direct orders.",
      },
    ],
  },
  {
    slug: "indian",
    noun: "Indian restaurant",
    nounPlural: "Indian restaurants",
    food: "order",
    metaTitle: "Online Ordering for Indian Restaurants — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering for Indian restaurants: spice levels, thalis, and catering imported cleanly. Keep 100% of every order and own your customers.",
    h1: "Online ordering for Indian restaurants",
    eyebrow: "Built for Indian restaurants",
    intro:
      "Spice levels, thalis, and generous catering orders define Indian menus. Fee Free Ordering captures all of it on your own branded page — pickup, delivery, and catering at 0% commission — so the orders you work hardest on stay profitable.",
    painPoint: {
      title: "Catering-size tickets, marketplace-size cuts",
      body: "Large family and catering orders are where the real money is — and exactly what a 25–30% commission hurts most. On your own page, those tickets keep their full margin.",
    },
    benefits: [
      {
        title: "Spice levels & thalis, captured cleanly",
        body: "Spice levels, thali selections, breads, and sides import as modifier groups from your GloriaFood menu, so every order arrives at the kitchen exactly as the customer intended.",
      },
      {
        title: "Catering & advance orders built in",
        body: "Offer catering as its own service and let customers schedule orders ahead for events. Everything lands on your Kitchen Order App and prints to your WiFi thermal printer instantly.",
      },
      {
        title: "Turn delivery customers into regulars",
        body: "Every order builds your own customer list. GrowthNet Smart Links and SMS win-backs bring them back to order direct — commission-free — instead of through a marketplace.",
      },
    ],
    faqs: [
      {
        q: "Can customers pick spice levels and thali options?",
        a: "Yes — spice levels, thali choices, breads, and sides all import as modifier groups and show as quick options at checkout.",
      },
      {
        q: "Do you handle catering?",
        a: "Yes — catering is its own service type with its own settings, and customers can schedule large orders in advance.",
      },
      {
        q: "How do I move my menu over?",
        a: "Paste your GloriaFood menu link on our import page and the whole menu rebuilds on a live page in seconds, photos and all. No account needed to try it.",
      },
      {
        q: "What does it cost?",
        a: "0% commission on direct orders, free for your first 100 orders a month, with à-la-carte add-ons only when you want them.",
      },
    ],
  },
  {
    slug: "thai",
    noun: "Thai restaurant",
    nounPlural: "Thai restaurants",
    food: "order",
    metaTitle: "Online Ordering for Thai Restaurants — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering for Thai restaurants: curry and noodle customization, spice levels, and fast takeout. Keep 100% of every order.",
    h1: "Online ordering for Thai restaurants",
    eyebrow: "Built for Thai restaurants",
    intro:
      "Curries, noodle dishes, spice levels, protein swaps — Thai menus are built on customization, and takeout is a big share of the business. Fee Free Ordering captures every option on your own branded page at 0% commission on direct orders.",
    painPoint: {
      title: "Takeout favourites shouldn't fund a middleman",
      body: "When your bestselling pad thai and curries mostly go out the door as takeout, a marketplace commission on each one quietly drains your margin. Direct ordering keeps it.",
    },
    benefits: [
      {
        title: "Curries & noodles, customised cleanly",
        body: "Spice levels, protein choices, and add-ons import as modifier groups from your GloriaFood menu, so every curry and noodle order is exactly right when it hits the kitchen.",
      },
      {
        title: "Fast takeout, nothing missed",
        body: "Orders ring instantly on the Kitchen Order App and print to a WiFi thermal printer, with a phone-call alert if one isn't accepted. Takeout rushes run smoothly.",
      },
      {
        title: "Build a loyal, direct following",
        body: "Each order grows your own customer list. GrowthNet QR codes and SMS offers bring customers back to order direct — commission-free — every time.",
      },
    ],
    faqs: [
      {
        q: "Can customers set spice levels and swap proteins?",
        a: "Yes — spice levels, protein choices, and add-ons import as modifier groups and appear as quick options at checkout.",
      },
      {
        q: "How do I get online?",
        a: "Paste your GloriaFood menu link on our import page and your full menu rebuilds on a live ordering page in seconds — photos included. Try it with no account, then claim it.",
      },
      {
        q: "What does it cost?",
        a: "0% commission on direct orders and free for your first 100 orders a month. Optional add-ons only when you need them.",
      },
      {
        q: "Can I take card payments online?",
        a: "Yes — connect your own Stripe account with the Online Payments add-on; the funds go straight to you. Cash and pay-at-counter are free.",
      },
    ],
  },
  {
    slug: "cafes",
    noun: "café",
    nounPlural: "cafés & coffee shops",
    food: "order",
    metaTitle: "Online Ordering for Cafés & Coffee Shops — 0% Commission | Fee Free Ordering",
    metaDescription:
      "Commission-free online ordering and order-ahead for cafés and coffee shops: drink customization, fast pickup, and QR codes on the table. Keep 100% of every order.",
    h1: "Online ordering for cafés & coffee shops",
    eyebrow: "Built for cafés",
    intro:
      "Coffee runs on speed and repeat visits. Fee Free Ordering gives your café an order-ahead page where drink customization is quick, pickup is fast, and a QR code on every table turns into a direct order — all at 0% commission.",
    painPoint: {
      title: "Small tickets, so commissions hurt more",
      body: "On a $6 latte, a 25–30% marketplace cut is brutal. Order-ahead on your own page keeps the whole ticket and rewards the repeat habit coffee is built on.",
    },
    benefits: [
      {
        title: "Drink customization, fast",
        body: "Milk, syrups, sizes, shots — all import as quick modifier groups from your GloriaFood menu, so a customised order takes seconds and prints clearly for the barista.",
      },
      {
        title: "Order-ahead & QR pickup",
        body: "Customers order ahead and skip the line; a QR code on each table or the counter opens your menu instantly. Orders ring on the Kitchen Order App and print to your thermal printer the moment they land.",
      },
      {
        title: "Reward the repeat habit",
        body: "Every order builds your own customer list. GrowthNet Smart Links, QR codes, and SMS offers bring regulars back daily — direct and commission-free.",
      },
    ],
    faqs: [
      {
        q: "Can customers customise their drinks?",
        a: "Yes — milk, syrups, sizes, and shots all import as modifier groups and show as quick tap-to-add options at checkout.",
      },
      {
        q: "Does order-ahead pickup work?",
        a: "Yes — customers order ahead for fast pickup, and a QR code on the table or counter opens your menu instantly. Orders ring on your Kitchen Order App the moment they land.",
      },
      {
        q: "How do I set it up?",
        a: "Paste your GloriaFood menu link on our import page and your full menu rebuilds on a live ordering page in seconds. No account needed to try it.",
      },
      {
        q: "What does it cost?",
        a: "0% commission on direct orders and free for your first 100 orders a month, with à-la-carte add-ons only when you want them.",
      },
    ],
  },
];

export function getLandingPage(slug: string): LandingPage | undefined {
  return LANDING_PAGES.find((p) => p.slug === slug);
}

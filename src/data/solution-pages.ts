/**
 * Programmatic SEO "solution" landing pages — feature/use-case, CMS/platform, and city pages
 * (e.g. /online-ordering-system, /wordpress-restaurant-ordering-plugin, /online-ordering-system-toronto).
 *
 * Rendered by src/app/[slug]/page.tsx — root-level URLs (GloriaFood-parity), statically generated at
 * build time with `dynamicParams = false` so ONLY the slugs listed here render (every other root path
 * 404s — zero collision risk; static routes like /features always win). Listed in the sitemap +
 * cross-linked + a grouped footer block (PublicFooter).
 *
 * Sibling of the cuisine engine (src/data/landing-pages.ts → /online-ordering-for/[slug]) and the
 * competitor engine (src/data/competitors.ts → /vs/[slug]). Same playbook: SSG + SoftwareApplication +
 * FAQPage JSON-LD + internal cross-links.
 *
 * ENGLISH-ONLY by design (same established exception as /vs + /online-ordering-for). The product UI is
 * fully 38-locale; these acquisition pages are not.
 *
 * SUBSTANTIVE, NOT THIN (Luigi 2026-06-24): a curated ~30-40-page set, each page genuinely unique
 * (distinct intro, pain point, benefits, FAQs for that search term's intent) and mapping ONLY to SHIPPED
 * features — NEVER a CMS plugin / embeddable widget (we don't have one). Do NOT mass-generate near-dupes.
 */

export interface SolutionBenefit {
  title: string;
  body: string;
}
export interface SolutionFaq {
  q: string;
  a: string;
}
export interface SolutionPage {
  slug: string;
  /** Grouping for the footer link block + cross-links. */
  category: "feature" | "platform" | "city";
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Short uppercase eyebrow above the H1. */
  eyebrow: string;
  /** 2-3 sentence hero intro. */
  intro: string;
  painPoint: SolutionBenefit;
  /** Exactly 3, page-specific. */
  benefits: SolutionBenefit[];
  /** 4-5, page-specific (drives the FAQPage JSON-LD). */
  faqs: SolutionFaq[];
}

/** Short human label for cross-link pills + footer (derived from the slug). */
export function solutionLabel(p: SolutionPage): string {
  return p.h1;
}

export const SOLUTION_PAGES: SolutionPage[] = [
  {
    "slug": "online-ordering-system",
    "category": "feature",
    "metaTitle": "Online Ordering System for Restaurants | Fee Free Ordering",
    "metaDescription": "An all-in-one online ordering system for restaurants: branded ordering page, kitchen app, marketing, and reservations. 0% commission, free for your first 100 orders/mo.",
    "h1": "An online ordering system that keeps 100% of every order",
    "eyebrow": "ALL-IN-ONE PLATFORM",
    "intro": "Most online ordering systems either skim a fat commission off every ticket or leave you stitching five disconnected tools together. Fee Free Ordering is one system that does the whole job — a branded ordering page, a kitchen app that rings instantly, marketing that brings diners back, and reservations — at 0% commission on direct orders.",
    "painPoint": {
      "title": "Renting your sales channel instead of owning it",
      "body": "When your ordering 'system' is a marketplace listing, you pay a fat commission per order, you don't own the customer, and you can't reach them again without paying again. An online ordering system you own flips all three: your page, your customers, your margin."
    },
    "benefits": [
      {
        "title": "One platform, not five subscriptions",
        "body": "Ordering page, Kitchen Order App, CRM, promotions, reservations, and reports are built to work together — orders flow from page to kitchen to your customer database automatically, with nothing to integrate."
      },
      {
        "title": "Live in seconds, not a six-week onboarding",
        "body": "Paste your existing GloriaFood menu link and the whole menu — items, sizes, modifier groups, and photos — rebuilds on a working ordering page in seconds. No signup needed to see it; claim it when you're ready."
      },
      {
        "title": "Built to scale with your growth",
        "body": "Start free for your first 100 orders a month, then add only the optional à-la-carte pieces you need — online card payments, multi-location, marketing tools — paying only for what you use. No long contracts, no surprise tiers."
      }
    ],
    "faqs": [
      {
        "q": "What's included in the online ordering system?",
        "a": "A branded ordering page (pickup, delivery, dine-in, catering), the Kitchen Order App for iOS and Android, WiFi thermal ticket printing, reservations, a customer database, promotions and coupons, and sales reports — all under one login."
      },
      {
        "q": "How much does it cost?",
        "a": "0% commission on every direct order and free for your first 100 orders each month. Optional add-ons like online card payments are à-la-carte, so you only pay for what you actually use."
      },
      {
        "q": "How do I get my menu into the system?",
        "a": "Paste your GloriaFood menu link on our import page. We rebuild every item, size, crust, modifier group, and photo on a live ordering page in seconds — no account required to try it."
      },
      {
        "q": "Do I get help setting it up?",
        "a": "Yes. We offer 24/7 Canadian phone support staffed by real people, and the import does most of the heavy lifting for you. The whole platform is also available in 38 languages."
      }
    ]
  },
  {
    "slug": "restaurant-ordering-system",
    "category": "feature",
    "metaTitle": "Restaurant Ordering System | Fee Free Ordering",
    "metaDescription": "A restaurant ordering system built around the kitchen: orders ring instantly, print to your thermal printer, and never get lost. 0% commission on direct orders.",
    "h1": "A restaurant ordering system your kitchen actually runs on",
    "eyebrow": "BUILT FOR OPERATIONS",
    "intro": "A restaurant ordering system is only as good as what happens after the customer hits 'place order.' Fee Free Ordering was built from the kitchen back: orders ring the moment they land, print to your thermal printer, and can phone you if one slips through. The branded ordering page and 0% commission are the bonus — reliable service is the point.",
    "painPoint": {
      "title": "Orders that vanish into a silent tablet",
      "body": "A muted tablet across the room, a notification nobody saw, a delivery order accepted late — that's a refund, a bad review, and a lost regular. A real restaurant ordering system makes a missed order physically impossible to ignore."
    },
    "benefits": [
      {
        "title": "Orders ring until you act — even screen-off",
        "body": "The Kitchen Order App rings loudly the instant an order arrives, even with the tablet screen off. Auto-accept and an accept countdown keep the line moving, and a missed order can call the owner's phone so nothing is ever silently dropped."
      },
      {
        "title": "Tickets print straight to the line",
        "body": "Print kitchen tickets over WiFi to Star, Epson, Bixolon, and Citizen thermal printers — no cables, no extra hardware boxes. Your line works the way it already does."
      },
      {
        "title": "Pickup, delivery, dine-in, and catering on one page",
        "body": "Each service has its own fees, ETAs, and minimums, so the system matches how your restaurant actually operates instead of forcing one rigid flow."
      }
    ],
    "faqs": [
      {
        "q": "What does the kitchen use to manage orders?",
        "a": "The Kitchen Order App, a native iOS and Android app. New orders ring instantly (even screen-off), you accept with one tap or let auto-accept handle it, and an accept countdown keeps prep on schedule. It's available in 38 languages."
      },
      {
        "q": "Which receipt printers does it support?",
        "a": "WiFi thermal printing works with Star, Epson, Bixolon, and Citizen receipt printers — tickets print straight from the tablet over your network."
      },
      {
        "q": "What if staff miss an order during a rush?",
        "a": "If an order sits unaccepted, the system can place an automatic phone call to the owner so it's caught immediately. Combined with screen-off ringing and auto-accept, lost orders become a non-issue."
      },
      {
        "q": "What does the restaurant ordering system cost?",
        "a": "0% commission on direct orders and free for your first 100 orders a month. Add only the optional à-la-carte features you need, paying just for what you use — no contracts."
      }
    ]
  },
  {
    "slug": "pizza-ordering-system",
    "category": "feature",
    "metaTitle": "Pizza Ordering System Software | Fee Free Ordering",
    "metaDescription": "Pizza ordering system software that imports every size, crust, and 'pick any toppings' group perfectly — and handles the Friday rush. 0% commission on direct orders.",
    "h1": "Pizza ordering system software built for the toppings problem",
    "eyebrow": "PIZZA OPERATIONS SOFTWARE",
    "intro": "Generic ordering software chokes on pizza: it splits Small/Medium/Large into separate products and caps your 'pick any toppings' groups. Fee Free Ordering gives independent pizzerias the most powerful custom pizza builder out there — true half-and-half with fair per-half pricing and build-your-own from crust to sauce to cheese to unlimited toppings — built and tested on a real 12,000-option pizzeria menu. Sizes fold into one selector, every topping group survives, and the whole thing runs your Friday-night rush without a hiccup.",
    "painPoint": {
      "title": "Software that can't model a pizza",
      "body": "If your ordering system turns 'choose any 4 toppings' into a mess of separate listings, customers give up and your staff fix orders by phone all night. Pizza needs software that understands sizes, crusts, half-and-half, and unlimited topping picks out of the box."
    },
    "benefits": [
      {
        "title": "Sizes, crusts & 'pick any toppings' imported right",
        "body": "Sizes fold into one product with a selector instead of duplicate listings, and 'choose any amount' topping groups import with no artificial cap. We verified it on a live pizzeria menu with over 12,000 topping options — paste your GloriaFood link and watch it rebuild in seconds."
      },
      {
        "title": "The Friday rush, under control",
        "body": "Orders ring on the Kitchen Order App the instant they land — even screen-off — and print straight to your WiFi thermal printer. Auto-accept and an accept countdown keep tickets moving when twelve orders hit at once."
      },
      {
        "title": "Keep the whole margin on a thin-margin product",
        "body": "A pizza nets only a few dollars after dough, cheese, and labour. At 0% commission on direct orders, that margin stays with you instead of disappearing into a marketplace's cut."
      }
    ],
    "faqs": [
      {
        "q": "Can the system handle pizza sizes and unlimited toppings?",
        "a": "Yes — this is exactly what it was built for. Sizes fold into one product with a size selector (not separate listings), and 'pick any toppings' groups import with no artificial limit. We tested it on a real pizzeria menu with 12,000+ topping options."
      },
      {
        "q": "How fast can I get my pizza menu online?",
        "a": "Paste your GloriaFood menu link on our import page and the full menu — every pizza, size, crust, topping group, and photo — rebuilds on a live ordering page in seconds. No account needed to try it."
      },
      {
        "q": "Will it keep up on a busy Friday night?",
        "a": "Yes. The Kitchen Order App rings every order instantly (even with the screen off), prints to your thermal printer, and offers auto-accept plus an accept countdown so a rush of orders stays organized instead of overwhelming the line."
      },
      {
        "q": "What does a pizzeria pay for this software?",
        "a": "0% commission on direct orders and free for your first 100 orders each month. Add optional à-la-carte features like online card payments only if you want them, paying only for what you use. No contracts."
      }
    ]
  },
  {
    "slug": "food-delivery-system",
    "category": "feature",
    "metaTitle": "Food Delivery System — 0% Commission | Fee Free Ordering",
    "metaDescription": "A food delivery system for restaurants — your own delivery zones, fees, and ETAs at 0% commission on direct orders. Keep the margin delivery apps typically take.",
    "h1": "A food delivery system you own — not rent from aggregators",
    "eyebrow": "DELIVERY, ON YOUR TERMS",
    "intro": "Delivery aggregators typically take a 20–30% cut of every order and keep your customers as theirs. Fee Free Ordering gives you a branded delivery ordering page with your own delivery fees, ETAs, and order minimums — so you run delivery your way, with your own drivers, and keep 100% of every direct order.",
    "painPoint": {
      "title": "Paying a third of delivery revenue to a middleman",
      "body": "On a $40 delivery order, a marketplace can take ten dollars or more before you've paid your driver. Worse, the customer 'belongs' to the app — you can't reach them directly. A delivery system you control keeps both the margin and the relationship."
    },
    "benefits": [
      {
        "title": "Set your own delivery fees, ETAs & minimums",
        "body": "Delivery is its own service on your branded page with its own pricing rules. Charge a flat or order-minimum-based delivery fee, set a realistic ETA, and require a minimum order — all without an aggregator dictating terms."
      },
      {
        "title": "Use your own drivers and keep 100%",
        "body": "Dispatch delivery to your own staff and pocket the entire food total on direct orders. No per-order commission skimmed off the top, ever."
      },
      {
        "title": "Every delivery builds your customer list",
        "body": "Each order saves to your own customer database with address history. GrowthNet's Autopilot win-back emails and SMS bring those customers back to order direct — instead of you re-paying an app to reach them."
      }
    ],
    "faqs": [
      {
        "q": "How does delivery work without an aggregator?",
        "a": "Delivery is a service on your own branded ordering page, with delivery fees, ETAs, and order minimums you set. Orders come straight to your Kitchen Order App, and you fulfill them with your own drivers — keeping 100% of every direct order."
      },
      {
        "q": "Can I set different fees for delivery vs pickup?",
        "a": "Yes. Pickup, delivery, dine-in, and catering each have their own fees, ETAs, and minimums, so you can price delivery independently from your other services."
      },
      {
        "q": "How is this cheaper than DoorDash or Uber Eats?",
        "a": "Those marketplaces are aggregators that, as of 2026, typically take a commission of around 20–30% per order. Fee Free Ordering charges 0% commission on direct orders and is free for your first 100 orders a month — the savings on delivery margin are immediate."
      },
      {
        "q": "Do you provide the delivery drivers?",
        "a": "Today you deliver with your own drivers, which is how you keep the full order total — we give you the ordering, delivery fees, ETAs, and kitchen tools. A managed driver-dispatch option is coming soon."
      }
    ]
  },
  {
    "slug": "restaurant-order-taking-app",
    "category": "feature",
    "metaTitle": "Restaurant Order-Taking App | Fee Free Ordering",
    "metaDescription": "A restaurant order-taking app that rings new orders instantly even screen-off, prints tickets over WiFi, and phone-calls you on a missed order. iOS & Android.",
    "h1": "A restaurant order-taking app that never lets an order slip",
    "eyebrow": "THE KITCHEN ORDER APP",
    "intro": "The Kitchen Order App is the order-taking app your line runs on. New orders ring the instant they arrive — even with the tablet screen off — print straight to your thermal printer, and if one goes unanswered it can call the owner's phone. Native on iOS and Android, in 38 languages, with 0% commission on the orders it brings in.",
    "painPoint": {
      "title": "The order nobody heard",
      "body": "A backgrounded app, a screen that went to sleep, a notification lost in the noise of service — and a paid order sits unmade until the customer calls angry. An order-taking app has exactly one job: make sure the kitchen always knows."
    },
    "benefits": [
      {
        "title": "Rings instantly — even screen-off",
        "body": "A native iOS and Android app, not a web page that goes silent in the background. New orders ring loudly the moment they land, even with the screen off, so the kitchen always hears them."
      },
      {
        "title": "Missed-order phone call as a backstop",
        "body": "If an order sits unaccepted, the app can place an automatic phone call to the owner. Combined with auto-accept and an on-screen accept countdown, it's a safety net no muted tablet can defeat."
      },
      {
        "title": "Prints tickets the moment you accept",
        "body": "Tickets print over WiFi straight to Star, Epson, Bixolon, and Citizen thermal printers — the order goes from screen to line without anyone re-keying it."
      }
    ],
    "faqs": [
      {
        "q": "Is it a real app or just a website?",
        "a": "It's a native app for both iOS and Android — that's why it can ring loudly even when the tablet screen is off, which a backgrounded web page can't reliably do."
      },
      {
        "q": "What happens if my staff miss an order?",
        "a": "The app keeps ringing, and if an order stays unaccepted it can automatically phone the owner. Auto-accept and an accept countdown further ensure orders are picked up promptly during a rush."
      },
      {
        "q": "Can it print to my kitchen printer?",
        "a": "Yes. The app prints tickets over WiFi to Star, Epson, Bixolon, and Citizen thermal printers, so accepted orders hit the line automatically — no cables or extra hardware boxes."
      },
      {
        "q": "Does it cost extra to use the order-taking app?",
        "a": "No. The Kitchen Order App is part of the platform. You get 0% commission on direct orders and your first 100 orders each month are free. It's available in 38 languages."
      }
    ]
  },
  {
    "slug": "online-restaurant-reservation-system",
    "category": "feature",
    "metaTitle": "Online Restaurant Reservation System | Fee Free Ordering",
    "metaDescription": "Take table reservations on your branded page — plus reserve-then-order pre-ordering so the kitchen is ready when guests arrive. 0% commission, no per-cover fees.",
    "h1": "An online restaurant reservation system with no per-cover fees",
    "eyebrow": "RESERVATIONS + PRE-ORDER",
    "intro": "Most reservation systems charge per cover and keep your guest data. Fee Free Ordering puts table bookings on your own branded page — with reserve-then-order pre-ordering so guests can book and order in one flow — and never charges you per seated guest. Reservations and online ordering live in one platform.",
    "painPoint": {
      "title": "Paying per head to book your own tables",
      "body": "Per-cover reservation fees punish you for being busy, and the booking platform owns the diner relationship. A reservation system on your own page means every booking is yours — no per-cover tax, no middleman between you and your guest."
    },
    "benefits": [
      {
        "title": "Bookings and ordering in one place",
        "body": "Guests reserve a table from the same branded page where they order pickup or delivery. With reserve-then-order, they can book a table and pre-order their meal in a single flow — so the kitchen is ready when they arrive."
      },
      {
        "title": "Reserve-then-order keeps tables turning",
        "body": "When a guest pre-orders with their booking, the kitchen sees both together and can prep for the arrival time. Food lands faster, tables turn sooner, and your busiest service runs calmer."
      },
      {
        "title": "Every reservation builds your guest list",
        "body": "Bookings save to your own customer database, so you can invite guests back with GrowthNet promotions and Autopilot emails — instead of renting access to your own diners from a booking platform."
      }
    ],
    "faqs": [
      {
        "q": "Do you charge per reservation or per cover?",
        "a": "No. There are no per-cover or per-reservation fees. Reservations are part of your branded page, with 0% commission on direct orders and your first 100 orders each month free."
      },
      {
        "q": "What is reserve-then-order?",
        "a": "It lets a guest book a table and pre-order their food in one combined checkout. The reservation and the pre-order arrive together, so the kitchen can prep for the guest's arrival time."
      },
      {
        "q": "Can I take a deposit to reduce no-shows?",
        "a": "Charging a deposit at booking is coming soon. Today, reservations and reserve-then-order are your live no-show defense — a guest who has pre-ordered and paid for their meal is far more likely to show up."
      },
      {
        "q": "Where do my reservations and guest data live?",
        "a": "On your own platform. Every booking saves to your customer database, which you can use for win-back emails, SMS, and promotions through GrowthNet. The data is yours, not a booking platform's."
      }
    ]
  },
  {
    "slug": "table-reservation-system",
    "category": "feature",
    "metaTitle": "Table Reservation System for Restaurants | Fee Free Ordering",
    "metaDescription": "A table reservation system that takes bookings on your branded page with reserve-then-order pre-ordering — and online ordering built in. No per-cover fees.",
    "h1": "A table reservation system with pre-ordering built in",
    "eyebrow": "BOOKINGS + RESERVE-THEN-ORDER",
    "intro": "An empty 'reserved' table on a Saturday night is pure lost revenue. Fee Free Ordering's table reservation system takes bookings from your own branded page — and because ordering is built into the same platform, a reservation can come with a pre-order. Guests who book and order their meal in advance are guests who show up.",
    "painPoint": {
      "title": "No-shows that leave a table cold at peak",
      "body": "A party of six books, never arrives, and the table sat empty during your busiest hour. A reservation system where guests can pre-order their meal turns a casual 'maybe' booking into a committed plan — and primes the kitchen for the covers that do arrive."
    },
    "benefits": [
      {
        "title": "Pair every booking with a pre-order",
        "body": "With reserve-then-order, a guest books a table and pre-orders their meal in one combined checkout. The kitchen sees both, so food is ready when the table is seated — higher table turns, smoother service, fewer empty 'maybe' bookings."
      },
      {
        "title": "Bookings on your own branded page",
        "body": "Guests reserve directly on your page — no per-cover fee, no third party owning the relationship. Every booking is yours, and it saves to your customer database for future invites."
      },
      {
        "title": "One platform for tables and takeout",
        "body": "The same branded page handles reservations, pickup, delivery, dine-in, and catering. Reservations ring through to your Kitchen Order App alongside orders, so the front of house and the line stay in sync."
      }
    ],
    "faqs": [
      {
        "q": "Can guests order food when they reserve?",
        "a": "Yes, with reserve-then-order. A guest can book a table and pre-order their meal in one combined checkout, so the kitchen can prep for their arrival time and the table turns faster."
      },
      {
        "q": "Is there a per-cover or per-booking fee?",
        "a": "No. Table reservations are part of your branded page with no per-cover fees. You get 0% commission on direct orders and your first 100 orders each month free."
      },
      {
        "q": "Can I require a deposit at booking?",
        "a": "Deposit-at-booking is coming soon. For now, reserve-then-order is the strongest no-show defense available — a guest who has already chosen and paid for their meal rarely fails to arrive."
      },
      {
        "q": "Do I own my reservation and guest data?",
        "a": "Completely. Every booking saves to your own customer database, which you can use with GrowthNet promotions, win-back emails, and SMS. Nothing is locked inside a third-party booking platform."
      }
    ]
  },
  {
    "slug": "qr-code-menu",
    "category": "feature",
    "metaTitle": "QR Code Menu for Restaurants — Free to Try | Fee Free Ordering",
    "metaDescription": "Turn your menu into a QR code that opens a live, branded, always-current menu — no app for the diner, no reprinting. Import your menu and try it in seconds.",
    "h1": "A QR code menu that's always current and on-brand",
    "eyebrow": "SCAN-TO-VIEW MENU",
    "intro": "Printed menus go stale the moment you change a price, and laminated ones are a hygiene afterthought. A Fee Free QR code menu opens your live, branded menu in the diner's browser — no app to download — and updates the instant you change it. Build it in seconds by importing your existing menu.",
    "painPoint": {
      "title": "Reprinting menus every time something changes",
      "body": "A new price, an 86'd dish, a seasonal special — and your printed menus are wrong until you reprint and re-laminate the whole stack. A QR code menu is one source of truth you update once, instantly, everywhere."
    },
    "benefits": [
      {
        "title": "Always current — change it once",
        "body": "Edit a price or hide a sold-out item and every scan reflects it instantly. No reprinting, no stickers over old prices, no stale specials."
      },
      {
        "title": "No app for the diner",
        "body": "Guests scan the code and your branded menu opens right in their phone's browser — full menu with photos, sizes, and modifier groups. Nothing to download, nothing in the way of a quick look."
      },
      {
        "title": "Build it in seconds from your existing menu",
        "body": "Paste your GloriaFood menu link and the whole thing — items, sizes, crusts, modifier groups, and photos — rebuilds on a live page in seconds. Your QR code points right at it, ready to print on table tents."
      }
    ],
    "faqs": [
      {
        "q": "Do diners need to install an app to view the menu?",
        "a": "No. The QR code opens your branded menu directly in the phone's web browser — photos, sizes, and options included. There's nothing for the guest to download."
      },
      {
        "q": "How do I keep the menu up to date?",
        "a": "You edit your menu once in your dashboard and every QR scan shows the change immediately. Hide a sold-out dish or update a price and it's live everywhere instantly — no reprinting."
      },
      {
        "q": "How do I create the QR code menu?",
        "a": "Paste your existing GloriaFood menu link on our import page and we rebuild it on a live, branded page in seconds. Your QR code links straight to it — print it on table tents, windows, or receipts."
      },
      {
        "q": "Can guests also order from the QR code menu?",
        "a": "Yes — the same branded page supports pickup, delivery, dine-in, and QR-code ordering. You can use it as a view-only menu or let guests place orders directly, at 0% commission on direct orders."
      }
    ]
  },
  {
    "slug": "qr-code-ordering",
    "category": "feature",
    "metaTitle": "QR Code Ordering for Restaurants | Fee Free Ordering",
    "metaDescription": "Let diners scan a QR code to order from their phone — contactless, no app, faster table turns. Orders ring straight to your kitchen. 0% commission on direct orders.",
    "h1": "QR code ordering that sends orders straight to your kitchen",
    "eyebrow": "SCAN-TO-ORDER",
    "intro": "QR code ordering lets a guest scan, browse your branded menu, and order from their own phone — at the table or for takeaway — with no app and no waiting to flag down staff. Orders ring instantly on your Kitchen Order App, and you keep 100% on every direct order.",
    "painPoint": {
      "title": "Tables waiting on a server who's slammed",
      "body": "At peak, guests sit with menus closed waiting to order while servers run between tables. Every minute of that lag is a slower table turn and a smaller check. Scan-to-order lets the guest order the moment they're ready."
    },
    "benefits": [
      {
        "title": "Order and reorder without flagging anyone down",
        "body": "Guests scan, order, and can scan again for a second round — drinks, dessert, another appetizer — without waiting for a server. Faster service, bigger checks, smoother peaks."
      },
      {
        "title": "Contactless and app-free",
        "body": "Everything happens in the phone's browser — no download, no kiosk, no shared menus to wipe down. Hygienic by design and instant for the guest."
      },
      {
        "title": "Orders ring straight to the kitchen",
        "body": "Scan-to-order orders land on the Kitchen Order App and ring instantly — even screen-off — then print to your WiFi thermal printer. No order is re-keyed and none gets lost."
      }
    ],
    "faqs": [
      {
        "q": "How does QR code ordering work for the diner?",
        "a": "The guest scans the QR code, your branded menu opens in their browser, and they place an order — for the table or takeaway — from their own phone. No app to install."
      },
      {
        "q": "Where do scan-to-order orders go?",
        "a": "Straight to your Kitchen Order App, where they ring instantly (even with the screen off) and print to your WiFi thermal printer. The order moves from the guest's phone to the line automatically."
      },
      {
        "q": "Can guests reorder during the same visit?",
        "a": "Yes — guests can scan again to add a second round of drinks, dessert, or food without waiting for a server, which speeds table turns and raises the average check."
      },
      {
        "q": "What does QR code ordering cost?",
        "a": "0% commission on every direct order and free for your first 100 orders each month. If you want guests to pay by card on their phone, add the optional online payments add-on and connect your own Stripe account."
      }
    ]
  },
  {
    "slug": "restaurant-website-builder",
    "category": "feature",
    "metaTitle": "Restaurant Website with Online Ordering | Fee Free Ordering",
    "metaDescription": "Get a hosted restaurant website with built-in ordering — or add ordering to the site you already have with a free embeddable widget. 0% commission on direct orders.",
    "h1": "A restaurant website built around ordering — or add ordering to yours",
    "eyebrow": "HOSTED SITE + FREE WIDGET",
    "intro": "Plenty of website builders make a pretty homepage that can't actually take an order. Fee Free Ordering comes at it the other way: ordering first, with an optional Hosted Website wrapped around it. Already have a site? Keep it — and add ordering with a free embeddable widget that drops onto Wix, Squarespace, WordPress, Shopify, Webflow, GoDaddy, and more.",
    "painPoint": {
      "title": "A beautiful site that can't take an order",
      "body": "Most restaurant website builders stop at photos and hours, then bolt on a third-party ordering widget that charges commission. The website should serve the order, not get in its way — ordering belongs at the center, not as an afterthought."
    },
    "benefits": [
      {
        "title": "Hosted Website with ordering built in",
        "body": "Add the optional Hosted Website to get a clean restaurant site where ordering is the core feature, not a plug-in. Custom domains are coming soon, so you'll be able to put it on your own web address too."
      },
      {
        "title": "Add ordering to the site you already have — free",
        "body": "The embeddable ordering widget is free and part of the platform. Drop it on your existing site three ways: a popup 'Order' button, an inline iframe embed, or a plain button-link. Step-by-step guides cover Wix, Squarespace, WordPress, Shopify, Webflow, and GoDaddy — and the snippets paste into any HTML block."
      },
      {
        "title": "Built from your menu in seconds",
        "body": "Paste your GloriaFood menu link and your ordering page — items, sizes, modifier groups, photos — rebuilds in seconds. The hard part of any restaurant site, the menu, is done before you've finished your coffee."
      }
    ],
    "faqs": [
      {
        "q": "Do I have to replace my current website?",
        "a": "No. Keep your existing site and add the free embeddable ordering widget — a popup launcher, an inline iframe, or a button-link — or simply point your site's 'Order' link at your Fee Free page. Nothing to install or maintain inside your CMS."
      },
      {
        "q": "Can Fee Free host a website for me?",
        "a": "Yes — the optional Hosted Website add-on gives you a hosted restaurant site with ordering built in. Custom domains for it are coming soon."
      },
      {
        "q": "Which website platforms does the widget work with?",
        "a": "There are step-by-step install guides for Wix, Squarespace, WordPress, Shopify, Webflow, and GoDaddy. Because the iframe and button snippets paste into any HTML block, platforms like Weebly, Drupal, and Joomla work too — and there's nothing to maintain inside the CMS."
      },
      {
        "q": "How do I get my menu onto the site?",
        "a": "Paste your GloriaFood menu link and we rebuild the full menu — items, sizes, crusts, modifier groups, and photos — on a live ordering page in seconds, no signup needed to try it."
      }
    ]
  },
  {
    "slug": "commission-free-food-ordering",
    "category": "feature",
    "metaTitle": "Commission-Free Food Ordering | Fee Free Ordering",
    "metaDescription": "Commission-free online ordering: 0% on direct orders, instead of the cut marketplaces take. Free for your first 100 orders a month. Keep 100% and own your customers.",
    "h1": "Commission-free food ordering — keep 100% of every order",
    "eyebrow": "0% COMMISSION",
    "intro": "Delivery marketplaces typically take a 20–30% cut of every order and the customer relationship with it. Fee Free Ordering is commission-free: 0% on every direct order, free for your first 100 orders a month. You keep the full ticket, you own the customer, and you decide what — if anything — you pay for beyond that.",
    "painPoint": {
      "title": "Watching a third of every order disappear",
      "body": "On a $50 order, an aggregator can take twelve to fifteen dollars before food cost and labour. Do that across a week and the commission line can rival your rent. Commission-free ordering puts that money back where it was earned: in your business."
    },
    "benefits": [
      {
        "title": "0% commission on direct orders — every time",
        "body": "Not a promo rate, not a tier you graduate out of. Direct orders on your branded page cost 0% commission, period. The full food total is yours."
      },
      {
        "title": "Free for your first 100 orders a month",
        "body": "Start with no platform cost at all for your first 100 orders each month. Add optional à-la-carte features only when you actually want them, paying only for what you use. No contracts."
      },
      {
        "title": "Own the customer, not just the order",
        "body": "Every direct order saves to your own customer database. With GrowthNet's Autopilot win-back emails, SMS, and promotions, you bring customers back commission-free — instead of re-paying a marketplace to reach them."
      }
    ],
    "faqs": [
      {
        "q": "Is it really 0% commission, or just a low rate?",
        "a": "It's genuinely 0% commission on direct orders — no percentage taken from the food total. Your first 100 orders each month are also free, and any add-ons are à-la-carte features you choose, not per-order cuts."
      },
      {
        "q": "How is this different from DoorDash or Uber Eats?",
        "a": "Those marketplaces are aggregators that, per their published pricing as of 2026, typically charge a commission of around 20–30% per order and own your customer data. Here, direct orders are commission-free, the customer is yours, and you can market to them directly through your own database."
      },
      {
        "q": "What's the catch — how does Fee Free make money?",
        "a": "Through optional, à-la-carte add-ons like online card payments and multi-location management, plus an optional Marketplace listing. You only pay for what you use. The core ordering is commission-free and free for your first 100 orders monthly."
      },
      {
        "q": "How quickly can I start taking commission-free orders?",
        "a": "Paste your GloriaFood menu link and your full menu rebuilds on a live ordering page in seconds. Claim it, share the link, and you're taking 0%-commission orders the same day."
      }
    ]
  },
  {
    "slug": "scheduled-orders",
    "category": "feature",
    "metaTitle": "Scheduled Orders & Pre-Ordering | Fee Free Ordering",
    "metaDescription": "Let customers schedule orders for later — lunch pre-orders, advance pickups, catering dates. Orders placed while you're closed ring the moment you reopen.",
    "h1": "Scheduled orders and pre-ordering, handled cleanly",
    "eyebrow": "ORDER AHEAD",
    "intro": "Not every order is for right now. Fee Free Ordering lets customers schedule orders for a future time — the 12:30 lunch pickup, the Friday catering drop, the order placed at midnight for tomorrow. Orders placed while you're closed wait politely and ring your kitchen the moment you reopen, so you're never woken by a 2 a.m. order alert.",
    "painPoint": {
      "title": "Either no order-ahead, or chaos at the counter",
      "body": "Without scheduling, the lunch rush all lands at once and catering gets coordinated by phone and sticky notes. Scheduled orders smooth the curve: customers pick a time, the kitchen sees what's coming, and prep is planned instead of panicked."
    },
    "benefits": [
      {
        "title": "Customers pick a future time",
        "body": "Diners schedule pickup or delivery for later in the day — or days ahead for catering. Each scheduled order shows the kitchen exactly when food is due, so you prep on time instead of all at once."
      },
      {
        "title": "Closed-restaurant orders defer politely",
        "body": "An order placed while you're closed doesn't ring at 3 a.m. — it's held and the alert fires when you reopen. You capture late-night demand without losing sleep over it."
      },
      {
        "title": "Catering and advance orders, organized",
        "body": "Take catering and large advance orders with their own service fees and minimums, scheduled for a specific date and time. The Kitchen Order App surfaces them on schedule so big jobs don't sneak up on you."
      }
    ],
    "faqs": [
      {
        "q": "Can customers order ahead for a specific time?",
        "a": "Yes. Customers can schedule pickup or delivery orders for a future time the same day, or days ahead for catering. The kitchen sees the due time so it can prep accordingly."
      },
      {
        "q": "What happens to orders placed when I'm closed?",
        "a": "They're accepted and deferred — the kitchen alert fires when you reopen rather than ringing in the middle of the night. You capture the demand without the 2 a.m. wake-up call."
      },
      {
        "q": "Does this work for catering?",
        "a": "Yes. Catering is its own service with its own fees and minimums, and scheduled orders let customers book it for a specific future date and time so you can plan large jobs in advance."
      },
      {
        "q": "How do scheduled orders appear to my kitchen?",
        "a": "They show on the Kitchen Order App anchored to when the food is due, with an accept countdown — so a pre-order for noon surfaces at the right moment, not the instant it's placed."
      }
    ]
  },
  {
    "slug": "facebook-ordering",
    "category": "feature",
    "metaTitle": "Facebook Ordering for Restaurants | Fee Free Ordering",
    "metaDescription": "Turn your Facebook page into an ordering channel: point its Order button at your free branded Fee Free page or embed the widget. 0% commission, no commission to Meta.",
    "h1": "Online ordering straight from your Facebook page",
    "eyebrow": "ORDER FROM FACEBOOK",
    "intro": "Your Facebook page already has the audience — it just needs a way to order. With Fee Free Ordering you point your page's call-to-action button (and your link-in-bio) at your free, branded ordering page, or embed the free ordering widget on a linked site. Followers tap, order, and you keep 100% on every direct order.",
    "painPoint": {
      "title": "Followers with nowhere to order",
      "body": "People discover you on Facebook, get hungry, and then have to hunt for a phone number or a menu PDF. Every step lost is an order lost. A single 'Order' button that opens a real ordering page captures that intent the moment it strikes."
    },
    "benefits": [
      {
        "title": "Wire up your page's Order button",
        "body": "Set your Facebook page's action button to your Fee Free ordering link so followers can tap straight through to a live, branded menu. Use the same link in your bio, posts, and stories."
      },
      {
        "title": "0% commission — Meta takes nothing",
        "body": "Orders that come from your Facebook traffic are direct orders: 0% commission, and free for your first 100 orders a month. The audience you built on Facebook converts without a middleman's cut."
      },
      {
        "title": "Turn social traffic into your customer list",
        "body": "Every Facebook-driven order saves to your own customer database. GrowthNet Smart Links and Autopilot win-backs then bring those followers back to order direct again — off-platform and commission-free."
      }
    ],
    "faqs": [
      {
        "q": "How do I add ordering to my Facebook page?",
        "a": "Create your branded ordering page (paste your GloriaFood menu link and it builds in seconds), then set your Facebook page's call-to-action button to that link. Followers tap it to order. You can also embed the free ordering widget on a linked website."
      },
      {
        "q": "Is there a Facebook-native ordering plugin?",
        "a": "There's no plugin to install inside Facebook. Instead, you link your free, branded Fee Free ordering page from your page's action button and bio — it's simpler, and there's nothing to maintain inside Facebook."
      },
      {
        "q": "Does Facebook or Meta take a commission?",
        "a": "No. Because customers order on your own branded page, these are direct orders at 0% commission, free for your first 100 orders each month. Meta isn't involved in the transaction."
      },
      {
        "q": "Can people pay online when they order from Facebook?",
        "a": "Yes — add the optional online payments add-on and connect your own Stripe account so Facebook followers can pay by card on your ordering page."
      }
    ]
  },
  {
    "slug": "contactless-ordering",
    "category": "feature",
    "metaTitle": "Contactless Ordering for Restaurants | Fee Free Ordering",
    "metaDescription": "Offer contactless ordering: scan a QR code or order online, then pick up, get it delivered, or dine in. No app for the diner. 0% commission on direct orders.",
    "h1": "Contactless ordering — scan, order, no contact needed",
    "eyebrow": "NO-CONTACT ORDERING",
    "intro": "Contactless ordering keeps diners comfortable and your service fast: a guest scans a QR code or visits your link, orders from their own phone, and can pay online — then picks up, gets it delivered, dines in, or books catering. No shared menus, no waiting at a counter, no app to download. 0% commission on every direct order.",
    "painPoint": {
      "title": "Shared menus and counter crowds",
      "body": "Laminated menus passed table to table, a line bunched at the till, cash changing hands — diners notice, and it slows you down. Contactless ordering removes every shared touchpoint between a hungry guest and their food."
    },
    "benefits": [
      {
        "title": "Scan or click — no app, no contact",
        "body": "A QR code on the table or a link in your bio opens your branded menu in the guest's own browser. They browse, order, and pay without touching a shared menu, a kiosk, or your staff."
      },
      {
        "title": "Pickup, delivery, dine-in & catering built in",
        "body": "Each fulfillment option has its own fees and ETAs, so a guest can choose contactless pickup, no-contact delivery, dine-in, or a catering order — whatever keeps them comfortable. Orders ring straight to your kitchen."
      },
      {
        "title": "Pay online, hands-free",
        "body": "Add the optional online payments add-on and connect your own Stripe so guests pay by card on their phone — no cash, no terminal, fully contactless from menu to checkout."
      }
    ],
    "faqs": [
      {
        "q": "What makes the ordering contactless?",
        "a": "Guests order from their own phone — by scanning a QR code or opening your link — and can pay online, then choose contactless pickup, delivery, dine-in, or catering. There's no shared menu, no kiosk, and no app to install."
      },
      {
        "q": "Do diners need to download an app?",
        "a": "No. Your branded menu opens directly in the phone's web browser, so contactless ordering works for any guest with a smartphone — nothing to download."
      },
      {
        "q": "Can customers pay without cash?",
        "a": "Yes — add the optional online payments add-on and connect your own Stripe account so guests pay by card on their phone, keeping the whole flow contactless."
      },
      {
        "q": "How do contactless orders reach my kitchen?",
        "a": "They ring instantly on the Kitchen Order App — even with the screen off — and print to your WiFi thermal printer, so contactless orders are just as reliable as any other, at 0% commission on direct orders."
      }
    ]
  },
  {
    "slug": "wordpress-restaurant-ordering-plugin",
    "category": "platform",
    "metaTitle": "WordPress Restaurant Ordering | Fee Free Ordering",
    "metaDescription": "Add commission-free online ordering to your WordPress restaurant site with a free embeddable widget. Paste one snippet, menu imported in seconds, 0% commission.",
    "h1": "Add online ordering to your WordPress restaurant site",
    "eyebrow": "WORDPRESS RESTAURANTS",
    "intro": "Keep the WordPress site you already love and bolt commission-free ordering onto it with Fee Free's free embeddable widget. Drop in a popup \"Order\" button, an inline embed, or a plain button-link using our step-by-step WordPress guide, and your menu imports in seconds. There's no bloated plugin to maintain and 0% commission on every direct order.",
    "painPoint": {
      "title": "WordPress ordering plugins are a maintenance trap",
      "body": "Most WordPress ordering plugins demand a paid add-on for delivery, a second one for payments, and a third for printing, then a core or theme update breaks the cart and your menu vanishes at dinner rush. You become the unpaid sysadmin for software you never wanted. Fee Free skips the heavy plugin entirely: you paste one small embed snippet (or just point your existing Order link at your Fee Free page), and the ordering itself runs on our hosted, fully managed page. A WordPress update can't take your orders offline because there's nothing for it to break."
    },
    "benefits": [
      {
        "title": "Paste the embed, no plugin to maintain",
        "body": "Our WordPress guide walks you through adding a popup launcher, an inline iframe embed, or a button-link. The snippet goes into a Custom HTML block or your theme's code area in minutes, and there's nothing running inside WordPress to update, patch, or break on the next core release. Prefer the simplest path? Just point your existing site's Order link at your Fee Free page."
      },
      {
        "title": "Your menu rebuilt in seconds",
        "body": "Paste your existing menu link and Fee Free imports the whole thing, sizes, crusts, modifier groups, and photos, onto a live ordering page in seconds. No retyping every pizza into a WordPress form. You can see it working before you ever create an account."
      },
      {
        "title": "Orders ring on a real kitchen tablet",
        "body": "Every order lands in the native Kitchen Order App on your iOS or Android tablet and rings instantly, even with the screen off. Auto-accept, an accept countdown, and a missed-order phone call to the owner mean nothing slips through, and WiFi thermal printing fires the ticket straight to your Star, Epson, Bixolon, or Citizen printer."
      }
    ],
    "faqs": [
      {
        "q": "Is there a Fee Free Ordering WordPress plugin?",
        "a": "There's no heavyweight plugin to install and babysit. Instead you paste a small, free embeddable widget snippet, either a popup Order button, an inline embed, or a button-link, using our step-by-step WordPress guide. Nothing runs as a WordPress plugin, so theme and core updates can't break your ordering."
      },
      {
        "q": "How do I add the ordering widget to my WordPress site?",
        "a": "Follow our WordPress install guide: copy the snippet from your dashboard and paste it into a Custom HTML block (for the inline embed or button-link) or your site-wide code area (for the popup launcher). It works in any WordPress theme. You can also simply point an existing menu or Order button at your Fee Free page."
      },
      {
        "q": "How much commission does Fee Free charge on WordPress orders?",
        "a": "0% on direct orders. Your first 100 orders each month are free, and after that you only pay for optional a-la-carte add-ons you choose, never a cut of your sales."
      },
      {
        "q": "How long does it take to set up?",
        "a": "Minutes. Paste your menu link to import your full menu instantly, set your pickup, delivery, dine-in, and catering fees and hours, then paste the embed snippet into WordPress. You can try the menu import with no signup first to see exactly how your menu looks."
      },
      {
        "q": "Can I take delivery and catering orders too?",
        "a": "Yes. Your branded ordering page supports pickup, delivery, dine-in, and catering, each with its own fees, ETAs, and order minimums. You can also enable scheduled orders and QR-code ordering for tables."
      }
    ]
  },
  {
    "slug": "wordpress-restaurant-reservation-system",
    "category": "platform",
    "metaTitle": "WordPress Reservation System | Fee Free Ordering",
    "metaDescription": "Add a reservation system to your WordPress restaurant site with no plugin to install, conflict, or patch. Reservations plus reserve-then-order, embed in minutes.",
    "h1": "A WordPress Restaurant Reservation System With No Plugin to Maintain",
    "eyebrow": "Works with any WordPress theme",
    "intro": "WordPress runs more restaurant websites than any other CMS, which is exactly why bolt-on reservation plugins are such a headache. Every plugin you add is another moving part that can clash with your page builder, break when WordPress core or your theme updates, and demand its own security patches. Fee Free Ordering takes a different route: your reservation page is hosted and maintained by us, and you simply embed it on your WordPress site. There is nothing to install in wp-admin, nothing to update, and nothing that can conflict with the rest of your stack. Drop in a popup launcher, an inline iframe, or a button-link, and guests can book a table, or book and pre-order in one flow, while your kitchen gets the booking instantly.",
    "painPoint": {
      "title": "Reservation plugins are the first thing to break on update day",
      "body": "If you have ever hit the WordPress update button and watched your booking form vanish, you know the pattern. Reservation plugins hook deep into your theme and other plugins, so a core update, a theme change, or even an unrelated plugin can take your table bookings offline without warning. Then it is on you (or your developer) to diagnose the conflict, roll things back, and apply the next security patch before someone exploits the old one. That is maintenance work no restaurant owner signed up for, and every hour the form is down is a table that doesn't get booked."
    },
    "benefits": [
      {
        "title": "Nothing to install, conflict, or patch",
        "body": "Because your reservation page is hosted on Fee Free Ordering, there is no plugin sitting inside WordPress waiting to break. Core updates, theme switches, and other plugins can't take your bookings down, and the security patching is our job, not yours. You paste one embed snippet and it keeps working."
      },
      {
        "title": "Reservations and reserve-then-order in one flow",
        "body": "Guests can book a table on its own, or book a table and pre-order their food in a single checkout, so the kitchen knows what to prep before they walk in. The Kitchen Order App rings the moment a new booking lands, so nothing sits unnoticed. Taking a deposit at booking is coming soon."
      },
      {
        "title": "Free to start, 0% commission on direct orders",
        "body": "Your first 100 orders each month are free, and you never pay commission on direct orders the way the big marketplaces charge. Add only the à-la-carte extras you actually want. Built in Canada, with the booking flow available in 38 languages for your guests."
      }
    ],
    "faqs": [
      {
        "q": "Do I need to install a WordPress plugin?",
        "a": "No. Fee Free Ordering is a hosted reservation page you embed on your existing WordPress site. There is no plugin to add in wp-admin, so there is nothing to keep updated, nothing that can conflict with your theme or other plugins, and nothing for you to security-patch."
      },
      {
        "q": "Will a WordPress core or theme update break my reservations?",
        "a": "It won't. Your booking page lives on Fee Free Ordering's servers, not inside your WordPress install, so updating WordPress core, switching themes, or adding other plugins can't take your reservation form offline."
      },
      {
        "q": "How do I add it to my WordPress site?",
        "a": "Paste a single embed snippet wherever you want bookings to appear. You can use a popup Order/Book launcher, an inline iframe embedded in a page, or a simple button-link. It works with the block editor, classic editor, and popular page builders."
      },
      {
        "q": "Can guests book a table and pre-order food at the same time?",
        "a": "Yes. Reserve-then-order lets a guest book a table and pre-order their meal in one submission, so your kitchen can prep ahead. The Kitchen Order App rings instantly when the booking comes in."
      },
      {
        "q": "Can I charge a deposit when someone books?",
        "a": "Deposits at booking are coming soon. Today you can take reservations and reserve-then-order bookings; deposit collection will be added as an option, and we'll announce it when it ships."
      }
    ]
  },
  {
    "slug": "wix-restaurant-ordering",
    "category": "platform",
    "metaTitle": "Wix Restaurant Online Ordering | Fee Free Ordering",
    "metaDescription": "Add commission-free online ordering to your Wix restaurant site with a free embeddable widget. Use our Wix install guide, menu imported in seconds, 0% commission.",
    "h1": "Add online ordering to your Wix restaurant site",
    "eyebrow": "WIX RESTAURANTS",
    "intro": "Built your restaurant site on Wix and hit a wall when you tried to take real orders? Wix's own ordering tools get expensive fast and lock you in. Add Fee Free's free embeddable widget instead, a popup Order button, an inline embed, or a button-link, using our step-by-step Wix install guide. Pickup, delivery, dine-in, and catering, with 0% commission on every direct order.",
    "painPoint": {
      "title": "Wix ordering nickel-and-dimes you on every plate",
      "body": "Wix Restaurants and the marketplace apps it pushes layer monthly fees on top of per-order cuts, and you still can't print to a real kitchen printer or get a tablet that rings when an order lands. You end up paying more the busier you get, the exact opposite of what you want. Fee Free flips it: your ordering page is free for the first 100 orders a month and 0% commission on direct orders, so growth makes you money instead of costing it. You keep your Wix design and just embed the widget."
    },
    "benefits": [
      {
        "title": "Use the Wix guide to embed in minutes",
        "body": "Our Wix install guide shows exactly where to paste the snippet, an Embed/Custom Code element for the popup launcher or inline menu, or an HTML element for the button-link. The Order button or full menu appears right inside your Wix layout, with nothing to maintain."
      },
      {
        "title": "Import your menu, skip the data entry",
        "body": "Paste your menu link and your full menu, sizes, options, modifier groups, and photos, rebuilds on a live ordering page in seconds. No re-creating every dish in the Wix editor. Try it before you sign up to see your real menu live."
      },
      {
        "title": "A kitchen tablet that actually rings",
        "body": "Orders land in the native Kitchen Order App and ring instantly, even screen-off, with auto-accept and a missed-order call to the owner. WiFi thermal printing sends tickets to Star, Epson, Bixolon, and Citizen printers, the real kitchen workflow Wix can't give you."
      }
    ],
    "faqs": [
      {
        "q": "Is there a Wix embed for Fee Free Ordering?",
        "a": "Yes. Fee Free has a free embeddable widget, and we ship a step-by-step Wix install guide. You can add a popup Order button, an inline embed that shows the menu in your page, or a plain button-link, whichever you prefer."
      },
      {
        "q": "Do I have to replace my Wix website?",
        "a": "No. Keep your Wix site exactly as it is. You paste the Fee Free widget snippet into a Wix Embed or HTML element, or simply point your existing Order button at your Fee Free page. The ordering runs on our hosted, branded page."
      },
      {
        "q": "How does this compare to Wix Restaurants on cost?",
        "a": "Fee Free is 0% commission on direct orders and free for your first 100 orders each month. You only pay for optional a-la-carte add-ons you choose, there's no per-order cut on your direct sales, unlike typical Wix restaurant ordering setups."
      },
      {
        "q": "Will the embed slow down or clutter my Wix site?",
        "a": "No. The popup launcher is a small floating button until a customer clicks it, the inline embed loads the menu only where you place it, and the button-link is plain HTML. There's nothing to install inside Wix and nothing to keep updated."
      },
      {
        "q": "What order types are supported?",
        "a": "Pickup, delivery, dine-in, and catering, each with its own fees, ETAs, and minimums. You can also turn on scheduled orders and QR-code ordering for in-store tables."
      }
    ]
  },
  {
    "slug": "squarespace-restaurant-ordering",
    "category": "platform",
    "metaTitle": "Squarespace Restaurant Ordering | Fee Free Ordering",
    "metaDescription": "Add online ordering to your Squarespace restaurant site with a free embeddable widget. Use our Squarespace guide, menu imported in seconds, 0% commission on direct orders.",
    "h1": "Add online ordering to your Squarespace restaurant site",
    "eyebrow": "SQUARESPACE RESTAURANTS",
    "intro": "Squarespace makes a beautiful restaurant site, but it was never built to run a kitchen. Keep your gorgeous Squarespace design and add Fee Free's free embeddable widget, a popup Order button, an inline embed, or a button-link, using our step-by-step Squarespace install guide. Your menu imports in seconds and every direct order is 0% commission.",
    "painPoint": {
      "title": "Squarespace looks great but can't run service",
      "body": "Squarespace gives you elegant pages and zero real ordering: no kitchen tablet that rings, no thermal printing, no per-order-type fees, no modifier groups for build-your-own dishes. Generic store carts look out of place and still treat a pizza like a flat product. Fee Free leaves your beautiful Squarespace site alone, you simply drop in our embeddable widget via a Code Block, and hands the actual ordering to a purpose-built, branded page. The front of your brand stays beautiful while the back of house finally works."
    },
    "benefits": [
      {
        "title": "Embed via a Code Block using the Squarespace guide",
        "body": "Our Squarespace install guide shows exactly where the snippet goes, a Code Block for the inline embed or button-link, or Code Injection for the site-wide popup launcher. The Order button or menu sits right inside your design, with nothing to maintain."
      },
      {
        "title": "A menu that matches yours, instantly",
        "body": "Paste your menu link and Fee Free rebuilds the whole thing, sizes, crusts, modifier groups, and photos, on a live ordering page in seconds. No fighting Squarespace blocks to recreate a complicated menu by hand."
      },
      {
        "title": "Real back-of-house tools, zero commission",
        "body": "Orders ring on a native Kitchen Order App even screen-off, auto-accept and a missed-order phone call keep service tight, and WiFi thermal printing fires tickets to Star, Epson, Bixolon, and Citizen printers. All on direct orders that cost you 0% commission."
      }
    ],
    "faqs": [
      {
        "q": "Is there a Squarespace embed for Fee Free Ordering?",
        "a": "Yes. Fee Free ships a free embeddable widget plus a step-by-step Squarespace install guide. You can add a popup Order button, an inline embed that shows the menu in your page, or a plain button-link, using a Code Block or Code Injection."
      },
      {
        "q": "Will adding ordering mess up my Squarespace design?",
        "a": "No. The popup launcher is a small floating button until clicked, and the inline embed appears only where you place a Code Block, so your Squarespace layout and styling stay exactly as you built them. You can also just link your existing Order button to your Fee Free page."
      },
      {
        "q": "Can my menu's customizations come through?",
        "a": "Yes. The menu import brings over sizes, crusts, and modifier groups along with photos, so build-your-own and customizable items work properly on the ordering page, something native Squarespace blocks struggle with."
      },
      {
        "q": "What does it cost?",
        "a": "Direct orders are 0% commission and your first 100 orders each month are free. Optional a-la-carte add-ons, where you pay only for what you use, are the only things you'd ever pay for."
      },
      {
        "q": "Do I need to be on a paid Squarespace plan to embed code?",
        "a": "Code Blocks and Code Injection are available on Squarespace's standard business and commerce plans. If yours supports them, our guide walks you through the paste step by step; if not, you can always just link your existing Order button to your Fee Free page."
      }
    ]
  },
  {
    "slug": "weebly-restaurant-ordering",
    "category": "platform",
    "metaTitle": "Weebly Restaurant Online Ordering | Fee Free Ordering",
    "metaDescription": "Add online ordering to your Weebly restaurant site with a free embeddable widget. Paste the snippet into any HTML block, menu imported in seconds, 0% commission.",
    "h1": "Add online ordering to your Weebly restaurant site",
    "eyebrow": "WEEBLY RESTAURANTS",
    "intro": "Weebly is simple to keep running, and your ordering should be just as simple. Fee Free's free embeddable widget drops straight into a Weebly Embed Code element, the inline embed and button-link snippets paste into any HTML block, so you don't need a named integration. Import your menu, set your fees, and start taking 0% commission orders.",
    "painPoint": {
      "title": "Weebly has no real restaurant ordering, and the workarounds hurt",
      "body": "Weebly's app center was never built for restaurants, so owners end up bolting on a generic store cart that can't handle pizza sizes, can't ring a kitchen tablet, and can't print a ticket. The fallback is a delivery marketplace that skims a hefty cut off every order. Fee Free gives Weebly owners a genuinely better path: keep your easy-to-manage Weebly site, paste our embeddable widget into an Embed Code block, and route orders to a hosted page built for food, with 0% commission on direct orders and your first 100 orders a month free."
    },
    "benefits": [
      {
        "title": "Paste into any Weebly HTML block",
        "body": "Because the inline embed and button-link are plain HTML, they drop straight into Weebly's Embed Code element, no named Weebly integration needed. Add the popup Order button or an inline menu wherever you like, and your simple Weebly site stays simple."
      },
      {
        "title": "Set up as fast as Weebly itself",
        "body": "Paste your menu link and your full menu, sizes, options, modifier groups, photos, rebuilds on a live ordering page in seconds. There's no signup needed to try it, so you can confirm everything looks right before committing."
      },
      {
        "title": "Skip the marketplace cut",
        "body": "Every direct order is 0% commission, so you stop handing a slice of every ticket to a delivery app. Orders ring on a native Kitchen Order App even screen-off, with auto-accept, a missed-order owner call, and WiFi thermal printing to Star, Epson, Bixolon, and Citizen printers."
      }
    ],
    "faqs": [
      {
        "q": "Does Weebly work with Fee Free Ordering even without a dedicated app?",
        "a": "Yes. Fee Free's embed snippets are plain HTML, so the inline embed and button-link paste right into Weebly's Embed Code element. There's no named Weebly integration to wait for, and the popup launcher works site-wide too."
      },
      {
        "q": "Where exactly do I paste the widget in Weebly?",
        "a": "Drag an Embed Code element onto your page, click to edit its HTML, and paste the inline embed or button-link snippet from your dashboard. For the floating popup button, add the snippet to your site-wide footer code. Or just point an existing Order button at your Fee Free page."
      },
      {
        "q": "Can Fee Free handle a complex menu Weebly's store can't?",
        "a": "Yes. The menu import brings over sizes, crusts, modifier groups, and photos, so customizable items work correctly, unlike a generic Weebly store cart that treats everything as a flat product."
      },
      {
        "q": "How much will I save versus a delivery app?",
        "a": "Delivery marketplaces typically take a sizable cut per order. Fee Free charges 0% commission on direct orders and gives you your first 100 orders each month free, so the savings on direct ordering are substantial."
      },
      {
        "q": "How do customers pay?",
        "a": "You can take orders for cash or in-person payment, or add the optional online card payments add-on to accept cards on your ordering page, paying only for the add-ons you actually use."
      }
    ]
  },
  {
    "slug": "drupal-restaurant-reservation-system",
    "category": "platform",
    "metaTitle": "Drupal Reservation System | Fee Free Ordering",
    "metaDescription": "Add restaurant reservations to your Drupal site with no contributed module to security-patch or version-match. Paste one embed snippet into any block or region.",
    "h1": "A Drupal Restaurant Reservation System With Nothing to Patch",
    "eyebrow": "Drops into any block or region",
    "intro": "Drupal restaurant sites are usually built by an agency or developer, often as part of a multisite setup, and that is precisely why a contributed reservation module is a liability. Every contrib module you add becomes one more thing your team has to keep on Drupal's security release cadence and re-test for compatibility every time you move between Drupal versions. Fee Free Ordering avoids all of it. The reservation page is hosted and maintained by us, so you paste one embed snippet into any block or region and you are done. No module to enable, no composer dependency to track, no version matrix to babysit, no security advisories to chase, across one site or a whole multisite fleet.",
    "painPoint": {
      "title": "Contrib modules turn every Drupal upgrade into a compatibility audit",
      "body": "Anyone who has shepherded a Drupal site through a major version knows the drill: before you can upgrade, you have to confirm every contributed module is ready, find a replacement for the ones that aren't, and patch anything flagged in a security advisory in the meantime. A reservation module pulls your booking flow straight into that cycle. Multiply that across a multisite, and a single lagging module can block an entire upgrade or leave a known vulnerability exposed while your developer scrambles. For a restaurant, that is risk and billable hours with no payoff."
    },
    "benefits": [
      {
        "title": "No module to version-match or security-patch",
        "body": "Your reservation page is hosted by Fee Free Ordering, so there is no contrib module in your codebase to keep compatible across Drupal versions and no security advisories to monitor. Major-version upgrades stop being blocked by your booking flow, because it lives entirely outside Drupal."
      },
      {
        "title": "One snippet, any block, any site in your multisite",
        "body": "Paste the embed snippet into a block, a region, or a page template and reuse the exact same snippet across every site in a multisite. Offer it as a popup launcher, an inline iframe, or a button-link, with no composer changes and no per-site module configuration."
      },
      {
        "title": "Reservations and reserve-then-order, ringing the kitchen live",
        "body": "Guests can book a table, or book and pre-order food together in one flow, and the Kitchen Order App rings the instant a booking arrives. It is free for your first 100 orders a month with 0% commission on direct orders, built in Canada, and available in 38 languages. Deposits at booking are coming soon."
      }
    ],
    "faqs": [
      {
        "q": "Do I need to install a Drupal contrib module?",
        "a": "No. Fee Free Ordering is a hosted reservation page you embed via a snippet. There is no contributed module to enable, no composer dependency to manage, and nothing in your Drupal codebase to keep on the security release cycle."
      },
      {
        "q": "Will it survive a Drupal major-version upgrade?",
        "a": "Yes. Because the booking flow is hosted outside Drupal, it can't block or be broken by a major-version upgrade the way a contrib module can. You upgrade Drupal on your own schedule and the embed keeps working."
      },
      {
        "q": "Can I use the same embed across a multisite?",
        "a": "Yes. The same embed snippet drops into a block or region on any site in your multisite. There is no per-site module to install or configure, so rolling it out across many sites is just pasting the snippet."
      },
      {
        "q": "Where exactly does the snippet go?",
        "a": "Anywhere you can add markup: a custom block, a region in your theme, a page template, or a body field. You can present it as a popup Order/Book launcher, an inline iframe, or a button-link."
      },
      {
        "q": "Can guests pre-order with their reservation, and can I take a deposit?",
        "a": "Reserve-then-order lets a guest book a table and pre-order food in one submission, and the kitchen is alerted instantly. Charging a deposit at booking is coming soon, so today the flow covers reservations and reserve-then-order."
      }
    ]
  },
  {
    "slug": "joomla-restaurant-reservation-system",
    "category": "platform",
    "metaTitle": "Joomla Reservation System | Fee Free Ordering",
    "metaDescription": "Add restaurant reservations to your Joomla site without juggling a component, module, and plugin. One hosted booking page, one embed snippet, zero extensions to update.",
    "h1": "A Joomla Restaurant Reservation System With Zero Extensions to Update",
    "eyebrow": "One snippet, no extension stack",
    "intro": "On Joomla, a reservation feature rarely arrives as one tidy thing. It usually means installing a component for the back-end, a module to surface it on your pages, and a plugin to tie it into the rest of the site, each on its own update cycle. That is three sources of update fatigue for a single booking form, and any one of them can fall behind, conflict, or need a security release at the worst possible moment. Fee Free Ordering replaces the whole stack with one hosted booking page and one embed snippet. There is no component to install, no module to publish, and no plugin to enable, so there is nothing in your Joomla extensions list to update or worry about.",
    "painPoint": {
      "title": "A reservation extension is really three things to keep updated",
      "body": "Joomla's component-plus-module-plus-plugin pattern means your booking feature spreads across three extension types, and each ships updates on its own timeline. Miss one and you risk a layout that suddenly stops rendering, a back-end that no longer matches the front-end, or a security hole left open until the next release lands. Add the major-version jumps Joomla itself goes through, and keeping all three pieces compatible turns a simple table-booking form into a recurring maintenance chore. Most restaurant owners just want bookings to work, not to manage an extension stack."
    },
    "benefits": [
      {
        "title": "One booking page instead of a component-module-plugin stack",
        "body": "Fee Free Ordering hosts your entire reservation flow as a single page, so you skip the Joomla component, module, and plugin altogether. There are no separate extensions to install, publish, or enable, and therefore no tangle of update cycles to keep aligned."
      },
      {
        "title": "Zero extensions to update, ever",
        "body": "Since nothing is installed in your Joomla extensions list, there is nothing there to update or security-patch for bookings. Joomla core and major-version upgrades can't break a form that lives outside your install. You paste one snippet and it keeps running."
      },
      {
        "title": "Reservations and reserve-then-order, free to start",
        "body": "Guests can book a table, or book and pre-order in one flow, with the Kitchen Order App ringing the moment a booking lands. It is free for your first 100 orders a month, 0% commission on direct orders, built in Canada, and available in 38 languages. Deposits at booking are coming soon."
      }
    ],
    "faqs": [
      {
        "q": "Do I need a Joomla component, module, and plugin for this?",
        "a": "No. Fee Free Ordering is a single hosted booking page you embed with one snippet. You don't install a component, module, or plugin, so there is no multi-part extension stack to set up or keep in sync."
      },
      {
        "q": "How many extension update cycles am I taking on?",
        "a": "Zero. Because nothing is installed in your Joomla extensions list for bookings, there is nothing to update or security-patch. The reservation page is maintained on our servers, not inside your Joomla site."
      },
      {
        "q": "How do I add the booking page to a Joomla site?",
        "a": "Paste the embed snippet into an article, a custom HTML module, or your template. You can offer it as a popup Order/Book launcher, an inline iframe, or a button-link, with no extension installs."
      },
      {
        "q": "Will a Joomla update break my reservations?",
        "a": "It won't. The booking flow is hosted outside Joomla, so updating Joomla core or moving to a new major version can't take your reservation page down the way an out-of-date extension can."
      },
      {
        "q": "Can guests pre-order when they book, and can I collect a deposit?",
        "a": "Reserve-then-order lets a guest book a table and pre-order food in a single submission, and the kitchen is alerted instantly. Charging a deposit at booking is coming soon; today the flow supports reservations and reserve-then-order."
      }
    ]
  },
  {
    "slug": "shopify-restaurant-ordering",
    "category": "platform",
    "metaTitle": "Shopify Restaurant Online Ordering | Fee Free Ordering",
    "metaDescription": "Add restaurant online ordering to your Shopify site with a free embeddable widget. Use our Shopify guide, food-native menu in seconds, pickup, delivery, 0% commission.",
    "h1": "Add restaurant ordering to your Shopify site",
    "eyebrow": "SHOPIFY RESTAURANTS",
    "intro": "Shopify is brilliant for selling products, but it wasn't built for food service, no pizza sizes, no kitchen tablet, no thermal printing. Keep your Shopify store for merch and gift cards and add Fee Free's free embeddable widget for the actual food, a popup Order button, an inline embed, or a button-link, using our step-by-step Shopify install guide. Your menu imports in seconds and direct orders are 0% commission.",
    "painPoint": {
      "title": "Shopify treats a build-your-own pizza like a t-shirt",
      "body": "Shopify's product model and checkout were designed for shippable goods, so a customizable menu turns into a mess of variants, the food-ordering apps charge monthly plus per-order fees, and there's still no tablet that rings or printer that fires a kitchen ticket. Fee Free doesn't fight Shopify, it complements it. Keep your store for retail items and paste our embeddable widget into a theme section or page so customers order food on a page built for it, with real modifier groups, kitchen alerts, and printing, all at 0% commission on direct orders."
    },
    "benefits": [
      {
        "title": "Embed via the Shopify guide, keep your store",
        "body": "Our Shopify install guide shows where the snippet goes, a Custom Liquid section or a page's code view for the inline embed or button-link, or theme.liquid for the site-wide popup launcher. Run retail and gift cards on Shopify as you do today, and let Fee Free handle the food."
      },
      {
        "title": "A food-native menu, not product variants",
        "body": "Paste your menu link and Fee Free rebuilds it in seconds with sizes, crusts, modifier groups, and photos, handled properly as a restaurant menu, not forced into Shopify's product-variant system. Try it with no signup to see your menu live."
      },
      {
        "title": "Kitchen alerts and printing Shopify can't do",
        "body": "Orders ring on the native Kitchen Order App even screen-off, with auto-accept and a missed-order phone call to the owner. WiFi thermal printing sends tickets to Star, Epson, Bixolon, and Citizen printers, and every direct order is 0% commission instead of a food app's monthly-plus-per-order fees."
      }
    ],
    "faqs": [
      {
        "q": "Is there a Shopify embed for Fee Free Ordering?",
        "a": "Yes. Fee Free has a free embeddable widget plus a step-by-step Shopify install guide. You can add a popup Order button, an inline embed that shows the menu in your storefront, or a plain button-link, using a Custom Liquid section or theme code."
      },
      {
        "q": "Why not just use Shopify's checkout for food orders?",
        "a": "Shopify's checkout is built for shippable products, so customizable menu items become awkward variants and there's no kitchen tablet or thermal printing. Fee Free handles real modifier groups, rings orders to a kitchen tablet, and prints tickets, the food-service workflow Shopify lacks."
      },
      {
        "q": "Can I keep selling retail products on Shopify?",
        "a": "Absolutely. Keep Shopify for merch, gift cards, and any shippable goods. Fee Free just handles the food ordering through the embedded widget on its own branded page, which sits alongside your store."
      },
      {
        "q": "What does Fee Free cost compared to a Shopify food app?",
        "a": "Direct orders are 0% commission and your first 100 orders each month are free, versus typical food-ordering apps that charge a monthly fee plus a cut per order. You only pay for optional a-la-carte add-ons if you choose them."
      },
      {
        "q": "Will the widget conflict with my Shopify theme?",
        "a": "No. The popup launcher is a small floating button until clicked, the inline embed loads only where you place it, and the button-link is plain HTML, so your theme and product pages keep working exactly as before. You can also just link your existing Order button to your Fee Free page."
      }
    ]
  },
  {
    "slug": "online-ordering-system-toronto",
    "category": "city",
    "metaTitle": "Online Ordering System Toronto | Fee Free Ordering",
    "metaDescription": "0% commission online ordering for Toronto restaurants. Own your channel instead of renting it from the aggregators, keep your customer list, and go live in minutes.",
    "h1": "Online ordering system for Toronto restaurants",
    "eyebrow": "TORONTO, ON",
    "intro": "Toronto has the highest delivery volume and the fiercest cuisine competition in the country — Kensington taquerias, Scarborough Hakka, Gerrard South Asian, King West gastropubs — and on the aggregators they all fight for the same ranking while paying for it. As of 2026 the big apps typically take around 25–30% per order. Fee Free Ordering hands you the one thing that competition can't: your own branded ordering page at 0% commission, where the customer is yours, not the marketplace's.",
    "painPoint": {
      "title": "In Toronto, the channel you don't own owns you",
      "body": "When all your demand flows through Uber Eats, DoorDash, and SkipTheDishes, you're not a restaurant with customers — you're a listing competing on someone else's ranking, paying roughly a quarter to a third of every ticket for the privilege. In a market this dense, the restaurants that win long-term are the ones that own their ordering channel: their page, their data, their margin. That's the whole point of this system."
    },
    "benefits": [
      {
        "title": "Own the channel, not just a listing",
        "body": "Your Liberty Village or Leslieville regular orders from a page that's yours — your brand, your menu, your customer record. Every direct order builds your own database, and GrowthNet Smart Links, QR codes, and Autopilot win-back emails bring that diner back commission-free instead of you paying the aggregator again to reach the same person."
      },
      {
        "title": "Stand out across every cuisine",
        "body": "On an aggregator your dumpling house and the burger joint next door look identical. Your own page imports cleanly from your GloriaFood link — categories, sizes, modifier groups, photos — and rebuilds live in seconds, so your menu presents the way you'd plate it, not flattened into a marketplace template."
      },
      {
        "title": "A kitchen that survives a downtown rush",
        "body": "Orders ring the instant they land on the native Kitchen Order App, even screen-off, and print to your Star, Epson, Bixolon, or Citizen WiFi thermal printer. Miss one on a packed Friday and it phones the owner. Pickup, delivery, dine-in, and catering each carry their own fees and ETAs."
      }
    ],
    "faqs": [
      {
        "q": "How is this different from Uber Eats or DoorDash in Toronto?",
        "a": "Those marketplaces own the customer relationship and, as of 2026, typically take around 25–30% commission per order. Fee Free Ordering is your own branded page: 0% commission on direct orders, free for your first 100 orders a month, and every customer who orders becomes part of YOUR database to remarket to directly — no per-order tax to reach them again."
      },
      {
        "q": "Can I still list on the apps and run my own page too?",
        "a": "Yes — many Toronto restaurants do both. Use the aggregators for discovery if you like, then drive your regulars to your own page with QR codes on the bag and Smart Links. The orders you bring in directly cost 0% commission, so every customer you shift over is pure recovered margin."
      },
      {
        "q": "I already have a website. Do I need to rebuild it?",
        "a": "No. Keep your current site and point its 'Order' button at your free Fee Free page — nothing to install or maintain on the existing site. (Putting it on your own domain is coming soon.)"
      },
      {
        "q": "How fast can my Toronto restaurant be taking orders?",
        "a": "Minutes. Paste your existing GloriaFood menu link and your full menu rebuilds on a live ordering page in seconds — sizes, modifier groups, and photos included. Try it with no account, then claim it when you're ready. Ontario's 13% HST is applied correctly out of the box."
      },
      {
        "q": "What does it cost a Toronto restaurant?",
        "a": "0% commission on every direct order and free for your first 100 orders each month. Add only the optional à-la-carte add-ons you actually use — you pay for what you use, nothing bundled, no contracts."
      }
    ]
  },
  {
    "slug": "online-ordering-system-mississauga",
    "category": "city",
    "metaTitle": "Online Ordering System Mississauga | Fee Free Ordering",
    "metaDescription": "Commission-free online ordering for Mississauga restaurants. Built for big family and catering orders and wide multi-neighbourhood delivery zones with per-zone fees.",
    "h1": "Online ordering system for Mississauga restaurants",
    "eyebrow": "MISSISSAUGA, ON",
    "intro": "Mississauga is a big suburban city of families who order in volume — Square One crowds, South Asian and Halal kitchens along Hurontario, Dixie, and Britannia, and large platter and catering orders for weekends and events. It's also spread out, so a delivery to Meadowvale costs you very differently than one to Cooksville. Fee Free Ordering lets you set per-zone delivery fees and price big orders the way you actually serve them — at 0% commission on direct orders.",
    "painPoint": {
      "title": "Big orders and long drives priced by someone else",
      "body": "On an aggregator, a $180 family platter and a wide cross-city delivery are both flattened into the same commission model — and you give up roughly a quarter to a third of that large ticket while having no real control over how distance is charged. In a sprawling, family-driven city, the orders that should be your most profitable become your most taxed. Owning your page lets you set the zones, fees, and minimums yourself."
    },
    "benefits": [
      {
        "title": "Per-zone delivery, priced your way",
        "body": "Pickup, delivery, dine-in, and catering are each their own service with independent fees, order minimums, and ETAs. Charge a Streetsville pickup, a Meadowvale delivery, and an Erin Mills run exactly what each one is worth — and keep 100% of the food total on direct orders, cash or your own connected Stripe."
      },
      {
        "title": "Built for platters and family orders",
        "body": "Many Mississauga kitchens run large menus with combo trays and party platters. Paste your GloriaFood link and the whole thing — spice levels, combo and platter modifier groups, photos — rebuilds on a live page in seconds, ready for the big weekend and event orders, with scheduled order-ahead so the kitchen isn't ambushed."
      },
      {
        "title": "Turn a one-off catering order into a regular",
        "body": "An office or family that orders a big tray once should come back direct, not through an app. Every order grows your own customer list; GrowthNet QR codes on the bag, Smart Links, and SMS or Autopilot win-back offers bring that customer back at 0% commission next time."
      }
    ],
    "faqs": [
      {
        "q": "Can I set different delivery fees for different Mississauga neighbourhoods?",
        "a": "Yes. Delivery is its own service with its own fees, order minimums, and ETAs, so you can price a long Meadowvale or Erin Mills run differently from a nearby Cooksville drop — and keep 100% of the food total on direct orders rather than handing a commission cut to an app."
      },
      {
        "q": "Can it handle big catering and platter orders?",
        "a": "Yes. Catering is its own service type, combo and platter modifier groups import straight from your GloriaFood menu, and customers can schedule orders in advance — built for the family meals, office lunches, and event trays Mississauga restaurants do a lot of."
      },
      {
        "q": "How do I move my large menu over without re-typing it?",
        "a": "Paste your existing GloriaFood menu link on our import page and your full menu — sizes, spice levels, modifier groups, photos — rebuilds on a live ordering page in seconds. No account needed to try it; claim it when you like what you see."
      },
      {
        "q": "Does it handle Ontario HST?",
        "a": "Yes — built in Canada, it applies the 13% Ontario HST correctly on orders and on your own invoices, so your Mississauga receipts and books are right from day one."
      },
      {
        "q": "What does it cost?",
        "a": "0% commission on direct orders and free for your first 100 orders each month, with optional à-la-carte add-ons only when you need them — you pay only for what you use. No contracts."
      }
    ]
  },
  {
    "slug": "online-ordering-system-ontario",
    "category": "city",
    "metaTitle": "Online Ordering System Ontario | Fee Free Ordering",
    "metaDescription": "0% commission online ordering for Ontario restaurant groups. One hub for multiple locations across the province, consistent 13% HST, and 24/7 Canadian support.",
    "h1": "Online ordering system for Ontario restaurants",
    "eyebrow": "ONTARIO, CANADA",
    "intro": "Run more than one location across Ontario — a downtown flagship plus a suburban second site, or a small group expanding from a town to the GTA — and you need one system that behaves the same in every region. Fee Free Ordering is a provincial hub: manage multiple locations from one place, apply Ontario's 13% HST consistently everywhere, and lean on 24/7 Canadian phone support, all at 0% commission on direct orders.",
    "painPoint": {
      "title": "A growing Ontario group, stitched from mismatched tools",
      "body": "Most multi-location operators end up with a different setup at each site — one café on an aggregator, another on a website builder, a third on a clipboard — so menus drift, tax is handled inconsistently, and there's no single customer list across the province. Add the aggregators' roughly quarter-to-third commission on top and growth quietly leaks margin at every new location. A single provincial hub fixes the drift and keeps the margin."
    },
    "benefits": [
      {
        "title": "Many locations, one consistent system",
        "body": "Roll out from a small town to the GTA on the same platform with Multi-Location management — each site gets its own branded page, hours, and services while you oversee them together. Paste each location's GloriaFood menu link and a full ordering page rebuilds in seconds, so opening site number three is a paste, not a project."
      },
      {
        "title": "Consistent provincial HST and Canadian rules",
        "body": "Ontario's 13% HST is applied correctly on orders and on every location's invoices — the same way at each site, no per-store fiddling. Built in Canada, with 24/7 Canadian phone support from people who understand how Ontario restaurants actually run, not an overseas ticket queue."
      },
      {
        "title": "One customer list across every region",
        "body": "Instead of a fragmented following split across apps and sites, every direct order builds your own database. GrowthNet Smart Links, QR codes, promotions, and Autopilot win-back emails bring diners back to order direct — at 0% commission — whether they first found you in Kingston or Kitchener."
      }
    ],
    "faqs": [
      {
        "q": "Can I manage several Ontario locations from one place?",
        "a": "Yes. The Multi-Location add-on lets you run multiple sites from a single account — each with its own branded ordering page, hours, and services — while you oversee them together. New locations import their menu from a GloriaFood link in seconds, so expansion stays consistent across the province."
      },
      {
        "q": "Is Ontario HST handled the same way at every location?",
        "a": "Yes. Built in Canada, it applies the 13% Ontario HST correctly on orders and on each location's own invoices, identically across sites — so bookkeeping stays accurate everywhere from a downtown flagship to a small-town diner."
      },
      {
        "q": "Is there real Canadian support if something breaks on a Friday night?",
        "a": "Yes — 24/7 Canadian phone support. You reach people who understand Ontario restaurants, and the Kitchen Order App can phone the owner directly at any location if an order isn't accepted in time."
      },
      {
        "q": "Will it work for a restaurant outside the GTA?",
        "a": "Absolutely — it works for any Ontario restaurant, small-town diner, café, or city pizzeria. The ordering page, kitchen app, and emails are available in 38 languages, and each site sets its own pickup, delivery, dine-in, and catering services and zones."
      },
      {
        "q": "What does it cost an Ontario group?",
        "a": "0% commission on direct orders and free for your first 100 orders each month, per location. Optional à-la-carte add-ons such as Multi-Location only when you want them — you pay only for what you use, with no contracts."
      }
    ]
  },
  {
    "slug": "online-ordering-system-hamilton",
    "category": "city",
    "metaTitle": "Online Ordering System Hamilton | Fee Free Ordering",
    "metaDescription": "Commission-free online ordering for Hamilton's independents. Escape the aggregator cut on James North and Ottawa Street, run a full rush with two people, and keep 100%.",
    "h1": "Online ordering system for Hamilton restaurants",
    "eyebrow": "HAMILTON, ON",
    "intro": "Hamilton's food scene is built on value-conscious, owner-operated independents — the James Street North strip, Ottawa Street, Locke Street, Concession — kitchens that grew on word of mouth, not ad budgets. Those are exactly the businesses an aggregator commission (typically around 25–30% per order as of 2026) hits hardest. Fee Free Ordering gives your Hamilton restaurant its own branded ordering page at 0% commission on direct orders, free for your first 100 a month.",
    "painPoint": {
      "title": "A value-driven indie scene can't absorb a 30% cut",
      "body": "Hamilton diners shop on value, and Hamilton owners run on thin margins — a chef-driven $32 plate doesn't have a third to give away. Owner-operators here aren't trying to scale to fifty stores; they're trying to keep the doors open and the food honest. Handing the aggregators a quarter to a third of every order is the single biggest leak in that math. Direct ordering plugs it without changing your prices."
    },
    "benefits": [
      {
        "title": "A full rush, run by two people",
        "body": "No big team required. Paste your GloriaFood link and your menu rebuilds live in seconds. Orders ring instantly on the Kitchen Order App, even screen-off, print to your WiFi thermal printer, auto-accept if you want, and a missed one phones the owner — so one or two people can run the whole service without babysitting a tablet."
      },
      {
        "title": "Keep your price honest, keep your margin",
        "body": "Because direct orders cost 0% commission, you don't have to pad menu prices to cover an app's cut — the value your customers come to you for stays intact, and the margin stays in your kitchen. Free for your first 100 orders a month, then optional add-ons only if you want them."
      },
      {
        "title": "Take the table and the takeout",
        "body": "For the sit-down rooms on Locke or James North, take table reservations and reserve-then-order pre-orders from the same branded page as pickup and delivery, all landing on the same Kitchen Order App. (Charging a deposit at booking is coming soon.)"
      }
    ],
    "faqs": [
      {
        "q": "Can a small owner-run Hamilton restaurant handle this alone?",
        "a": "Yes — it's designed for exactly that. The menu imports itself from your GloriaFood link, orders ring on the Kitchen Order App even with the screen off, print to your thermal printer automatically, auto-accept is optional, and a missed order can phone the owner. One or two people can run a full service."
      },
      {
        "q": "How much do the delivery apps actually cost compared to this?",
        "a": "As of 2026 the major aggregators typically charge around 25–30% commission per order and own your customer relationship. Fee Free Ordering charges 0% commission on direct orders and is free for your first 100 orders a month — on a value-priced Hamilton menu, that recovered cut is often the difference between a thin month and a good one."
      },
      {
        "q": "Can I take reservations as well as takeout?",
        "a": "Yes. Take table reservations and reserve-then-order pre-orders from the same page as pickup and delivery; bookings and orders both land on your Kitchen Order App. Charging a deposit at booking is coming soon."
      },
      {
        "q": "How quickly can I be live?",
        "a": "Minutes. Paste your existing GloriaFood menu link and your full menu — sizes, modifier groups, photos — rebuilds on a live ordering page in seconds, with Ontario's 13% HST applied correctly. No account needed to try it; claim it when you're happy."
      },
      {
        "q": "What does it cost?",
        "a": "0% commission on direct orders and free for your first 100 orders each month, with optional à-la-carte add-ons only when you want them — you pay only for what you use. No contracts."
      }
    ]
  },
  {
    "slug": "online-ordering-system-ottawa",
    "category": "city",
    "metaTitle": "Online Ordering System Ottawa | Fee Free Ordering",
    "metaDescription": "0% commission online ordering for Ottawa restaurants. Bilingual EN/FR pages (38 languages), built for the weekday government and office lunch and catering crowd.",
    "h1": "Online ordering system for Ottawa restaurants",
    "eyebrow": "OTTAWA, ON",
    "intro": "Ottawa is bilingual and runs on weekday lunch — the ByWard Market, the Glebe, Chinatown on Somerset, and a steady government-and-office crowd ordering individual lunches and group trays around Parliament and the downtown core. That high-frequency lunch volume is exactly what the delivery apps love to skim a quarter to a third from. Fee Free Ordering gives your Ottawa restaurant its own branded page in English and French at 0% commission on direct orders.",
    "painPoint": {
      "title": "Recurring office lunches shouldn't fund a marketplace",
      "body": "Ottawa's lunch trade is steady, mid-size, and repeats five days a week — the ideal ticket for an aggregator to take roughly a quarter to a third from, every single day, all year. A Somerset Street kitchen or downtown sandwich shop serving the same office crowd hands over a small fortune over twelve months. Owning the channel keeps that recurring lunch business — and its margin — in your own hands."
    },
    "benefits": [
      {
        "title": "Bilingual ordering, out of the box",
        "body": "Your ordering page, the Kitchen Order App, and customer emails are available in 38 languages — including French — so your Ottawa customers order in the language they prefer with zero extra setup. One branded page serves your whole bilingual, EN/FR crowd, government and tourist alike."
      },
      {
        "title": "Built for the noon rush and the group tray",
        "body": "Let office workers order ahead and skip the line, with QR-code ordering on the table or counter, plus catering as its own service for group and meeting trays. Orders ring instantly on the Kitchen Order App and print to your WiFi thermal printer, so a tight downtown lunch window stays under control."
      },
      {
        "title": "Turn lunch traffic into a direct, repeat crowd",
        "body": "Every order grows your own customer list instead of an aggregator's. GrowthNet QR codes, Smart Links, and Autopilot win-back offers turn a one-time app order into an Ottawa regular who orders direct — at 0% commission — week after week."
      }
    ],
    "faqs": [
      {
        "q": "Can my Ottawa ordering page work in French?",
        "a": "Yes. The ordering page, Kitchen Order App, and customer emails are available in 38 languages, including French, so your bilingual Ottawa customers can order in the language they prefer — no extra setup required for an EN/FR crowd."
      },
      {
        "q": "Is it good for the downtown government and office lunch rush?",
        "a": "Yes — customers can order ahead and skip the line, with QR-code ordering on the table or counter and catering as its own service for group trays. Orders ring instantly on the Kitchen Order App, even screen-off, and print to your thermal printer so a busy noon window stays organized."
      },
      {
        "q": "How does this compare to the delivery apps for steady lunch volume?",
        "a": "As of 2026 the major aggregators typically take around 25–30% per order and own the customer. Because Ottawa lunch business repeats daily, that commission compounds fast — Fee Free Ordering charges 0% on direct orders and is free for your first 100 orders a month, so the recurring lunch crowd's margin stays with you."
      },
      {
        "q": "How do I get my menu online?",
        "a": "Paste your existing GloriaFood menu link on our import page and your full menu — categories, sizes, modifier groups, photos — rebuilds on a live ordering page in seconds, with Ontario's 13% HST applied correctly. No signup needed to try it; claim it when you're ready."
      },
      {
        "q": "What does it cost an Ottawa restaurant?",
        "a": "0% commission on every direct order and free for your first 100 orders each month, with optional à-la-carte add-ons only when you want them — you pay only for what you use. No contracts."
      }
    ]
  }
];

export function getSolutionPage(slug: string): SolutionPage | undefined {
  return SOLUTION_PAGES.find((p) => p.slug === slug);
}

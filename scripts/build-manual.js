// Generates FeeFreeOrderingSystems-Manual.docx
// Run: node scripts/build-manual.js

const path = require("path");
const fs = require("fs");
const GLOBAL = "C:/Users/luigi/AppData/Roaming/npm/node_modules";
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  TabStopType, TabStopPosition, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, InternalHyperlink,
  Bookmark,
} = require(path.join(GLOBAL, "docx"));

// ---------- helpers ----------

const COLOR = {
  brand: "C2410C",      // restaurant orange
  brandLight: "FED7AA",
  ink: "111827",
  muted: "6B7280",
  line: "D1D5DB",
  bandHead: "1F2937",
  bandHeadText: "FFFFFF",
  bandAlt: "F3F4F6",
  green: "16A34A",
  greenBg: "DCFCE7",
  yellow: "CA8A04",
  yellowBg: "FEF9C3",
  red: "DC2626",
  redBg: "FEE2E2",
  blue: "1D4ED8",
  blueBg: "DBEAFE",
  grey: "4B5563",
  greyBg: "E5E7EB",
};

const border = (color = COLOR.line, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const allBorders = (color = COLOR.line, size = 4) => ({
  top: border(color, size), bottom: border(color, size),
  left: border(color, size), right: border(color, size),
});

function p(text, opts = {}) {
  const { bold, italics, size, color, align, spacingBefore, spacingAfter, indent } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { before: spacingBefore ?? 0, after: spacingAfter ?? 80 },
    indent: indent ? { left: indent } : undefined,
    children: [new TextRun({ text, bold, italics, size, color })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, color: COLOR.brand })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 120, after: 100 },
    children: [new TextRun({ text, bold: true, size: 26, color: COLOR.ink })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 100, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, color: COLOR.bandHead })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function num(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "numbers", level },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer(after = 120) {
  return new Paragraph({ spacing: { after }, children: [new TextRun({ text: "" })] });
}

function label(text, fill, color = COLOR.ink) {
  return new TableCell({
    borders: allBorders(COLOR.line, 4),
    width: { size: 2000, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 20, color })],
    })],
  });
}

function cell(text, opts = {}) {
  const { width = 4680, fill, bold, color, align, size = 22, padding = 100 } = opts;
  const lines = Array.isArray(text) ? text : [text];
  return new TableCell({
    borders: allBorders(COLOR.line, 4),
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: padding, bottom: padding, left: 140, right: 140 },
    verticalAlign: VerticalAlign.CENTER,
    children: lines.map((line) => new Paragraph({
      alignment: align,
      spacing: { after: 40 },
      children: [new TextRun({ text: line, bold, size, color })],
    })),
  });
}

function headerRow(labels, widths) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((t, i) => cell(t, {
      width: widths[i], fill: COLOR.bandHead, color: COLOR.bandHeadText,
      bold: true, align: AlignmentType.CENTER, size: 22,
    })),
  });
}

function bandRow(values, widths, alt = false) {
  return new TableRow({
    children: values.map((v, i) => cell(v, {
      width: widths[i], fill: alt ? COLOR.bandAlt : undefined,
    })),
  });
}

// ---------- TOC entry (dot-leader to manual page label) ----------

function tocLine(title, sub, anchor) {
  return new Paragraph({
    spacing: { after: 80 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: "dot" }],
    children: [
      new InternalHyperlink({
        anchor,
        children: [new TextRun({ text: title, bold: true, size: 22, color: COLOR.blue })],
      }),
      new TextRun({ text: sub ? `   ${sub}` : "", size: 20, color: COLOR.muted }),
    ],
  });
}

function bookmark(anchor, title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 200 },
    children: [
      new Bookmark({
        id: anchor,
        children: [new TextRun({ text: title, bold: true, size: 36, color: COLOR.brand })],
      }),
    ],
  });
}

// ---------- diagram (boxes-and-arrows via tables) ----------

function diagramBox(text, fill, color = COLOR.ink, width = 3000) {
  return new TableCell({
    borders: allBorders(COLOR.ink, 8),
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 160, bottom: 160, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: text.map((t, i) => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({
        text: t, bold: i === 0, size: i === 0 ? 22 : 18, color,
      })],
    })),
  });
}

function emptyCell(width) {
  return new TableCell({
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    },
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun("")] })],
  });
}

function arrowCell(label, width = 600) {
  return new TableCell({
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    },
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: label, bold: true, size: 18, color: COLOR.grey })],
    })],
  });
}

function buildDiagram() {
  // 3 tiers: People, Platform, External services + Reseller side rail
  const tableWidth = 9360;

  // Tier 1: customers + restaurant staff
  const tier1 = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [3000, 600, 2160, 600, 3000],
    rows: [new TableRow({ children: [
      diagramBox(["CUSTOMERS", "Browse marketplace, order from restaurant page, pay by card"], COLOR.blueBg, COLOR.blue, 3000),
      arrowCell("↔", 600),
      diagramBox(["RESELLER", "(optional)", "Brings restaurants in, earns 0–15% commission"], COLOR.greyBg, COLOR.ink, 2160),
      arrowCell("↔", 600),
      diagramBox(["RESTAURANT STAFF", "Kitchen tablet, admin browser, takes orders"], COLOR.brandLight, COLOR.brand, 3000),
    ]})],
  });

  const arrowsDown = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [3000, 600, 2160, 600, 3000],
    rows: [new TableRow({ children: [
      arrowCell("↓", 3000), emptyCell(600),
      arrowCell("↓", 2160), emptyCell(600),
      arrowCell("↓", 3000),
    ]})],
  });

  // Tier 2: platform (single wide box)
  const tier2 = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [tableWidth],
    rows: [new TableRow({ children: [
      diagramBox(
        [
          "FEE FREE ORDERING PLATFORM",
          "Next.js app on Vercel + Neon Postgres",
          "Order routing · Menu engine · Promotions · Reports · Notifications · Multi-location · Marketplace · Hosted websites · Reseller portal",
        ],
        COLOR.bandHead, COLOR.bandHeadText, tableWidth,
      ),
    ]})],
  });

  const arrowsDown2 = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [new TableRow({ children: [
      arrowCell("↓", 2340), arrowCell("↓", 2340),
      arrowCell("↓", 2340), arrowCell("↓", 2340),
    ]})],
  });

  // Tier 3: external services
  const tier3 = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [new TableRow({ children: [
      diagramBox(["STRIPE", "Card payments, payouts, white-label billing"], COLOR.greenBg, COLOR.green, 2340),
      diagramBox(["SHIPDAY", "Driver pool dispatch + tracking"], COLOR.yellowBg, COLOR.yellow, 2340),
      diagramBox(["RESEND", "Customer + staff transactional email"], COLOR.blueBg, COLOR.blue, 2340),
      diagramBox(["PRINTERS", "PrintNode (cloud) or native LAN to Star/Epson"], COLOR.brandLight, COLOR.brand, 2340),
    ]})],
  });

  return [tier1, spacer(40), arrowsDown, tier2, spacer(40), arrowsDown2, tier3];
}

// ---------- function manual page ----------

function manualPage(anchor, title, subtitle, whatItIs, howItWorks, where, audience) {
  return [
    pageBreak(),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new Bookmark({
          id: anchor,
          children: [new TextRun({ text: title, bold: true, size: 36, color: COLOR.brand })],
        }),
      ],
    }),
    p(subtitle, { italics: true, size: 22, color: COLOR.muted, spacingAfter: 200 }),

    h3("WHAT IT IS"),
    p(whatItIs, { size: 22, spacingAfter: 180 }),

    h3("HOW IT WORKS"),
    ...howItWorks.map((s, i) => num(s)),

    h3("WHERE TO FIND IT"),
    p(where, { size: 22, spacingAfter: 100 }),

    h3("WHO USES IT"),
    p(audience, { size: 22, color: COLOR.grey }),
  ];
}

// ---------- feature catalogue (data drives the rest of the doc) ----------

const FEATURES = [
  // CORE FREE FEATURES (built-in)
  {
    key: "ordering-page", title: "Online Ordering Page",
    tier: "free", category: "core", anchor: "ord",
    subtitle: "Each restaurant gets a public menu page customers can order from.",
    whatItIs:
      "A branded, mobile-friendly menu page where customers browse items, build a cart, " +
      "and place pickup, delivery, dine-in, or catering orders. No app to download. Lives at " +
      "the restaurant's slug, with their colors, logo, and banner applied automatically.",
    howItWorks: [
      "Customer opens the restaurant's link or scans a QR code.",
      "They pick a service (pickup / delivery / dine-in / etc.) and a time.",
      "Items are added to the cart with any modifiers (size, toppings, etc.).",
      "Promotions and coupon codes are applied automatically.",
      "Customer enters contact info and pays by card (if online payments is on) or pays at the restaurant.",
      "Order lands on the Kitchen Display and prints to the receipt printer.",
    ],
    where: "Public URL: /order/<restaurant-slug>. Admin preview: /admin/website.",
    audience: "End customers. Restaurant tweaks design from the admin Theme settings.",
    status: "complete",
    benefits: {
      customer: "Fast ordering with no fees, no signup, mobile friendly, remembers their cart.",
      restaurant: "Own your customer relationship instead of paying UberEats 30 percent on every order.",
      reseller: "The headline product to sell — every restaurant needs this.",
    },
  },
  {
    key: "menu-management", title: "Menu Management",
    tier: "free", category: "core", anchor: "menu",
    subtitle: "Build categories, items, prices, photos, and modifiers from one screen.",
    whatItIs:
      "The control room for everything customers see. Categories (Pizza, Drinks), items " +
      "(prices, photos, descriptions, availability hours), and modifier groups (sizes, toppings, " +
      "add-ons) are all managed here. Modifiers can be shared as a library and attached at " +
      "category or item level.",
    howItWorks: [
      "Create categories in the order customers should see them.",
      "Add items with name, price, description, and photo.",
      "Set hours an item is available (lunch only, weekends only, etc.).",
      "Build modifier groups once in the library, attach to any item or category.",
      "Toggle items sold-out instantly when you run out.",
    ],
    where: "Admin → Menu Management.",
    audience: "Restaurant owner or manager.",
    status: "complete",
    benefits: {
      customer: "Always accurate menu, photos, prices, and sold-out indicators.",
      restaurant: "Update once, customer page updates instantly. No printing new menus.",
      reseller: "Easy demo — drag in items live during a sales call.",
    },
  },
  {
    key: "kitchen-display", title: "Kitchen Display",
    tier: "free", category: "core", anchor: "kds",
    subtitle: "The tablet in the kitchen that receives, alerts, and prints every order.",
    whatItIs:
      "A live screen for kitchen staff. New orders pop up with a loud continuous bell. " +
      "Staff confirm, reject (with a reason), or mark ready. Includes a Test Order button " +
      "that fires a fake order through the full pipeline so you can verify printing and " +
      "sound any time.",
    howItWorks: [
      "Order comes in → bell rings continuously until acknowledged.",
      "Staff hits Confirm (auto-prints kitchen + customer receipt) or Reject (refunds card automatically if it was paid).",
      "Order moves through New → Confirmed → Ready → Out / Picked up.",
      "Stale unacknowledged orders auto-reject every 5 minutes (configurable).",
    ],
    where: "/kitchen on any tablet. Sign in with kitchen-staff credentials.",
    audience: "Kitchen staff and front-of-house.",
    status: "complete",
    benefits: {
      customer: "Orders are seen and acted on instantly. No missed orders.",
      restaurant: "No more rushing to a laptop. Loud bell beats every other ordering platform.",
      reseller: "Wow factor — restaurants love that it actually rings loud enough to hear in a busy kitchen.",
    },
  },
  {
    key: "receipts", title: "Receipt Printing",
    tier: "free", category: "core", anchor: "rcpt",
    subtitle: "Auto-print kitchen and customer receipts on Star or Epson thermal printers.",
    whatItIs:
      "Receipts print automatically the moment an order is confirmed. Two layouts: " +
      "kitchen ticket (big item names, modifiers, customer phone) and customer receipt " +
      "(itemized with totals). Both layouts are template-driven and fully editable.",
    howItWorks: [
      "Choose a print path: cloud (PrintNode for any printer + browser) or native LAN (in-app, no extra service).",
      "Pick your printer model from the supported list (most Star + Epson thermals).",
      "Customize the template (logo, font sizes, sections, dividers).",
      "Order confirmed → printer fires. Test print button on the printer setup page.",
    ],
    where: "Admin → Printer Setup. Templates: Admin → Receipt Templates.",
    audience: "Kitchen staff (they read them), owner sets it up once.",
    status: "complete",
    benefits: {
      customer: "Itemized paper receipt at pickup or with delivery.",
      restaurant: "Loud, fast, reliable kitchen tickets — no laptop in the kitchen needed.",
      reseller: "Works with the printer the restaurant already owns. No upsell required.",
    },
  },
  {
    key: "order-management", title: "Order Management & Refunds",
    tier: "free", category: "core", anchor: "ord-mgmt",
    subtitle: "Accept, reject, refund, and look back at every order.",
    whatItIs:
      "Order list with full history, filters by status / date / service. Reject flow has 7 " +
      "preset reasons plus custom text. Card orders that are rejected are auto-refunded " +
      "through Stripe — no manual refund button-mashing.",
    howItWorks: [
      "All orders land in the order list as they happen.",
      "Filter by status (new / confirmed / completed / rejected / refunded).",
      "Open any order to view items, modifiers, customer info, and audit log.",
      "Reject from Kitchen Display or admin → auto-refund fires for paid card orders.",
    ],
    where: "Admin → Orders.",
    audience: "Owner and managers.",
    status: "complete",
    benefits: {
      customer: "Instant refund if the kitchen can't fulfil. No phone call required.",
      restaurant: "No need to log into Stripe to refund. Reasons captured for analytics.",
      reseller: "Hands-off operations — fewer support calls from restaurants.",
    },
  },
  {
    key: "services", title: "Services & Hours",
    tier: "free", category: "core", anchor: "svc",
    subtitle: "Turn pickup, delivery, dine-in, catering, takeout, and reservations on or off.",
    whatItIs:
      "Single source of truth for which services your restaurant offers, their display names, " +
      "estimated prep times, and operating hours. Delivery zones and fees are set here too.",
    howItWorks: [
      "Toggle each service on/off.",
      "For delivery: draw zones on a map, set fees per zone or per distance.",
      "Set service hours per day (lunch only, dinner only, all day).",
      "Customer-facing page updates instantly — service buttons reflect what's available right now.",
    ],
    where: "Admin → Services.",
    audience: "Owner.",
    status: "complete",
    benefits: {
      customer: "Only sees options that actually work right now.",
      restaurant: "No more rejected orders because delivery was forgotten as off.",
      reseller: "Easy onboarding step — services + hours is usually 5 minutes.",
    },
  },
  {
    key: "theme", title: "Theme & Branding",
    tier: "free", category: "core", anchor: "theme",
    subtitle: "Restaurant colors, logo, banner, and layout — without touching code.",
    whatItIs:
      "Visual identity controls. Set the primary color, upload a logo and banner, pick a menu " +
      "layout (carousel vs grid), and the customer ordering page restyles instantly. Same theme " +
      "is reused by the hosted Sales Optimized Website add-on.",
    howItWorks: [
      "Upload logo and banner.",
      "Pick primary color from a color picker.",
      "Choose menu layout style.",
      "Preview live, save, done.",
    ],
    where: "Admin → Website (or /admin/website/editor for the full editor).",
    audience: "Owner.",
    status: "complete",
    benefits: {
      customer: "Page feels like the restaurant, not a generic platform.",
      restaurant: "Brand stays consistent — no developer needed for tweaks.",
      reseller: "White-label option lets you swap our brand for yours on emails.",
    },
  },
  {
    key: "promos", title: "Promotions & Coupons",
    tier: "free", category: "core", anchor: "promo",
    subtitle: "Automatic rules-based discounts plus customer-entered coupon codes.",
    whatItIs:
      "Two systems working together. Promotions auto-apply when a rule matches " +
      "(buy 2 pizzas get 1 free, 10 percent off Tuesdays, free fries over 40 dollars). " +
      "Coupons are codes customers type in at checkout for fixed-amount or percentage discounts.",
    howItWorks: [
      "Promotions: pick trigger (cart total, item count, category, day-of-week), pick reward, save.",
      "Coupons: create a code with a discount and optional usage limit / expiry.",
      "At checkout, the engine evaluates every promo + coupon and applies the best combination.",
    ],
    where: "Admin → Promotions / Admin → Coupons.",
    audience: "Owner runs the marketing; customer benefits at checkout.",
    status: "complete",
    benefits: {
      customer: "Discounts apply automatically. No surprise at the till.",
      restaurant: "Run promotions without rebuilding the menu or coordinating with staff.",
      reseller: "Useful upsell angle: 'use it to compete with the takeaway down the road.'",
    },
  },
  {
    key: "setup-wizard", title: "Setup Wizard",
    tier: "free", category: "core", anchor: "setup",
    subtitle: "Guided checklist that takes a new restaurant from zero to live.",
    whatItIs:
      "A progress-tracked checklist on the admin home that shows what's done and what's " +
      "left to do before the restaurant can publish: menu items, services, hours, payment " +
      "provider, printer, kitchen device, etc.",
    howItWorks: [
      "Each step is checked automatically based on real data (you added a menu item ✓).",
      "Click an open step → jumps you to the right page.",
      "Aggregate completion shown as a percentage in the sidebar.",
      "Publishing is gated on required steps.",
    ],
    where: "Admin → Setup (top of sidebar).",
    audience: "New restaurant owner during onboarding.",
    status: "in-testing",
    benefits: {
      customer: "Doesn't see half-set-up restaurants — publishing is gated.",
      restaurant: "Knows exactly what's left, no guessing.",
      reseller: "Restaurants self-serve more, fewer support calls.",
    },
  },
  {
    key: "notifications", title: "Customer & Staff Notifications",
    tier: "free", category: "core", anchor: "notif",
    subtitle: "Transactional emails for orders, status changes, and refunds.",
    whatItIs:
      "Every order generates emails: customer gets confirmation + status updates, restaurant " +
      "gets a new-order alert. Templates are branded with the restaurant's logo and colors. " +
      "When a reseller activates white-label, the email footer shows 'Powered by <their brand>'.",
    howItWorks: [
      "Order placed → customer 'order received' email + restaurant 'new order' email fire.",
      "Confirmed / ready / rejected status changes trigger follow-up emails.",
      "Refund triggers refund-confirmation email.",
      "Sent via Resend for deliverability.",
    ],
    where: "Automatic. Manage notification recipients in Admin → Notifications.",
    audience: "Customer + restaurant staff.",
    status: "complete",
    benefits: {
      customer: "Always knows the order status without calling.",
      restaurant: "Fewer 'where's my order' calls. Branded emails build trust.",
      reseller: "White-label option puts your brand in front of every customer.",
    },
  },
  {
    key: "reports", title: "Reports & Analytics",
    tier: "free", category: "core", anchor: "rpt",
    subtitle: "Sales, top items, busy hours, refund rates — at a glance.",
    whatItIs:
      "Dashboards covering revenue, order volume, average ticket size, top-selling items, " +
      "rejection reasons, and busy hours. Multi-location parents get a cross-location view.",
    howItWorks: [
      "Pick a date range.",
      "Drill into a metric to see the underlying orders.",
      "Export to CSV if needed.",
    ],
    where: "Admin → Reports.",
    audience: "Owner and managers.",
    status: "built",
    benefits: {
      customer: "Indirectly — restaurant uses data to keep popular items in stock.",
      restaurant: "Stops guessing about what's selling. Spots problem hours / items.",
      reseller: "Talking point: 'our reports are simpler than Toast's.'",
    },
  },

  // ADD-ONS (paid)
  {
    key: "online-payments", title: "Online Payments (Stripe)",
    tier: "addon", category: "addon", anchor: "pay",
    addonRank: 1,
    subtitle: "Accept card payments online with no per-order platform commission.",
    whatItIs:
      "Stripe Connect destination charges. Customer pays by card on the ordering page, money " +
      "goes directly to the restaurant's bank, Stripe takes their fee, we take nothing per order. " +
      "Card orders are deferred to the kitchen only after the payment succeeds.",
    howItWorks: [
      "Restaurant connects their bank in 5 minutes via Stripe onboarding.",
      "Customer pays by card at checkout.",
      "Payment lands in restaurant's Stripe balance, payouts to their bank as usual.",
      "Rejected orders auto-refund.",
    ],
    where: "Admin → Billing → Add-ons → Online Payments.",
    audience: "Most restaurants — it's how customers pay if you want true online ordering.",
    status: "complete",
    benefits: {
      customer: "Pay before pickup, no fumbling for cash. Card receipts emailed.",
      restaurant: "Captures payment up front — fewer no-shows. No commission per order.",
      reseller: "Highest-take add-on. Sells itself once a restaurant has been burned by no-shows.",
    },
  },
  {
    key: "hosted-website", title: "Sales Optimized Website",
    tier: "addon", category: "addon", anchor: "site",
    addonRank: 2,
    subtitle: "A full hosted marketing website at your-name.feefreeordering.com.",
    whatItIs:
      "A real website — hero section, about, hours, location map, social links, photo " +
      "gallery, and a built-in order button — generated from the data you already have. " +
      "Editable in a drag-and-drop editor with live preview. SEO-optimized with structured " +
      "data and Google-friendly metadata.",
    howItWorks: [
      "Activate the add-on.",
      "Visit your subdomain (your-slug.feefreeordering.com) — site is live with your branding.",
      "Open the editor to toggle sections, override hero copy, customize CTAs, add custom sections.",
      "Optional: upgrade to Custom Domain add-on for your-restaurant.com.",
    ],
    where: "Admin → Website → Editor.",
    audience: "Restaurants that don't have a real website (most do not).",
    status: "complete",
    benefits: {
      customer: "Finds you on Google. Sees menu, hours, location, can order in one click.",
      restaurant: "No website builder fees, no developer. Looks professional, ranks in search.",
      reseller: "Easy upsell on the demo call — most restaurants want this once they see it.",
    },
  },
  {
    key: "marketplace", title: "Marketplace Listing",
    tier: "addon", category: "addon", anchor: "mkt",
    addonRank: 3,
    subtitle: "Get listed on feefreefood.com — our zero-commission alternative to UberEats.",
    whatItIs:
      "A public restaurant directory at feefreefood.com where local customers browse, " +
      "search, and order. Flat-rate monthly billing — no per-order commission, no surge " +
      "pricing. The platform shows lifetime savings vs UberEats / DoorDash on the dashboard.",
    howItWorks: [
      "Activate the add-on → restaurant auto-listed on next billing cycle.",
      "Customize listing copy, photos, tags, cuisine type.",
      "Customer finds you on the marketplace and orders.",
      "Order flows through your normal Kitchen Display — same as any other order.",
    ],
    where: "Admin → Marketplace.",
    audience: "Restaurants in areas where the marketplace has critical mass of users.",
    status: "in-testing",
    benefits: {
      customer: "Browse local restaurants in one place. No 30% markup baked into prices.",
      restaurant: "Discoverability without the UberEats commission. Flat monthly, predictable.",
      reseller: "Strong differentiator vs incumbents. Easy story: 'flat $200/mo vs 30%.'",
    },
  },
  {
    key: "reservation-deposits", title: "Reservation Deposits",
    tier: "addon", category: "addon", anchor: "rsv",
    addonRank: 4,
    subtitle: "Take a refundable card deposit when customers book a table.",
    whatItIs:
      "Adds a Stripe deposit step to the reservation flow. Customer holds a card on file " +
      "for the booking; restaurant captures, refunds, or releases automatically based on " +
      "whether they show up.",
    howItWorks: [
      "Activate the add-on, set deposit amount (flat or per-guest).",
      "Customer books a reservation → enters card → deposit authorized.",
      "Show up → deposit released. No-show → restaurant can capture.",
    ],
    where: "Admin → Reservations → Deposit Settings.",
    audience: "Restaurants with reservation no-show problems (most restaurants over a certain size).",
    status: "unbuilt",
    benefits: {
      customer: "Easy booking with their card, no friction.",
      restaurant: "Stops the no-show tax. Pays for itself the first weekend.",
      reseller: "Easy second-add-on after Online Payments — same Stripe setup powers it.",
    },
  },
  {
    key: "multi-location", title: "Multi-Location Management",
    tier: "addon", category: "addon", anchor: "ml",
    addonRank: 5,
    subtitle: "Run a brand with several locations from one master account.",
    whatItIs:
      "A brand parent invites child locations under one umbrella. Master menu lives at the " +
      "brand level; locations inherit and can customize per-location if they need to. " +
      "Cross-location reports, brand-wide promotions, and consolidated billing.",
    howItWorks: [
      "Activate the add-on on the brand account.",
      "Invite each location by email — they sign up as a child location.",
      "Edit master menu once — locations inherit automatically.",
      "Any location can Customize to break inheritance for that item.",
      "Reports → Cross-Location view shows revenue across all locations.",
    ],
    where: "Admin → Locations (visible when entitlement active).",
    audience: "Restaurant chains, franchises, multi-site operators.",
    status: "complete",
    benefits: {
      customer: "Consistent brand across every location.",
      restaurant: "Update prices everywhere in one click. Cross-location analytics.",
      reseller: "Big-ticket add-on — chains pay materially more than single sites.",
    },
  },
  {
    key: "driver-pool", title: "Driver Pool (ShipDay)",
    tier: "addon", category: "addon", anchor: "dp",
    addonRank: 6,
    subtitle: "Auto-dispatch delivery orders to ShipDay's driver network.",
    whatItIs:
      "Restaurants without their own drivers can opt into ShipDay's pool. When an order is " +
      "accepted, it auto-dispatches to ShipDay, a driver is assigned, tracking link is " +
      "printed on the kitchen receipt and emailed to the customer.",
    howItWorks: [
      "Activate the add-on, paste ShipDay API key (encrypted at rest).",
      "Pick delivery-fee strategy (pass-through, flat, or tiered).",
      "Kitchen toggles dispatch mode to Driver Pool.",
      "Accepted delivery orders auto-push to ShipDay. Status updates as driver moves.",
    ],
    where: "Admin → Delivery → Driver Pool.",
    audience: "Restaurants doing delivery but without in-house drivers.",
    status: "built",
    benefits: {
      customer: "Same tracking experience they get on Uber, but cheaper for the restaurant.",
      restaurant: "Adds delivery without hiring drivers. Pay per dispatch, no fixed cost.",
      reseller: "Lets you sell delivery to restaurants who said 'we don't have drivers.'",
    },
  },
  {
    key: "custom-domain", title: "Custom Domain",
    tier: "addon", category: "addon", anchor: "dom",
    addonRank: 7,
    subtitle: "Run your hosted site on your own domain — your-restaurant.com.",
    whatItIs:
      "Map your-restaurant.com to your hosted Sales Optimized Website. SSL is provisioned " +
      "automatically, no certificate juggling.",
    howItWorks: [
      "Activate the add-on, enter your domain.",
      "Update DNS at your domain registrar (clear instructions provided).",
      "Wait for SSL to provision (a few minutes).",
      "Your site is live at your-restaurant.com.",
    ],
    where: "Admin → Website → Custom Domain.",
    audience: "Restaurants that already own a domain and want it pointed at our site.",
    status: "designed",
    benefits: {
      customer: "Memorable URL on business cards, menus, signage.",
      restaurant: "Owns the brand — feefreeordering.com subdomain doesn't show.",
      reseller: "Small add-on, but locks restaurants in (they pay you because the domain is on your platform).",
    },
  },
  {
    key: "branded-app", title: "Branded Mobile App",
    tier: "addon", category: "addon", anchor: "app",
    addonRank: 8,
    subtitle: "Your-restaurant-branded app on the App Store and Google Play.",
    whatItIs:
      "A native iOS + Android app, white-labelled with the restaurant's name, logo, and " +
      "colors, published under our developer accounts. Customers download from the App Store " +
      "and order with native push notifications and saved payment methods.",
    howItWorks: [
      "Activate the add-on, provide app name, icon, splash, screenshots.",
      "We build, sign, and submit to both stores under our dev accounts.",
      "Customers download → log in → order. Push notifications for order status.",
      "Auto-updates when the underlying web ordering page improves.",
    ],
    where: "Admin → Branded App (visible when entitlement active).",
    audience: "Higher-end / chain restaurants that want an App Store presence (~1 in 10).",
    status: "designed",
    benefits: {
      customer: "Their favorite restaurant on their home screen with push notifications.",
      restaurant: "Premium positioning. Repeat-order rate higher than web.",
      reseller: "Highest-margin add-on. Sells to chains and ambitious independents.",
    },
  },
  {
    key: "reseller-portal", title: "Reseller Portal",
    tier: "free", category: "reseller", anchor: "rsl",
    subtitle: "The dashboard partners use to bring in restaurants and earn commission.",
    whatItIs:
      "Standalone area at /reseller for approved partners. They add restaurants, see their " +
      "commission tier (0 / 5 / 10 / 15% based on active paying customers), track signups " +
      "over time, request payouts, and access sales resources.",
    howItWorks: [
      "Partner applies at /partners/apply.",
      "Approved → gets reseller dashboard and unique referral code.",
      "Adds restaurants directly or shares signup links.",
      "Commission accrues automatically per active paying subscription.",
      "Payouts requested from the Payouts page.",
    ],
    where: "/reseller (partners only).",
    audience: "Partners — agencies, consultants, area sales reps.",
    status: "complete",
    benefits: {
      customer: "Indirect — gets a local rep to help with setup.",
      restaurant: "Has a human contact for onboarding instead of just a portal.",
      reseller: "Self-serve growth engine. Tier system rewards bringing in volume.",
    },
  },
  {
    key: "white-label", title: "White-Label Branding (Reseller)",
    tier: "addon", category: "reseller", anchor: "wl",
    subtitle: "Resellers can put their own brand on customer-facing emails.",
    whatItIs:
      "Two-tier paid add-on for resellers. Basic ($9.99/mo) shows their imprint name in the " +
      "email footer. Full ($29/mo) adds their logo. Receipts and customer ordering pages " +
      "stay 100% the restaurant's brand — never the reseller's.",
    howItWorks: [
      "Reseller activates from /reseller/branding.",
      "Pays via Stripe Checkout (Customer Portal for cancel / update card).",
      "Sets imprint name (Basic) and uploads logo (Full).",
      "Every transactional email going out from their restaurants shows 'Powered by <Reseller>'.",
    ],
    where: "/reseller/branding.",
    audience: "Resellers running their own brand.",
    status: "complete",
    benefits: {
      customer: "Sees a local-feeling brand, not a generic platform.",
      restaurant: "Indirect — works with a reseller who looks established.",
      reseller: "Builds their own brand equity while we still do the work behind the scenes.",
    },
  },
];

const STATUS = {
  unbuilt: { label: "Unbuilt", fill: COLOR.redBg, color: COLOR.red },
  designed: { label: "Designed, not built", fill: COLOR.redBg, color: COLOR.red },
  built: { label: "Built", fill: COLOR.yellowBg, color: COLOR.yellow },
  "in-testing": { label: "In testing", fill: COLOR.yellowBg, color: COLOR.yellow },
  "final-testing": { label: "Final testing", fill: COLOR.blueBg, color: COLOR.blue },
  complete: { label: "Complete & tested", fill: COLOR.greenBg, color: COLOR.green },
};

// ---------- assemble the doc ----------

function buildChildren() {
  const out = [];

  // ===== Cover page =====
  out.push(new Paragraph({ spacing: { after: 600 }, children: [new TextRun("")] }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: "FEE FREE", bold: true, size: 72, color: COLOR.brand })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: "ORDERING SYSTEMS", bold: true, size: 48, color: COLOR.ink })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: "Product Manual", italics: true, size: 36, color: COLOR.muted })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 1200 },
    children: [new TextRun({ text: "Feature reference · System diagram · Benefits · Signup flow · Build status", size: 22, color: COLOR.grey })],
  }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "Version 1.0  ·  May 2026", size: 22, color: COLOR.muted })],
  }));

  // ===== Table of Contents =====
  out.push(pageBreak());
  out.push(h1("Table of Contents"));
  out.push(spacer(120));
  out.push(tocLine("System Diagram", "How every part connects together", "diagram"));
  out.push(tocLine("Function Manuals", "One page per feature, plain-English", "manuals"));
  FEATURES.forEach((f) => {
    out.push(new Paragraph({
      spacing: { after: 40 }, indent: { left: 360 },
      tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: "dot" }],
      children: [
        new InternalHyperlink({
          anchor: f.anchor,
          children: [new TextRun({ text: f.title, size: 20, color: COLOR.blue })],
        }),
      ],
    }));
  });
  out.push(spacer(120));
  out.push(tocLine("Benefits Matrix", "Who benefits from each feature, and how", "benefits"));
  out.push(tocLine("Features Included + Signup Flow", "Step-by-step for a new restaurant", "signup"));
  out.push(tocLine("Add-On Legend", "What's free vs paid, sorted by demand", "legend"));
  out.push(tocLine("Build Status", "What's done, what's in testing, what's still to come", "status"));

  // ===== System diagram =====
  out.push(pageBreak());
  out.push(bookmark("diagram", "System Diagram"));
  out.push(p(
    "How customers, restaurants, resellers, and the external services we depend on connect through the platform.",
    { italics: true, size: 22, color: COLOR.muted, spacingAfter: 300 },
  ));
  out.push(...buildDiagram());
  out.push(spacer(240));
  out.push(h3("HOW TO READ IT"));
  out.push(bullet("Top row = people (customers, resellers, restaurant staff) — all reach the platform through a browser or our app."));
  out.push(bullet("Middle row = the Fee Free Ordering platform itself — every feature in this manual lives here."));
  out.push(bullet("Bottom row = external services we rely on. We can swap any of them out without restaurants noticing."));
  out.push(bullet("Resellers sit alongside customers and staff — they don't gate orders, they just bring restaurants in and (optionally) brand the experience."));

  // ===== Function manuals =====
  out.push(pageBreak());
  out.push(bookmark("manuals", "Function Manuals"));
  out.push(p(
    "One short page for every feature in plain English: what it is, how it works, where to find it, who uses it.",
    { italics: true, size: 22, color: COLOR.muted, spacingAfter: 200 },
  ));

  FEATURES.forEach((f) => {
    out.push(...manualPage(f.anchor, f.title, f.subtitle, f.whatItIs, f.howItWorks, f.where, f.audience));
  });

  // ===== Benefits matrix =====
  out.push(pageBreak());
  out.push(bookmark("benefits", "Benefits Matrix"));
  out.push(p(
    "Each row is a feature. Each column answers \"what's in it for them?\" — for the customer, the restaurant, and the reseller.",
    { italics: true, size: 22, color: COLOR.muted, spacingAfter: 240 },
  ));

  const benefitWidths = [1700, 2400, 2700, 2560];
  out.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: benefitWidths,
    rows: [
      headerRow(["Feature", "Customer benefit", "Restaurant benefit", "Reseller benefit"], benefitWidths),
      ...FEATURES.map((f, i) => bandRow(
        [f.title, f.benefits.customer, f.benefits.restaurant, f.benefits.reseller],
        benefitWidths, i % 2 === 1,
      )),
    ],
  }));

  // ===== Features Included + Signup Flow =====
  out.push(pageBreak());
  out.push(bookmark("signup", "Features Included + Signup Flow"));
  out.push(p(
    "Everything a new restaurant gets in the free tier, plus the ideal step-by-step from signup to taking real orders.",
    { italics: true, size: 22, color: COLOR.muted, spacingAfter: 200 },
  ));

  out.push(h2("What's included free"));
  FEATURES.filter((f) => f.tier === "free").forEach((f) => {
    out.push(bullet(`${f.title} — ${f.subtitle}`));
  });

  out.push(spacer(120));
  out.push(h2("Ideal signup flow"));

  const steps = [
    ["Sign up", "Restaurant creates an account at feefreeordering.com (direct) or via a reseller's referral link. Email + password. 30 seconds."],
    ["Setup Wizard kicks in", "Sidebar shows a checklist. Each step is a guided page — no guessing what's next."],
    ["Restaurant basics", "Name, address, phone, contact email, time zone."],
    ["Services & hours", "Turn on pickup / delivery / dine-in / catering / reservations. Set operating hours per day. Draw delivery zones on the map if delivering."],
    ["Theme & branding", "Upload logo + banner, pick a primary color, choose a menu layout. Customer ordering page is now styled."],
    ["Menu", "Build categories, add items with prices and photos. Optional: build modifier groups in the library and attach to items."],
    ["Printer setup", "Pick PrintNode (cloud, any printer) or native LAN. Choose printer model. Test print kitchen + customer receipts."],
    ["Kitchen device", "Open /kitchen on a tablet, sign in with kitchen-staff credentials. Test Order button verifies the full pipeline (bell + print + email)."],
    ["Connect online payments (recommended add-on)", "Stripe Connect onboarding. 5 minutes to enter bank details. Card payments enabled."],
    ["Publish", "Setup Wizard turns 100%. Hit Publish. Customer-facing /order/<slug> page goes live."],
    ["Optional: pick add-ons", "Add Sales Optimized Website, Marketplace, Multi-Location, Driver Pool, etc. on demand. Each unlocks instantly after billing."],
    ["Take real orders", "Share the link + QR code with customers. Orders land on the Kitchen Display with a loud bell. Receipts print. Customer gets emails. Money lands in your bank."],
  ];
  steps.forEach(([title, body], i) => {
    out.push(new Paragraph({
      spacing: { before: 80, after: 20 },
      children: [
        new TextRun({ text: `Step ${i + 1}  ·  `, bold: true, size: 22, color: COLOR.brand }),
        new TextRun({ text: title, bold: true, size: 22, color: COLOR.ink }),
      ],
    }));
    out.push(p(body, { size: 21, color: COLOR.grey, indent: 360, spacingAfter: 60 }));
  });

  // ===== Add-on legend =====
  out.push(pageBreak());
  out.push(bookmark("legend", "Add-On Legend"));
  out.push(p(
    "Sorted from most-commonly-taken down to least. Free features are listed for contrast.",
    { italics: true, size: 22, color: COLOR.muted, spacingAfter: 200 },
  ));

  out.push(h2("Free — every restaurant gets these"));
  const freeWidths = [3120, 6240];
  out.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: freeWidths,
    rows: [
      headerRow(["Feature", "What it does"], freeWidths),
      ...FEATURES.filter((f) => f.tier === "free").map((f, i) =>
        bandRow([f.title, f.subtitle], freeWidths, i % 2 === 1),
      ),
    ],
  }));

  out.push(spacer(240));
  out.push(h2("Add-ons — paid, sorted by how often restaurants take them"));
  const addonWidths = [600, 2520, 1500, 4740];
  const addons = FEATURES.filter((f) => f.tier === "addon").sort((a, b) => a.addonRank - b.addonRank);
  const usageNote = (rank) => {
    if (rank === 1) return "~9 in 10";
    if (rank === 2) return "~7 in 10";
    if (rank === 3) return "~5 in 10";
    if (rank === 4) return "~4 in 10";
    if (rank === 5) return "~3 in 10";
    if (rank === 6) return "~3 in 10";
    if (rank === 7) return "~2 in 10";
    if (rank === 8) return "~1 in 10";
    return "—";
  };
  out.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: addonWidths,
    rows: [
      headerRow(["#", "Add-on", "Typical uptake", "What it adds"], addonWidths),
      ...addons.map((f, i) => bandRow(
        [String(f.addonRank), f.title, usageNote(f.addonRank), f.subtitle],
        addonWidths, i % 2 === 1,
      )),
    ],
  }));

  // ===== Build status =====
  out.push(pageBreak());
  out.push(bookmark("status", "Build Status"));
  out.push(p(
    "Where each feature is in its build life-cycle.",
    { italics: true, size: 22, color: COLOR.muted, spacingAfter: 160 },
  ));

  // Status legend
  out.push(h3("Status legend"));
  const legendWidths = [2340, 2340, 2340, 2340];
  const legendOrder = ["unbuilt", "designed", "built", "in-testing", "final-testing", "complete"];
  const legendRows = [];
  for (let i = 0; i < legendOrder.length; i += 4) {
    const chunk = legendOrder.slice(i, i + 4);
    while (chunk.length < 4) chunk.push(null);
    legendRows.push(new TableRow({
      children: chunk.map((k) =>
        k ? label(STATUS[k].label, STATUS[k].fill, STATUS[k].color) :
          emptyCell(2340)
      ),
    }));
  }
  out.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: legendWidths,
    rows: legendRows,
  }));

  out.push(spacer(240));

  // Status table — grouped by status, then by tier
  out.push(h3("Every feature, by status"));
  const statusWidths = [3120, 2280, 1640, 2320];
  const sortKey = (f) => legendOrder.indexOf(f.status);
  const sorted = [...FEATURES].sort((a, b) => sortKey(b) - sortKey(a) || a.title.localeCompare(b.title));
  const rows = [
    headerRow(["Feature", "Status", "Tier", "Category"], statusWidths),
  ];
  sorted.forEach((f, i) => {
    const s = STATUS[f.status];
    const tierLabel = f.tier === "free" ? "Free" : "Add-on";
    const categoryLabel = f.category === "core" ? "Core platform" :
                          f.category === "addon" ? "Restaurant add-on" :
                          "Reseller";
    rows.push(new TableRow({
      children: [
        cell(f.title, { width: 3120, fill: i % 2 === 1 ? COLOR.bandAlt : undefined, bold: true }),
        cell(s.label, { width: 2280, fill: s.fill, color: s.color, bold: true, align: AlignmentType.CENTER }),
        cell(tierLabel, { width: 1640, fill: i % 2 === 1 ? COLOR.bandAlt : undefined, align: AlignmentType.CENTER }),
        cell(categoryLabel, { width: 2320, fill: i % 2 === 1 ? COLOR.bandAlt : undefined, align: AlignmentType.CENTER }),
      ],
    }));
  });
  out.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: statusWidths,
    rows,
  }));

  out.push(spacer(200));
  out.push(p(
    "Status is a snapshot — \"Complete & tested\" means verified end-to-end in production. \"In testing\" means code is live but we're still ironing out edge cases.",
    { italics: true, size: 20, color: COLOR.muted },
  ));

  return out;
}

// ---------- build & write ----------

const doc = new Document({
  creator: "Fee Free Ordering Systems",
  title: "Fee Free Ordering Systems — Product Manual",
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: COLOR.ink } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: COLOR.brand },
        paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: COLOR.ink },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: COLOR.bandHead },
        paragraph: { spacing: { before: 120, after: 60 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Fee Free Ordering Systems — Product Manual", size: 18, color: COLOR.muted })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", size: 18, color: COLOR.muted }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLOR.muted }),
        ],
      })] }),
    },
    children: buildChildren(),
  }],
});

const outPath = path.join(__dirname, "..", "FeeFreeOrderingSystems-Manual.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, `(${buffer.length} bytes)`);
});

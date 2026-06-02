/**
 * v3 of the bug tracker — keeps the 3 original example rows and appends
 * all 37 distinct items raised by Fabrizio across his 2026-06-01 email
 * thread (10 screenshots, ~5 emails). Each row classified as Fixed,
 * Verify (shipped → needs Fabrizio to re-test), or New (not built).
 *
 * Run with:
 *   node scripts/gen-bug-tracker-v3.js
 */
const XLSX = require("xlsx");
const path = require("path");
const os = require("os");

const DOWNLOADS = path.join(os.homedir(), "Downloads");
const OUT = path.join(DOWNLOADS, "FeeFree-Bug-Tracker-v3.xlsx");

const headers = [
  "ID",
  "Date Reported",
  "Reporter",
  "Type",
  "Severity",
  "Area",
  "Title (short)",
  "Steps to reproduce / Description",
  "Screenshot / URL",
  "Status",
  "Date Fixed",
  "Commit / Notes",
];

// ── Original 3 examples ─────────────────────────────────────────────
const examples = [
  [1, "2026-06-01", "Fabrizio", "Bug", "High", "Customer",
    "Promo tiles black on luigispizzapastawings.com",
    "Open the storefront on the custom domain — both BOGO and FREE DELIVERY tiles render as solid black. Works fine on feefreeordering.com.",
    "", "Fixed", "2026-06-02",
    "commit fd54903 — proxy matcher exempted all static-asset extensions"],
  [2, "2026-06-01", "Luigi", "Feature", "Medium", "Kitchen",
    "Single active kitchen login at a time",
    "Like GloriaFood — when a second device signs in to the kitchen, the first should get logged out automatically.",
    "", "Fixed", "2026-06-02",
    "commits 7fc1be5 + 44a76e6"],
  [3, "2026-06-02", "Luigi", "Bug", "High", "Kitchen",
    "Catering order scheduled tomorrow shows Ready in 14:31",
    "Place a catering order scheduled for tomorrow 10:30 PM. Open kitchen — countdown reads 14:31 instead of ~24 hours. Auto-accept was setting estimatedReady=now+20m and ignoring scheduledFor.",
    "", "Fixed", "2026-06-02",
    "commit 6de2c21"],
];

// ── Fabrizio batch — 37 items, IDs 4–40 ─────────────────────────────
// Row shape:
//   [id, date, reporter, type, severity, area, title, description, screenshot, status, dateFixed, notes]

const D = "2026-06-01";
const F = "Fabrizio";

const fabrizioItems = [
  // ─── FIXED (24) ──────────────────────────────────────────────────
  [4, D, F, "Feature", "High", "Kitchen",
    "Custom kitchen notification sound (replace GloriaFood ring)",
    "Recorded GloriaFood sound in background was being used. Owner should be able to pick / upload a sound from the backoffice.",
    "", "Fixed", "2026-05-26",
    "task #107 — custom sound upload shipped"],
  [5, D, F, "Polish", "Medium", "Customer",
    "Customer page on PC: can't scroll categories to the right",
    "Long category bars on desktop weren't horizontally scrollable. Needs arrow / scroll affordance.",
    "", "Fixed", "2026-05-29",
    "task #104 — category scroll arrows on desktop nav"],
  [6, D, F, "Bug", "Medium", "Kitchen",
    "Accepted order didn't auto-move to Ready when time elapsed",
    "Fabrizio's own follow-up confirmed it did move automatically after a few minutes (ORD #TEST-852668). Bug auto-resolved by the existing cron.",
    "", "Fixed", "2026-05-30",
    "task #66 — auto-complete simple-flow 15 min past estimatedReady"],
  [7, D, F, "Feature", "High", "Admin",
    "EUR currency for European restaurants",
    "Prices always shown in USD even for Italian shops.",
    "", "Fixed", "2026-05-29",
    "task #106 — per-restaurant currency"],
  [8, D, F, "Feature", "Medium", "Admin",
    "Tip deactivation option in backend",
    "Couldn't find toggle to disable tipping (should be under payment methods).",
    "", "Fixed", "2026-05-29",
    "task #105 — restaurant setting to deactivate tips"],
  [9, D, F, "Bug", "Medium", "Customer",
    "Promo banner shows 'Delivery only' when neither pickup nor delivery selected",
    "Pickup-only shop seeing 'Delivery only' chip on a promo because of JSON-array parsing bug in the order-type chip.",
    "", "Fixed", "2026-05-31",
    "promo banner order-type chip rewrite (fixes 3 sub-bugs)"],
  [10, D, F, "Feature", "Medium", "Customer",
    "Time-slot intervals on customer schedule picker",
    "Customer was free to pick any time (3:02 PM etc.); should snap to 15/30/etc. intervals.",
    "", "Fixed", "2026-05-30",
    "checkout schedule picker uses slot-length setting"],
  [11, D, F, "Feature", "Medium", "Customer",
    "'Book a Table' CTA button on info page",
    "Should sit alongside 'See Menu and Order'.",
    "", "Fixed", "2026-05-30",
    "task #113 — Book a Table CTA"],
  [12, D, F, "Bug", "High", "Customer",
    "Reservation 'No reservations available on this day' always shown",
    "Customer could never book — empty slot list regardless of day.",
    "", "Fixed", "2026-05-30",
    "task #112 — reservation slots + interval setting"],
  [13, D, F, "Feature", "Medium", "Admin",
    "Separate hours per service (pickup / delivery / reservation)",
    "Single hours block for everything; should be per-service like GloriaFood.",
    "", "Fixed", "2026-05-31",
    "task #121 — service-scoped hours rows"],
  [14, D, F, "Feature", "Medium", "Customer",
    "Magnifying-glass search on customer menu page",
    "Customers should be able to search the menu by item name (CloudWaitress-style).",
    "", "Fixed", "2026-05-31",
    "MenuSearchBar shipped"],
  [15, D, F, "Feature", "Medium", "Admin",
    "Manual/auto acceptance toggle for table reservations",
    "Reservations were always auto-accepted; should be toggle in backend, with kitchen ring when manual.",
    "", "Fixed", "2026-05-31",
    "task #122 — manual/auto reservation toggle + ring"],
  [16, D, F, "Feature", "Low", "Admin",
    "45-minute reservation slot length option",
    "Picker needed a 45-min option alongside 30 and 60.",
    "", "Fixed", "2026-05-31",
    "slotLengthMinutes picker (5/10/15/20/30/45/60)"],
  [17, D, F, "Polish", "Low", "Customer",
    "Split Full Name into First + Last name",
    "Customer form had single 'Full Name'; GloriaFood form has Name and Surname separated.",
    "", "Fixed", "2026-06-01",
    "task #136 — split first/last name"],
  [18, D, F, "Polish", "Low", "Customer",
    "Single asterisk on mandatory fields (was showing two)",
    "Form showed '**' on Name / Phone. Should be single asterisk.",
    "", "Fixed", "2026-06-01",
    "task #136 — asterisks"],
  [19, D, F, "Polish", "Low", "Customer",
    "Email field label matches required state",
    "Email said 'optional - for confirmation' but was actually required.",
    "", "Fixed", "2026-06-01",
    "task #136 — email label tracks required state"],
  [20, D, F, "Bug", "High", "Admin",
    "Promo wizard: can't save with only specific items / categories",
    "ItemGroupPicker dropdown was cut off by parent overflow:hidden + sticky footer. Couldn't actually click Save.",
    "", "Fixed", "2026-06-01",
    "ItemGroupPicker rebuilt as centered fixed modal overlay"],
  [21, D, F, "Polish", "Medium", "Kitchen",
    "Scheduled order: kitchen shouldn't be asked for prep time",
    "Customer pre-scheduled an order — kitchen accept modal still asked for prep minutes. Should show 'Confirm scheduled for [date]' with single Confirm button.",
    "", "Fixed", "2026-06-01",
    "scheduled-confirm modal variant; estimatedReady = scheduledFor"],
  [22, D, F, "Feature", "Medium", "Kitchen",
    "In Progress tab: today's items first, then later days",
    "Should group by TODAY then LATER (GloriaFood layout). Today's items stay all day even when countdown hits 0:00.",
    "", "Fixed", "2026-06-02",
    "tasks #138 + #141 — TODAY/LATER groups + countdown chip"],
  [23, D, F, "Feature", "Medium", "Kitchen",
    "Mark menu items out of stock from kitchen",
    "Restaurant should be able to flip stock state from the kitchen tablet (reflected on storefront immediately).",
    "", "Fixed", "2026-06-01",
    "kitchen stock panel; isSoldOut toggle"],
  [24, D, F, "Feature", "Medium", "Kitchen",
    "Pause services for rest of day / specific period (customer banner)",
    "Owner should be able to pause pickup/delivery/etc. for 30 min / 1h / 2h / rest of day. Customer side shows banner.",
    "", "Fixed", "2026-06-01",
    "pause-services + per-service pausedUntil columns + banner"],
  [25, D, F, "Feature", "Medium", "Kitchen",
    "Add extra minutes after order accepted (re-notify customer)",
    "Kitchen often realizes mid-prep they need more time; should be able to extend the ready time post-accept.",
    "", "Fixed", "2026-06-02",
    "'Add prep time / delay' button visible in kitchen accept modal"],
  [26, D, F, "Bug", "High", "Customer",
    "Customer mobile site squished",
    "Storefront didn't display correctly on phone — everything compressed.",
    "", "Fixed", "2026-06-01",
    "task #137 — mobile audit + order page header overflow fix"],
  [27, D, F, "Bug", "High", "Customer",
    "Pending order shows 'OPENS IN 3H 38M' badge when restaurant IS open",
    "Set hours 9 AM – 9 PM; placed order at 11:20 AM; order showed 'opens in 3h 38m' badge and no sound notification fired.",
    "", "Fixed", "2026-05-31",
    "tasks #121 + #123 — false-positive closed status + midnight-wrap"],
  [28, D, F, "Bug", "High", "Customer",
    "'We're closed right now' banner shows when restaurant IS open",
    "Same root cause as 'OPENS IN 3H 38M' — service-scoped hours / midnight-wrap false positive.",
    "", "Fixed", "2026-05-31",
    "tasks #121 + #123"],

  // ─── NEEDS VERIFY (3) — shipped, awaiting Fabrizio re-test ───────
  [29, D, F, "Bug", "Medium", "Customer",
    "'Track order' button in confirmation email — does it work?",
    "Fabrizio reported the green 'track order' button in the order-confirmed email doesn't open the status page. Pending email click test against current build.",
    "", "Verify", "",
    "Functionality wired but specific repro not re-verified post-deploy"],
  [30, D, F, "Bug", "High", "Customer",
    "Promo with usable-hours window applies automatically",
    "Created a 20% promo with usage hours 3PM–6PM, min $25. At 3:30 PM cart at $30 wasn't getting the discount. Without hours set it worked. TZ fix shipped; pending Fabrizio re-test.",
    "", "Verify", "",
    "task #109 — promo TZ fix; need fresh verification with hours set"],
  [31, D, F, "Feature", "Medium", "Admin",
    "Backend toggle: make email / phone mandatory on order form",
    "Reservation form has this; pickup/delivery order form may not. Need to confirm if any backend toggle exists, otherwise this is a small build.",
    "", "Verify", "",
    "Unclear whether the toggle exists yet — needs admin-side audit"],

  // ─── NEW / NOT BUILT (10) ────────────────────────────────────────
  [32, D, F, "Feature", "Medium", "Admin",
    "Menu import: pull photos from GloriaFood source as well",
    "GloriaFood importer brings in items + categories but not photos. Should also grab the image URLs.",
    "", "New", "",
    "Extension of task #93 — POST-LAUNCH candidate"],
  [33, D, F, "Bug", "Medium", "Customer",
    "Order emails sent under 'Fee Free Ordering' name, not the restaurant's",
    "Customer-facing emails should appear from the restaurant the customer ordered from (matches GloriaFood behaviour).",
    "", "New", "",
    "Resend sender name override per restaurant"],
  [34, D, F, "Feature", "Medium", "Customer",
    "Accept / reject emails include restaurant phone + auto-refund language",
    "Currently the rejection email is sparse. Should include restaurant phone + 'if you paid by card, no charge was made and we'll refund automatically' line.",
    "", "New", "",
    "Email template additions"],
  [35, D, F, "Feature", "Medium", "Admin",
    "Magnifying-glass search on admin menu page + backend toggle for customer search",
    "Owner should be able to search their own menu (find item, change price) AND toggle whether the customer-side search bar is shown.",
    "", "New", "",
    "Admin MenuClient search bar; restaurant.showMenuSearch flag"],
  [36, D, F, "Feature", "Low", "Admin",
    "Export customer list as CSV",
    "Like GloriaFood — backend button to download the full Clients table as CSV.",
    "", "New", "",
    "Server route + download UI"],
  [37, D, F, "Feature", "Medium", "Admin",
    "Stripe: allow direct publishable + secret key entry (skip Connect onboarding)",
    "Currently shop has to sign up for Stripe Connect. Should also support pasting existing publishable + secret keys (GloriaFood pattern).",
    "", "New", "",
    "Schema field + payments adapter — bigger build"],
  [38, D, F, "Feature", "Medium", "Customer",
    "Marketing-consent checkbox + customizable privacy policy",
    "Customer form should offer 'Yes, I'd like marketing communications from this restaurant'. Restaurant has editable Privacy Policy boilerplate in backend.",
    "", "New", "",
    "Form field + content management — possible legal requirement"],
  [39, D, F, "Feature", "Medium", "Customer",
    "Delivery address auto-complete + map pin drop",
    "Currently free-text only. Auto-complete after first few letters + optional pin-on-map (GloriaFood requires pin).",
    "", "New", "",
    "Google Places / Mapbox integration"],
  [40, D, F, "Feature", "Medium", "Admin",
    "End-of-day report",
    "Single report showing today's totals — orders, revenue, top items, services pause stats.",
    "", "New", "",
    "Reports section addition"],
  [41, D, F, "Feature", "Low", "Kitchen",
    "Change menu-item prices directly from kitchen",
    "Like the out-of-stock toggle, but for price. Owner can quickly tweak without going to admin.",
    "", "New", "",
    "Kitchen tablet menu-stock panel extension"],
];

const rows = [headers, ...examples, ...fabrizioItems];

const trackerWs = XLSX.utils.aoa_to_sheet(rows);
trackerWs["!cols"] = [
  { wch: 4 }, { wch: 12 }, { wch: 14 }, { wch: 9 }, { wch: 10 },
  { wch: 14 }, { wch: 50 }, { wch: 70 }, { wch: 18 }, { wch: 14 },
  { wch: 12 }, { wch: 50 },
];
trackerWs["!freeze"] = { xSplit: 0, ySplit: 1 };
trackerWs["!autofilter"] = { ref: `A1:L${rows.length}` };

// ── Vocab sheet (with new 'Verify' status added) ─────────────────────
const refWs = XLSX.utils.aoa_to_sheet([
  ["Type", "Severity", "Area", "Status"],
  ["Bug", "Blocker", "Customer (storefront)", "New"],
  ["Feature", "High", "Kitchen", "In Progress"],
  ["Polish", "Medium", "Admin", "Verify"],
  ["Question", "Low", "Reseller", "Fixed"],
  ["", "", "Superadmin", "Won't Fix"],
  ["", "", "Marketplace", "Duplicate"],
  ["", "", "Custom Domain", "Cannot Reproduce"],
  ["", "", "Mobile", ""],
  ["", "", "Other", ""],
]);
refWs["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 18 }];

// ── Summary — counts gated on Title (column G) being non-empty ──────
const summaryWs = XLSX.utils.aoa_to_sheet([
  ["Quick Look (a row counts once its Title column is filled in)"],
  [],
  ["Total reported",       { f: 'COUNTIF(Tracker!G2:G1000,"?*")' }],
  ["Open (New + Verify + In Progress)", { f: 'COUNTIFS(Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate",Tracker!J2:J1000,"<>Cannot Reproduce")' }],
  ["Verify (awaiting re-test)", { f: 'COUNTIF(Tracker!J2:J1000,"Verify")' }],
  ["Fixed",                { f: 'COUNTIF(Tracker!J2:J1000,"Fixed")' }],
  [],
  ["By severity (open only)"],
  ["Blocker",              { f: 'COUNTIFS(Tracker!E2:E1000,"Blocker",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["High",                 { f: 'COUNTIFS(Tracker!E2:E1000,"High",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["Medium",               { f: 'COUNTIFS(Tracker!E2:E1000,"Medium",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["Low",                  { f: 'COUNTIFS(Tracker!E2:E1000,"Low",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  [],
  ["By type (all)"],
  ["Bug",                  { f: 'COUNTIF(Tracker!D2:D1000,"Bug")' }],
  ["Feature",              { f: 'COUNTIF(Tracker!D2:D1000,"Feature")' }],
  ["Polish",               { f: 'COUNTIF(Tracker!D2:D1000,"Polish")' }],
]);
summaryWs["!cols"] = [{ wch: 38 }, { wch: 12 }];

const readmeWs = XLSX.utils.aoa_to_sheet([
  ["Fee Free Bug & Feature Tracker — v3"],
  [],
  ["What's new in v3"],
  ["• Added 37 items from Fabrizio's 2026-06-01 email batch (5 emails / 10 screenshots), IDs 4–41"],
  ["• New Status value: 'Verify' — for items that shipped but await re-test from the original reporter"],
  ["• Summary 'Open' total now includes Verify items (they're not done until verified)"],
  [],
  ["Tabs"],
  ["• Tracker — the data. Sort by Severity or filter by Status."],
  ["• Summary — live counts. Open + Verify + Fixed totals."],
  ["• Vocab — dropdown vocabulary (Data → Data Validation → List)"],
  [],
  ["Tip: 'Verify' is the next batch to send to Fabrizio for re-test. Once he confirms each one works, change the Status to Fixed and add the date."],
]);
readmeWs["!cols"] = [{ wch: 110 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, readmeWs, "README");
XLSX.utils.book_append_sheet(wb, trackerWs, "Tracker");
XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
XLSX.utils.book_append_sheet(wb, refWs, "Vocab");

XLSX.writeFile(wb, OUT);
console.log(`✓ Wrote ${OUT}`);

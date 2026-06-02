/**
 * Generates a bug + feature tracker Excel workbook for Luigi.
 * Pre-filled with a few rows so the format is obvious. Drops the
 * file in his Downloads folder.
 *
 *   npx -p xlsx node scripts/gen-bug-tracker.js
 */
const XLSX = require("xlsx");
const path = require("path");
const os = require("os");

const DOWNLOADS = path.join(os.homedir(), "Downloads");
const OUT = path.join(DOWNLOADS, "FeeFree-Bug-Tracker-v2.xlsx");

// ── Main tracker sheet ──────────────────────────────────────────────
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

const rows = [
  headers,
  // Three example rows pre-filled so Luigi sees what good entries look like.
  [
    1,
    "2026-06-01",
    "Fabrizio",
    "Bug",
    "High",
    "Customer",
    "Promo tiles black on luigispizzapastawings.com",
    "Open the storefront on the custom domain — both BOGO and FREE DELIVERY tiles render as solid black. Works fine on feefreeordering.com.",
    "",
    "Fixed",
    "2026-06-02 — commit fd54903 (proxy matcher exempted all static-asset extensions)",
  ],
  [
    2,
    "2026-06-01",
    "Luigi",
    "Feature",
    "Medium",
    "Kitchen",
    "Single active kitchen login at a time",
    "Like GloriaFood — when a second device signs in to the kitchen, the first should get logged out automatically.",
    "",
    "Fixed",
    "2026-06-02 — commits 7fc1be5 + 44a76e6",
  ],
  [
    3,
    "2026-06-02",
    "Luigi",
    "Bug",
    "High",
    "Kitchen",
    "Catering order scheduled tomorrow shows Ready in 14:31 on tablet",
    "Place a catering order scheduled for tomorrow 10:30 PM. Open kitchen — countdown reads 14:31 instead of ~24 hours. Auto-accept was setting estimatedReady=now+20m and ignoring scheduledFor.",
    "",
    "Fixed",
    "2026-06-02 — commit 6de2c21",
  ],
  // No empty placeholder rows. Excel's AutoFilter + frozen header
  // make adding new entries easy: click the first empty cell below
  // the last row and start typing. Empty rows confuse the Summary
  // formulas because xlsx writes empty strings as actual values that
  // COUNTA still counts (Luigi 2026-06-02: "total 8, open 5" when
  // there were only 3 real entries).
];

const trackerWs = XLSX.utils.aoa_to_sheet(rows);

// Column widths
trackerWs["!cols"] = [
  { wch: 4 },   // ID
  { wch: 12 },  // Date Reported
  { wch: 14 },  // Reporter
  { wch: 9 },   // Type
  { wch: 10 },  // Severity
  { wch: 14 },  // Area
  { wch: 38 },  // Title
  { wch: 60 },  // Steps
  { wch: 18 },  // Screenshot
  { wch: 14 },  // Status
  { wch: 12 },  // Date Fixed
  { wch: 40 },  // Notes
];

// Freeze header row + enable filter on header
trackerWs["!freeze"] = { xSplit: 0, ySplit: 1 };
trackerWs["!autofilter"] = { ref: `A1:L${rows.length}` };

// ── Dropdown vocab on a second sheet (used as reference for data
//    validation set up later inside Excel — auto-applying data
//    validation via xlsx-style isn't widely supported by the writer
//    we use, so we just document the allowed values here). ──────────
const refWs = XLSX.utils.aoa_to_sheet([
  ["Type", "Severity", "Area", "Status"],
  ["Bug", "Blocker", "Customer (storefront)", "New"],
  ["Feature", "High", "Kitchen", "In Progress"],
  ["Polish", "Medium", "Admin", "Fixed"],
  ["Question", "Low", "Reseller", "Won't Fix"],
  ["", "", "Superadmin", "Duplicate"],
  ["", "", "Marketplace", "Cannot Reproduce"],
  ["", "", "Custom Domain", ""],
  ["", "", "Mobile", ""],
  ["", "", "Other", ""],
]);
refWs["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 18 }];

// ── Quick-look summary sheet ────────────────────────────────────────
// All counts gate on the Title column (G) being non-empty so a row
// only contributes once it actually has a title typed. That way empty
// rows you add but haven't filled yet never inflate the numbers.
const summaryWs = XLSX.utils.aoa_to_sheet([
  ["Quick Look (formulas count by Title column — a row is real once Title is filled)"],
  [],
  ["Total reported",      { f: 'COUNTIF(Tracker!G2:G1000,"?*")' }],
  ["Open (not yet Fixed)", { f: 'COUNTIFS(Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["Fixed",               { f: 'COUNTIF(Tracker!J2:J1000,"Fixed")' }],
  [],
  ["By severity (open only)"],
  ["Blocker",             { f: 'COUNTIFS(Tracker!E2:E1000,"Blocker",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["High",                { f: 'COUNTIFS(Tracker!E2:E1000,"High",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["Medium",              { f: 'COUNTIFS(Tracker!E2:E1000,"Medium",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  ["Low",                 { f: 'COUNTIFS(Tracker!E2:E1000,"Low",Tracker!G2:G1000,"?*",Tracker!J2:J1000,"<>Fixed",Tracker!J2:J1000,"<>Won\'t Fix",Tracker!J2:J1000,"<>Duplicate")' }],
  [],
  ["By type (all)"],
  ["Bug",                 { f: 'COUNTIF(Tracker!D2:D1000,"Bug")' }],
  ["Feature",             { f: 'COUNTIF(Tracker!D2:D1000,"Feature")' }],
  ["Polish",              { f: 'COUNTIF(Tracker!D2:D1000,"Polish")' }],
]);
summaryWs["!cols"] = [{ wch: 36 }, { wch: 12 }];

// ── README sheet ────────────────────────────────────────────────────
const readmeWs = XLSX.utils.aoa_to_sheet([
  ["Fee Free Bug & Feature Tracker — how to use"],
  [],
  ["Sheet: Tracker"],
  ["Every reported bug / feature goes on one row. Sort or filter by Severity or Status to focus."],
  ["Pre-filled rows 2–4 show what good entries look like — feel free to delete them once you have your own."],
  [],
  ["Sheet: Vocab"],
  ["The vocabulary Excel can use for dropdowns. To enable: select the Type / Severity / Area / Status columns on Tracker, then Data → Data Validation → List → choose the matching column on Vocab."],
  [],
  ["Sheet: Summary"],
  ["Auto-counts open vs fixed, by severity and type. No editing needed — opens, looks at numbers, goes."],
  [],
  ["Tip — share with testers"],
  ["The fastest way to let testers add bugs themselves is to upload this file to Google Drive and open it as Google Sheets. The formulas and structure carry over and they can add rows from a phone in 5 seconds."],
  [],
  ["Tip — in-app reporter (next step)"],
  ["Ask Claude to build a 'Report a bug' button into the admin panel. Testers fill a modal, you see all reports at /admin/feedback. This kills the manual transcription work."],
]);
readmeWs["!cols"] = [{ wch: 120 }];

// ── Build workbook ──────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, readmeWs, "README");
XLSX.utils.book_append_sheet(wb, trackerWs, "Tracker");
XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
XLSX.utils.book_append_sheet(wb, refWs, "Vocab");

XLSX.writeFile(wb, OUT);
console.log(`✓ Wrote ${OUT}`);

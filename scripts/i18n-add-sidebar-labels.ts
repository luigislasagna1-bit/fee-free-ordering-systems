/**
 * admin.sidebar — the 33 labelKeys referenced by AdminSidebar.tsx that existed
 * in NO locale (2026-07-22 finding, during the add-on-catalog i18n work).
 * useSafeT() silently fell back to each item's hardcoded English `label`, so
 * non-English admins saw English for the whole Reports tree, Accepted Methods,
 * Publishing, the add-on category headers and the GrowthNet cluster — plus a
 * MISSING_MESSAGE console error per key on every admin render.
 *
 * Three sources, per locale:
 *  - 22 TRANSLATED labels — packs in scripts/i18n-data/sidebar-labels/<code>.json
 *    (translator workflow output; en values embedded below).
 *  - 7 DERIVED from that locale's own addOnCatalog block (shipped 6b4feecf) so
 *    sidebar and billing catalog can never disagree on an add-on's name:
 *    salesOptimizedWebsite/customDomain/categoryMobileApp/categoryKds/
 *    categoryPos/marketplace = the catalog name; apm = "APM (<advanced_promos name>)".
 *  - 4 BRAND constants identical everywhere: GrowthNet, Kickstarter,
 *    ContentPilot, Nabil AI (standing never-translate rule).
 *
 * Fails loudly on missing pack/key/empty value. Idempotent.
 *   npx tsx scripts/i18n-add-sidebar-labels.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const TRANSLATED_KEYS = [
  "paymentMethods",
  "publishing",
  "customerSms",
  "reportsDashboard",
  "reportsSales",
  "reportsSalesTrend",
  "reportsSalesSummary",
  "reportsMenuInsights",
  "reportsMenuInsightsCategories",
  "reportsMenuInsightsItems",
  "reportsOnlineOrdering",
  "reportsFunnel",
  "reportsClients",
  "reportsReservations",
  "reportsGoogleRank",
  "reportsVisits",
  "reportsHeatmap",
  "reportsConnectivity",
  "reportsPromotions",
  "reportsListView",
  "reportsListOrders",
  "reportsListClients",
] as const;

const EN: Record<string, string> = {
  paymentMethods: "Accepted Methods",
  publishing: "Publishing",
  customerSms: "Customer SMS",
  reportsDashboard: "Dashboard",
  reportsSales: "Sales",
  reportsSalesTrend: "Trend",
  reportsSalesSummary: "Summary",
  reportsMenuInsights: "Menu Insights",
  reportsMenuInsightsCategories: "By Category",
  reportsMenuInsightsItems: "By Item",
  reportsOnlineOrdering: "Online Ordering",
  reportsFunnel: "Website Funnel",
  reportsClients: "Clients",
  reportsReservations: "Table Reservations",
  reportsGoogleRank: "Google Ranking",
  reportsVisits: "Website Visits",
  reportsHeatmap: "Delivery Heatmap",
  reportsConnectivity: "Connectivity Health",
  reportsPromotions: "Promotions Stats",
  reportsListView: "List View",
  reportsListOrders: "Orders",
  reportsListClients: "Clients",
};

// slug in addOnCatalog → sidebar key it feeds
const DERIVED: Array<{ sidebarKey: string; slug: string }> = [
  { sidebarKey: "salesOptimizedWebsite", slug: "hosted_website" },
  { sidebarKey: "customDomain", slug: "custom_domain" },
  { sidebarKey: "categoryMobileApp", slug: "branded_mobile_app" },
  { sidebarKey: "categoryKds", slug: "kds_screen" },
  { sidebarKey: "categoryPos", slug: "pos_module" },
  { sidebarKey: "marketplace", slug: "marketplace" },
];

const BRANDS: Record<string, string> = {
  growthNet: "GrowthNet",
  kickstarter: "Kickstarter",
  contentPilot: "ContentPilot",
  categoryNabilAi: "Nabil AI",
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "sidebar-labels");
const dir = path.join(process.cwd(), "src", "messages");

let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  let pack: Record<string, string>;
  if (loc === "en") {
    pack = EN;
  } else {
    const packFile = path.join(dataDir, `${loc}.json`);
    if (!fs.existsSync(packFile)) throw new Error(`${loc}: missing pack ${packFile}`);
    pack = JSON.parse(fs.readFileSync(packFile, "utf8"));
  }
  for (const k of TRANSLATED_KEYS) {
    if (typeof pack[k] !== "string" || !pack[k].trim()) throw new Error(`${loc}: ${k} missing/empty`);
  }
  const extra = Object.keys(pack).filter((k) => !(TRANSLATED_KEYS as readonly string[]).includes(k));
  if (extra.length) throw new Error(`${loc}: unexpected extra pack keys: ${extra.join(", ")}`);

  const catalog = json.addOnCatalog;
  const sidebar = ((json.admin ??= {}).sidebar ??= {});

  for (const k of TRANSLATED_KEYS) sidebar[k] = decode(pack[k]).trim();
  for (const { sidebarKey, slug } of DERIVED) {
    const name = catalog?.[slug]?.name;
    if (typeof name !== "string" || !name.trim()) throw new Error(`${loc}: addOnCatalog.${slug}.name missing — run i18n-add-addon-catalog first`);
    sidebar[sidebarKey] = name.trim();
  }
  {
    const apmName = catalog?.advanced_promos?.name;
    if (typeof apmName !== "string" || !apmName.trim()) throw new Error(`${loc}: addOnCatalog.advanced_promos.name missing`);
    sidebar.apm = `APM (${apmName.trim()})`;
  }
  for (const [k, v] of Object.entries(BRANDS)) sidebar[k] = v;

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ admin.sidebar labels (22 translated + 7 derived + 4 brands = 33 keys) written to ${changed} locale file(s)`);

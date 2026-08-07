/**
 * Partner / superadmin Orders List strings → reseller.ordersList.* ×38.
 * (Fabrizio reseller report cmshrr94z001d04l7x8kpet3z.)
 *
 * Only genuinely-new strings live here. Everything already translated is
 * reused from its existing home rather than duplicated:
 *   status labels → admin.orders.* + kitchen.missed/seated/noShow
 *   money labels  → ordering.subtotal/tax/tip/deliveryFee/discount
 *   table chrome  → admin.reportOrdersList.* (colStatus/colType/colTotal/
 *                   perPage/emptyState/pagination*), common.notes/loading
 *
 * Writes the ENGLISH baseline into every locale so the 38-way parity audit
 * passes and the page renders everywhere; translation of these keys runs
 * separately via scripts/wf-translate-keys.js.
 *
 *   npx tsx scripts/i18n-add-partner-orders-list.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const ORDERS_LIST: Record<string, string> = {
  pageTitle: "Orders List",
  pageTitlePlatform: "Orders List — All Restaurants",
  countLabel: "{count, plural, one {# result} other {# results}} · {range}",
  searchPlaceholder: "Search name, order ID, phone, email…",

  colName: "Name",
  colCompany: "Company Name",
  colOrderId: "Order ID",
  colPlacedAt: "Placed at",
  colPayment: "Payment Method",
  colFulfilment: "Fulfilment time",
  columns: "Columns",

  allRestaurants: "All restaurants.",
  allTypes: "All types",
  notApplicable: "N/A",

  type_delivery: "Delivery",
  type_pickup: "Pickup",
  type_on_premise: "On premise",
  type_catering: "Catering",
  type_table_reservation: "Table reservation",
  type_reservation_preorder: "Reservation & Pre-order",

  tabDetail: "Order detail",
  tabItems: "Order items",
  showLess: "Show less",

  lblConfirmedAt: "Confirmed at",
  lblFulfilledAt: "Fulfilled at",
  lblCredit: "Store credit",
  lblGuests: "Guests",
  lblDeposit: "Deposit",
  lblPreOrder: "Pre-order",
  lblCode: "Confirmation code",

  loadError: "Couldn't load this order. Please try again.",
  export: "Export",
  showOlder: "Show orders older than 30 days",
  narrowRange:
    "You've reached as far as we can page through at once. Narrow the date range, or filter by restaurant or type, to see more.",
  mixedCurrencyNote:
    "Your restaurants use more than one currency, so each total is shown in its own restaurant's currency and totals are never added together.",
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.reseller ??= {};
  json.reseller.ordersList = ORDERS_LIST;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(
  `✅ reseller.ordersList (${Object.keys(ORDERS_LIST).length} keys) written to ${changed} locale file(s) — English baseline; translate via wf-translate-keys.`,
);

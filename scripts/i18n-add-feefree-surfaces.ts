/**
 * FeeFreeDelivery surfaces (2026-07-13) ×38 — customer live-tracking card +
 * restaurant-admin deliveries/billing ops panel.
 * Adds customer.tracking.* (9 keys, ICU {name}/{minutes}) and merges the ops.*
 * keys (17) into admin.feefreeDelivery. English inline; the 37 non-English packs
 * (subagents) live in scripts/i18n-data/feefree-surfaces/, split into
 * { tracking, ops } per locale.
 *   npx tsx scripts/i18n-add-feefree-surfaces.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const TRACKING_KEYS = [
  "onTheWayTitle", "headingToStoreTitle", "live", "onTheWayNamed", "headingToStoreNamed",
  "onTheWayGeneric", "headingToStoreGeneric", "etaAway", "mapTitle",
] as const;
const OPS_KEYS = [
  "opsTitle", "amountOwed", "deliveriesThisWeek", "nextCharge", "heldTitle", "sendToDriver",
  "sending", "sent", "sendFailed", "activeDeliveries", "noActiveDeliveries", "unassigned",
  "st_queued", "st_assigned", "st_accepted", "st_started", "st_enroute",
] as const;

const enTracking: Record<string, string> = {
  onTheWayTitle: "Your delivery is on the way",
  headingToStoreTitle: "A driver is picking up your order",
  live: "Live",
  onTheWayNamed: "{name} is on the way with your order.",
  headingToStoreNamed: "{name} is heading to the restaurant to pick up your order.",
  onTheWayGeneric: "Your driver is on the way with your order.",
  headingToStoreGeneric: "Your driver is heading to the restaurant to pick up your order.",
  etaAway: "About {minutes} min away",
  mapTitle: "Live driver location",
};
const enOps: Record<string, string> = {
  opsTitle: "Deliveries & billing",
  amountOwed: "Amount owed",
  deliveriesThisWeek: "Deliveries this week",
  nextCharge: "Next charge",
  heldTitle: "Waiting to send",
  sendToDriver: "Send to driver",
  sending: "Sending…",
  sent: "Sent to a driver",
  sendFailed: "Couldn't send. Please try again.",
  activeDeliveries: "Active deliveries",
  noActiveDeliveries: "No deliveries in progress.",
  unassigned: "Waiting for a driver",
  st_queued: "Queued",
  st_assigned: "Assigned",
  st_accepted: "Accepted",
  st_started: "Heading to store",
  st_enroute: "On the way",
};

// Some translators emitted &amp; for a literal & — React renders JS strings
// verbatim (no HTML decoding), so decode common entities back to raw chars.
function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "feefree-surfaces");
const packs: Record<string, { tracking: Record<string, string>; ops: Record<string, string> }> = {
  en: { tracking: enTracking, ops: enOps },
};
for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith(".json"))) {
  const group = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const [loc, obj] of Object.entries(group as Record<string, any>)) {
    packs[loc] = { tracking: obj.tracking, ops: obj.ops };
  }
}

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = packs[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  for (const k of TRACKING_KEYS) if (typeof pack.tracking?.[k] !== "string") throw new Error(`${loc}: missing tracking.${k}`);
  for (const k of OPS_KEYS) if (typeof pack.ops?.[k] !== "string") throw new Error(`${loc}: missing ops.${k}`);

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  const tracking = ((json.customer ??= {}).tracking ??= {});
  for (const k of TRACKING_KEYS) tracking[k] = decode(pack.tracking[k]);

  const ops = ((json.admin ??= {}).feefreeDelivery ??= {});
  for (const k of OPS_KEYS) ops[k] = decode(pack.ops[k]);

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ customer.tracking (${TRACKING_KEYS.length}) + admin.feefreeDelivery ops (${OPS_KEYS.length}) written to ${changed} locale file(s)`);

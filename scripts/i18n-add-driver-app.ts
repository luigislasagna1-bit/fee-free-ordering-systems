/**
 * FeeFreeDelivery driver PWA (/driver) — staff-facing UI strings (2026-07-13) ×38.
 * Adds the `driver` namespace (28 keys: login, queue, job actions, status labels).
 * English inline; the 37 non-English packs (from the translation subagents) live
 * in scripts/i18n-data/driver-app/.
 *   npx tsx scripts/i18n-add-driver-app.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const KEYS = [
  "loginTitle", "loginHelp", "appName", "myJobsTitle", "openQueueTitle", "emptyQueue",
  "accept", "start", "pickedUp", "delivered", "tip", "openInMaps", "callCustomer",
  "callRestaurant", "cantComplete", "statusUpdated", "actionFailed", "alreadyClaimed",
  "signOut", "refresh", "gpsLive", "status_queued", "status_accepted", "status_started",
  "status_picked_up", "status_out_for_delivery", "status_delivered", "status_failed",
] as const;

const en: Record<string, string> = {
  loginTitle: "Driver sign in",
  loginHelp: "Sign in to pick up delivery jobs.",
  appName: "Fee Free Driver",
  myJobsTitle: "My deliveries",
  openQueueTitle: "Available jobs",
  emptyQueue: "No jobs available right now.",
  accept: "Accept",
  start: "Start driving",
  pickedUp: "Picked up",
  delivered: "Delivered",
  tip: "Tip",
  openInMaps: "Directions",
  callCustomer: "Call customer",
  callRestaurant: "Call store",
  cantComplete: "Can't complete this delivery",
  statusUpdated: "Updated",
  actionFailed: "Couldn't update. Please try again.",
  alreadyClaimed: "Another driver already took this job.",
  signOut: "Sign out",
  refresh: "Refresh",
  gpsLive: "Live",
  status_queued: "Waiting to be picked up",
  status_accepted: "Accepted — head to the store",
  status_started: "On the way to the store",
  status_picked_up: "Picked up — on the way to the customer",
  status_out_for_delivery: "Out for delivery",
  status_delivered: "Delivered",
  status_failed: "Not completed",
};

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "driver-app");
const packs: Record<string, Record<string, string>> = { en };
for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith(".json"))) {
  const group = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const [loc, obj] of Object.entries(group)) Object.assign((packs[loc] ??= {}), obj as Record<string, string>);
}

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = packs[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  for (const k of KEYS) if (typeof pack[k] !== "string") throw new Error(`${loc}: missing key ${k}`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const target = (json.driver ??= {});
  for (const k of KEYS) target[k] = pack[k];
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ driver namespace (${KEYS.length} keys) written to ${changed} locale file(s)`);

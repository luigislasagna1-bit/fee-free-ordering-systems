/**
 * Fee Free Delivery — admin enable section (2026-07-13) ×38.
 * Adds admin.feefreeDelivery.* (15 keys: heading/badge/description, enable +
 * autoSend toggles + hints, precedence note, entitlement upsell, save toasts)
 * to every locale. English is authored inline; the 37 non-English packs were
 * produced by the translation subagents and live in scripts/i18n-data/feefree-enable/.
 *   npx tsx scripts/i18n-add-feefree-enable.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const KEYS = [
  "heading", "badge", "description", "enableLabel", "enableHint",
  "autoSendLabel", "autoSendOnHint", "autoSendOffHint", "precedenceNote",
  "lockedNotice", "getDriverPool", "toastSaved", "toastFailedToSave",
  "toastAddonRequired", "toastOnlinePaymentRequired",
] as const;

const en: Record<string, string> = {
  heading: "Fee Free Delivery",
  badge: "In-house",
  description: "Dispatch delivery orders to your own drivers — a flat $7.99 per delivery, billed weekly. When on, new delivery orders go to your Fee Free drivers instead of ShipDay.",
  enableLabel: "Enable Fee Free Delivery",
  enableHint: "Route new delivery orders to your own driver pool.",
  autoSendLabel: "Auto-send on accept",
  autoSendOnHint: "On: every new delivery is queued to a driver the moment you accept it.",
  autoSendOffHint: "Off: new deliveries are held so you can send them to a driver manually.",
  precedenceNote: "Fee Free Delivery is on, so it takes priority over ShipDay — new delivery orders go to your own drivers. Turn it off to use the ShipDay source below.",
  lockedNotice: "Fee Free Delivery is part of the Driver Pool add-on. Subscribe to send orders to your own driver pool.",
  getDriverPool: "Get Driver Pool",
  toastSaved: "Saved",
  toastFailedToSave: "Couldn't save. Please try again.",
  toastAddonRequired: "Subscribe to Driver Pool to turn on Fee Free Delivery.",
  toastOnlinePaymentRequired: "Fee Free Delivery needs an online payment method first — your drivers don't collect at the door, so delivery orders must be paid online. Enable card payments or connect PayPal, then turn it on.",
};

// Merge the subagent-produced packs (one JSON per locale-group).
const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "feefree-enable");
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
  const target = ((json.admin ??= {}).feefreeDelivery ??= {});
  for (const k of KEYS) target[k] = pack[k];
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ admin.feefreeDelivery (${KEYS.length} keys) written to ${changed} locale file(s)`);

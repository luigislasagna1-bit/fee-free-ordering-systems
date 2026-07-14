/**
 * Delivery-provider chooser (2026-07-14) ×38 — the "how deliveries go out"
 * selector on /admin/delivery/pool (own vs ShipDay vs Fee Free Delivery), plus
 * a retune of admin.feefreeDelivery.description to the distance-tiered pricing.
 * Adds admin.deliveryProvider.* (19 keys) and overwrites
 * admin.feefreeDelivery.description. English inline; the 37 non-English packs
 * (subagents) live in scripts/i18n-data/delivery-provider/, split into
 * { deliveryProvider, feefreeDescription } per locale.
 *   npx tsx scripts/i18n-add-delivery-provider.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const DP_KEYS = [
  "title", "desc", "ownLabel", "ownDesc", "shipdayLabel", "shipdayDesc",
  "feefreeLabel", "feefreeDesc", "feefreeAreaBadge", "activeBadge", "addonRequired",
  "ownNote", "toastSaved", "toastFailed", "lockedToast", "onlinePaymentToast",
  "notInAreaToast", "lockedNotice", "getDriverPool",
] as const;

const enDeliveryProvider: Record<string, string> = {
  title: "Delivery method",
  desc: "Choose how new delivery orders are dispatched. You can change this anytime — only your chosen method's settings show below.",
  ownLabel: "Your own drivers",
  ownDesc: "You handle delivery yourself — nothing is dispatched for you.",
  shipdayLabel: "ShipDay",
  shipdayDesc: "Dispatch to the ShipDay third-party courier network. Available everywhere.",
  feefreeLabel: "Fee Free Delivery",
  feefreeDesc: "Our own local driver pool — from $7.99 per delivery by distance, billed weekly.",
  feefreeAreaBadge: "In your area",
  activeBadge: "Active",
  addonRequired: "Add-on",
  ownNote: "You're handling delivery with your own drivers. New delivery orders won't be dispatched anywhere by Fee Free — you manage them yourself.",
  toastSaved: "Delivery method updated",
  toastFailed: "Couldn't switch. Please try again.",
  lockedToast: "Subscribe to Driver Pool to dispatch with ShipDay or Fee Free Delivery.",
  onlinePaymentToast: "You need an online payment method first — delivery orders must be paid online.",
  notInAreaToast: "Fee Free Delivery isn't available in your area yet.",
  lockedNotice: "ShipDay and Fee Free Delivery need the Driver Pool add-on. Your own drivers are always free to use.",
  getDriverPool: "Get Driver Pool",
};
const enFeefreeDescription =
  "Dispatch delivery orders to your own local drivers — billed weekly, priced by delivery distance (from $7.99). When on, new delivery orders go to your Fee Free drivers instead of ShipDay.";

// Some translators emitted &amp; for a literal & — React renders JS strings
// verbatim (no HTML decoding), so decode common entities back to raw chars.
function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "delivery-provider");
const packs: Record<string, { deliveryProvider: Record<string, string>; feefreeDescription: string }> = {
  en: { deliveryProvider: enDeliveryProvider, feefreeDescription: enFeefreeDescription },
};
for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith(".json"))) {
  const group = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const [loc, obj] of Object.entries(group as Record<string, any>)) {
    packs[loc] = { deliveryProvider: obj.deliveryProvider, feefreeDescription: obj.feefreeDescription };
  }
}

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = packs[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  for (const k of DP_KEYS) if (typeof pack.deliveryProvider?.[k] !== "string") throw new Error(`${loc}: missing deliveryProvider.${k}`);
  if (typeof pack.feefreeDescription !== "string") throw new Error(`${loc}: missing feefreeDescription`);

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  const dp = ((json.admin ??= {}).deliveryProvider ??= {});
  for (const k of DP_KEYS) dp[k] = decode(pack.deliveryProvider[k]);

  ((json.admin ??= {}).feefreeDelivery ??= {}).description = decode(pack.feefreeDescription);

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ admin.deliveryProvider (${DP_KEYS.length}) + admin.feefreeDelivery.description written to ${changed} locale file(s)`);

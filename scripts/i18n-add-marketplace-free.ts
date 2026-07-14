/**
 * Marketplace → FREE + INCLUDED, 15km geo + badges (2026-07-14) ×38.
 * Adds/rewrites 17 marketplace.* keys: geo/location bar (locating, withinRadius,
 * setYourLocation, changeLocation, useMyLocation, enterPostalCta,
 * enterPostalPlaceholder, applyLocation, locationNotFound, noNearbyTitle,
 * noNearbyBody, kmAway), pickup/delivery badges (badgePickup, badgeDelivery), and
 * the rewritten free-model copy (pitchBody, ownerBody, metaDescription).
 * English inline; 37 non-English packs in scripts/i18n-data/marketplace-free/.
 *   npx tsx scripts/i18n-add-marketplace-free.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const KEYS = [
  "locating", "withinRadius", "setYourLocation", "changeLocation", "useMyLocation",
  "enterPostalCta", "enterPostalPlaceholder", "applyLocation", "locationNotFound",
  "noNearbyTitle", "noNearbyBody", "kmAway", "badgePickup", "badgeDelivery",
  "pitchBody", "ownerBody", "metaDescription",
] as const;

const en: Record<string, string> = {
  locating: "Finding restaurants near you…",
  withinRadius: "Within {km} km of you",
  setYourLocation: "Set your location to see what's open near you",
  changeLocation: "Change",
  useMyLocation: "Use my location",
  enterPostalCta: "Enter location",
  enterPostalPlaceholder: "Postal code or city",
  applyLocation: "Search",
  locationNotFound: "We couldn't find that place. Try a postal code or city.",
  noNearbyTitle: "No restaurants near you yet",
  noNearbyBody: "No restaurants within {km} km of you have joined yet — check back soon as more come online.",
  kmAway: "{km} km",
  badgePickup: "Pickup",
  badgeDelivery: "Delivery",
  pitchBody: "Every restaurant here is a local, independent business — no 30% commissions, no hidden fees, and the price you see is the price they set. Order directly and every dollar goes to the restaurant, not a middleman.",
  ownerBody: "Own a restaurant? <b>Getting listed on the Fee Free Marketplace is free</b> — no monthly fee, no per-order commission, ever. Offer pickup or delivery and reach new customers nearby while keeping your brand, your customers, and 100% of your prices.",
  metaDescription: "Order from local restaurants near you on the Fee Free Marketplace — free listings for restaurants, no 30% commissions, and the price you see is the price they set.",
};

// Some translators emit &lt;b&gt; for the literal <b> tag; React renders JS
// strings verbatim, so decode entities back to raw characters.
function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "marketplace-free");
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
  const target = (json.marketplace ??= {});
  for (const k of KEYS) target[k] = decode(pack[k]);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ marketplace (${KEYS.length} keys) written to ${changed} locale file(s)`);

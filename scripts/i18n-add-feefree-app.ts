/**
 * Fee Free Delivery app shell (2026-07-14) ×38 — the strings that wrap the
 * dual-role /driver app: the restaurant DISPATCH view header/empty-state and the
 * "restaurant owner? sign in with your dashboard login" link on the driver
 * login. English inline; the 37 non-English packs (subagents) live in
 * scripts/i18n-data/feefree-app/ as a flat { locale: {...5 keys} } per group.
 *   npx tsx scripts/i18n-add-feefree-app.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const KEYS = [
  "dispatchSubtitle", "openDashboard", "notEnabledTitle", "notEnabledBody", "restaurantLoginCta",
] as const;

const en: Record<string, string> = {
  dispatchSubtitle: "Assign & track your deliveries",
  openDashboard: "Open dashboard",
  notEnabledTitle: "Fee Free Delivery isn’t on for this store",
  notEnabledBody: "Turn it on in your dashboard to start dispatching orders to your drivers.",
  restaurantLoginCta: "Restaurant owner? Sign in with your dashboard login",
};

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "feefree-app");
const packs: Record<string, Record<string, string>> = { en };
for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith(".json"))) {
  const group = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const [loc, obj] of Object.entries(group as Record<string, any>)) packs[loc] = obj;
}

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = packs[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  for (const k of KEYS) if (typeof pack[k] !== "string") throw new Error(`${loc}: missing ${k}`);

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const ns = (json.feefreeApp ??= {});
  for (const k of KEYS) ns[k] = decode(pack[k]);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ feefreeApp (${KEYS.length}) written to ${changed} locale file(s)`);

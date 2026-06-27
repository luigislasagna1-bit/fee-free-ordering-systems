/** Fix the false "Unlimited orders" claim on the pricing page across all 38
 *  locales: freeIncludes[0] → translated "Up to 100 orders/month", and
 *  compareItems[0] → the locale's existing hero chip "0% commission on direct
 *  orders" (marketing.home.v2.hero.feat1, already translated). Run AFTER the
 *  _capfix-<code>.json translations exist. Run: npx tsx scripts/_fix-pricing-cap.ts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const MSG = join(process.cwd(), "src", "messages");
const locales = readdirSync(MSG).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const EN_CAP = "Up to 100 orders/month";

let n = 0;
for (const code of locales) {
  const p = join(MSG, `${code}.json`);
  const m = JSON.parse(readFileSync(p, "utf8")) as any;
  let cap = EN_CAP;
  if (code !== "en") {
    const f = `scripts/i18n-data/_capfix-${code}.json`;
    if (existsSync(f)) { try { const v = JSON.parse(readFileSync(f, "utf8")).value; if (typeof v === "string" && v.trim()) cap = v; } catch { /* keep en */ } }
  }
  const feat1: string = m?.marketing?.home?.v2?.hero?.feat1 || "0% commission on direct orders";
  if (Array.isArray(m?.marketing?.pricing?.freeIncludes)) m.marketing.pricing.freeIncludes[0] = cap;
  if (Array.isArray(m?.marketing?.pricing?.compareItems)) m.marketing.pricing.compareItems[0] = feat1;
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n", "utf8");
  n++;
}
console.log(`fixed pricing free-cap claim in ${n} locale files (freeIncludes[0]=cap, compareItems[0]=hero.feat1)`);

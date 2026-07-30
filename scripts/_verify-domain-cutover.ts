/** Read-only cutover verifier for a custom-domain switch (A28 and any future
 *  restaurant doing the same). Checks, for a given restaurant slug:
 *
 *    1. DB state — which domain is live / pending / previous.
 *    2. The NEW domain serves the store (HTTP 200, not a redirect off-site).
 *    3. The OLD domain permanently redirects to the new one, PATH PRESERVED.
 *    4. MX records are unchanged vs a saved baseline (email safety — the whole
 *       point of "touch only forwarding, never mail").
 *
 *  Usage:
 *    npx tsx scripts/_verify-domain-cutover.ts <slug> [--save-mx]
 *  --save-mx writes the current MX set as the baseline (run BEFORE the change).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolveMx } from "node:dns/promises";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = process.argv[2] || "luigis-lasagna-pizzeria";
const SAVE_MX = process.argv.includes("--save-mx");
const BASELINE = "scripts/i18n-data/_mx-baseline.json";
/** --mx-host=<apex> checks mail on a domain OTHER than the current store
 *  domain. Needed when the domain being MIGRATED TO is the one carrying the
 *  restaurant's email (Luigi: luigislasagna.com runs Microsoft 365, while the
 *  store currently lives on luigispizzapastawings.com). */
const MX_HOST_ARG = process.argv.find(a => a.startsWith("--mx-host="))?.split("=")[1] ?? null;

function apexOf(host: string) { return host.replace(/^www\./, ""); }

async function fetchStatus(url: string): Promise<{ status: number; location: string | null }> {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return { status: res.status, location: res.headers.get("location") };
  } catch (e: any) {
    return { status: 0, location: `ERROR ${String(e?.message).slice(0, 60)}` };
  }
}

async function main() {
  const env = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }

  let live: string | null = null, pending: string | null = null, previous: string | null = null;
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const r = await p.restaurant.findFirst({
        where: { slug: SLUG },
        select: { customDomain: true, customDomainStatus: true, pendingCustomDomain: true, previousCustomDomain: true },
      });
      if (r) {
        console.log(`DB: live=${r.customDomain} (${r.customDomainStatus}) pending=${r.pendingCustomDomain} previous=${r.previousCustomDomain}`);
        live = r.customDomain; pending = r.pendingCustomDomain; previous = r.previousCustomDomain;
      }
    } finally { await p.$disconnect(); }
  }

  // ── MX safety ────────────────────────────────────────────────────────────
  const mxHost = MX_HOST_ARG ?? apexOf(pending ?? live ?? "");
  if (mxHost) {
    let mx: string[] = [];
    try {
      mx = (await resolveMx(mxHost)).map(m => `${m.priority} ${m.exchange}`).sort();
    } catch (e: any) {
      mx = [`LOOKUP FAILED: ${String(e?.message).slice(0, 60)}`];
    }
    const store: Record<string, string[]> = existsSync(BASELINE)
      ? JSON.parse(readFileSync(BASELINE, "utf8"))
      : {};
    if (SAVE_MX) {
      // Never store a failed lookup as a baseline — it would later report a
      // false "CHANGED" the moment the lookup starts working.
      if (mx.some(m => m.startsWith("LOOKUP FAILED"))) {
        console.log(`MX baseline NOT saved for ${mxHost} — lookup failed: ${mx.join(" | ")}`);
      } else {
        store[mxHost] = mx;
        writeFileSync(BASELINE, JSON.stringify(store, null, 2) + "\n", "utf8");
        console.log(`MX baseline SAVED for ${mxHost}: ${mx.join(" | ")}`);
      }
    } else if (store[mxHost]) {
      const same = JSON.stringify(store[mxHost]) === JSON.stringify(mx);
      console.log(`MX ${mxHost}: ${same ? "✅ UNCHANGED" : "❌ CHANGED"}`);
      if (!same) {
        console.log(`   before: ${store[mxHost].join(" | ")}`);
        console.log(`   now   : ${mx.join(" | ")}`);
      }
    } else {
      console.log(`MX ${mxHost} (no baseline): ${mx.join(" | ")}`);
    }
  }

  // ── Routing ──────────────────────────────────────────────────────────────
  if (live) {
    const root = await fetchStatus(`https://${live}/`);
    // An apex → www hop (or the reverse) on the SAME registrable domain is
    // normal and healthy — only flag a redirect that leaves the domain.
    const staysOnDomain = !!root.location?.includes(apexOf(live));
    const healthy = root.status === 200 || ((root.status === 301 || root.status === 307 || root.status === 308) && staysOnDomain);
    console.log(`NEW ${live}/ → ${root.status}${root.location ? ` → ${root.location}` : ""} ${healthy ? "✅" : "⚠️"}`);
  }
  if (previous && live) {
    // Path-preserving check — a deep link (like a table QR code) must land on
    // the SAME path of the new domain, not just the homepage.
    const deep = "/order/test-path?utm=qr";
    const r1 = await fetchStatus(`https://${previous}/`);
    const r2 = await fetchStatus(`https://${previous}${deep}`);
    const ok1 = (r1.status === 301 || r1.status === 308) && !!r1.location?.includes(live);
    const ok2 = (r2.status === 301 || r2.status === 308) && !!r2.location?.includes(deep);
    console.log(`OLD ${previous}/ → ${r1.status} ${r1.location ?? ""} ${ok1 ? "✅" : "⚠️"}`);
    console.log(`OLD ${previous}${deep} → ${r2.status} ${r2.location ?? ""} ${ok2 ? "✅ path preserved" : "⚠️ path NOT preserved"}`);
  }
  if (pending) {
    const r = await fetchStatus(`https://${pending}/`);
    console.log(`PENDING ${pending}/ → ${r.status}${r.location ? ` → ${r.location}` : ""} (serves early = zero-downtime working)`);
  }
}
main();

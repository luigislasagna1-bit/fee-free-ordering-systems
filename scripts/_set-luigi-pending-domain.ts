/** A28: put www.luigislasagna.com into Luigi's pendingCustomDomain directly.
 *
 *  WHY a script instead of the UI: the first (pre-fix) connect attempt already
 *  registered the domain with Vercel, and the DB rollback that restored his
 *  live store never released that binding — so the UI's addDomain call now
 *  fails with "already in use by one of your projects". Vercel already has
 *  what it needs; only our row is missing.
 *
 *  SAFETY: writes ONLY pendingCustomDomain. customDomain (the LIVE store
 *  domain) is untouched, so the storefront cannot be affected. Cutover still
 *  requires the normal DNS-confirmed verify-custom path.
 *
 *  RESET=1 clears the pending value.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "luigis-lasagna-pizzeria";
const DOMAIN = "www.luigislasagna.com";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function main() {
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const r = await p.restaurant.findFirst({
        where: { slug: SLUG },
        select: { id: true, name: true, customDomain: true, pendingCustomDomain: true, previousCustomDomain: true },
      });
      if (!r) continue;
      console.log(`BEFORE: live=${r.customDomain} pending=${r.pendingCustomDomain} previous=${r.previousCustomDomain}`);

      if (process.env.RESET === "1") {
        const u = await p.restaurant.update({
          where: { id: r.id },
          data: { pendingCustomDomain: null, customDomainError: null },
          select: { customDomain: true, pendingCustomDomain: true },
        });
        console.log(`AFTER (reset): ${JSON.stringify(u)}`);
        continue;
      }

      // Refuse if it would somehow disturb the live domain.
      if (r.customDomain !== "luigispizzapastawings.com") {
        console.log(`REFUSING — live domain is ${r.customDomain}, expected luigispizzapastawings.com`);
        continue;
      }
      const clash = await p.restaurant.findFirst({
        where: {
          OR: [
            { customDomain: { in: [DOMAIN, "luigislasagna.com"] } },
            { pendingCustomDomain: { in: [DOMAIN, "luigislasagna.com"] } },
            { previousCustomDomain: { in: [DOMAIN, "luigislasagna.com"] } },
          ],
          NOT: { id: r.id },
        },
        select: { id: true, slug: true },
      });
      if (clash) { console.log(`REFUSING — claimed by ${clash.slug}`); continue; }

      const u = await p.restaurant.update({
        where: { id: r.id },
        data: { pendingCustomDomain: DOMAIN, customDomainError: null },
        select: { customDomain: true, customDomainStatus: true, pendingCustomDomain: true },
      });
      console.log(`AFTER : ${JSON.stringify(u)}`);
    } finally {
      await p.$disconnect();
    }
  }
}
main();

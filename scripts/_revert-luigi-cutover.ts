/** URGENT revert: put Luigi's LIVE domain back to luigispizzapastawings.com and
 *  re-park www.luigislasagna.com as pending. Used when a cutover completed but
 *  the post-cutover redirect/serving isn't healthy yet.
 *  RESTORE=1 re-applies the cutover once the issue is fixed. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "luigis-lasagna-pizzeria";
const OLD = "luigispizzapastawings.com";
const NEW = "www.luigislasagna.com";

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
        select: { id: true, customDomain: true, pendingCustomDomain: true, previousCustomDomain: true },
      });
      if (!r) continue;
      console.log(`BEFORE: live=${r.customDomain} pending=${r.pendingCustomDomain} previous=${r.previousCustomDomain}`);
      const data = process.env.RESTORE === "1"
        ? { customDomain: NEW, customDomainStatus: "verified", previousCustomDomain: OLD, pendingCustomDomain: null }
        : { customDomain: OLD, customDomainStatus: "verified", previousCustomDomain: null, pendingCustomDomain: NEW };
      const u = await p.restaurant.update({
        where: { id: r.id },
        data,
        select: { customDomain: true, customDomainStatus: true, pendingCustomDomain: true, previousCustomDomain: true },
      });
      console.log(`AFTER : ${JSON.stringify(u)}`);
    } finally {
      await p.$disconnect();
    }
  }
}
main();

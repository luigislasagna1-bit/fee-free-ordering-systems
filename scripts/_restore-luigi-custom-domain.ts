/** URGENT prod fix: connecting www.luigislasagna.com overwrote Luigi's live
 *  customDomain (luigispizzapastawings.com) → the live store 404s on its
 *  established domain. Restore the previous known-good value. Does NOT touch
 *  Vercel (both domains stay attached to the project). Prints before/after. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

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
        where: { slug: "luigis-lasagna-pizzeria" },
        select: { id: true, name: true, customDomain: true, customDomainStatus: true, customDomainError: true },
      });
      if (!r) continue;
      console.log("BEFORE:", JSON.stringify(r));
      if (r.customDomain === "luigispizzapastawings.com") {
        console.log("already restored — nothing to do");
        continue;
      }
      const upd = await p.restaurant.update({
        where: { id: r.id },
        data: { customDomain: "luigispizzapastawings.com", customDomainStatus: "verified", customDomainError: null },
        select: { customDomain: true, customDomainStatus: true },
      });
      console.log("AFTER :", JSON.stringify(upd));
    } finally {
      await p.$disconnect();
    }
  }
}
main();

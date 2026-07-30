import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const l of env.split(/\r?\n/)) { const m = l.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m && !urls.includes(m[1])) urls.push(m[1]); }
async function main() {
  const mode = process.argv[2];
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const r = await p.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, customDomain: true } });
      if (!r) continue;
      const data = mode === "set"
        ? { pendingCustomDomain: null, previousCustomDomain: "www.luigislasagna.com" }
        : { pendingCustomDomain: "www.luigislasagna.com", previousCustomDomain: null };
      const u = await p.restaurant.update({ where: { id: r.id }, data, select: { customDomain: true, pendingCustomDomain: true, previousCustomDomain: true } });
      console.log(JSON.stringify(u));
    } finally { await p.$disconnect(); }
  }
}
main();

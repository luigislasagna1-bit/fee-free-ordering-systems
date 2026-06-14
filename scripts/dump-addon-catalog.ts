/**
 * READ-ONLY: dump the AddOn catalog (slug → enabledFeatures) so we can verify
 * every purchasable add-on's feature slug is wired to a locked nav item.
 * Luigi 2026-06-14.
 *   npx tsx scripts/dump-addon-catalog.ts          # prod (commented .env.local URL)
 */
import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function resolveUrl(): string {
  const arg = process.argv[2];
  if (arg && arg !== "prod") return arg;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  dotenvConfig({ path: ".env.local" });
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error("No DATABASE_URL found in .env.local");
}

async function main() {
  const url = resolveUrl();
  console.log(`Reading from: ${url.replace(/:[^:@]+@/, ":****@")}\n`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const addOns = await prisma.addOn.findMany({
      orderBy: { displayOrder: "asc" },
      select: { slug: true, name: true, enabledFeatures: true, comingSoon: true, monthlyPriceCents: true, isActive: true },
    });
    for (const a of addOns) {
      let feats: string[] = [];
      try { feats = JSON.parse(a.enabledFeatures || "[]"); } catch {}
      const price = `$${(a.monthlyPriceCents / 100).toFixed(2)}`.padStart(8);
      console.log(`${a.slug.padEnd(22)} active=${a.isActive ? "Y" : "n"} soon=${a.comingSoon ? "Y" : "n"} ${price}  →  [${feats.join(", ")}]`);
    }
    console.log();
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

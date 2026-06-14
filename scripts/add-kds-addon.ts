/**
 * Add the "KDS Screen" add-on (Kitchen Display System) — coming soon, price TBD.
 * Locked + comingSoon for everyone until it ships (joins Branded Mobile App /
 * POS Module). Idempotent upsert by slug. Luigi 2026-06-14.
 *
 * Run against BOTH branches so dev + prod stay aligned:
 *   npx tsx scripts/add-kds-addon.ts            # prod (commented .env.local URL)
 *   npx tsx scripts/add-kds-addon.ts <dev-url>  # explicit URL (the active dev branch)
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
  console.log(`Upserting KDS Screen add-on into: ${url.replace(/:[^:@]+@/, ":****@")}`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const maxOrder = await prisma.addOn.aggregate({ _max: { displayOrder: true } });
    const order = (maxOrder._max.displayOrder ?? 0) + 1;
    const row = await prisma.addOn.upsert({
      where: { slug: "kds_screen" },
      // Re-running just re-asserts the coming-soon/locked state + feature slug;
      // it never overwrites a price you may set later in /superadmin/add-ons.
      update: {
        name: "KDS Screen",
        comingSoon: true,
        isActive: false,
        enabledFeatures: JSON.stringify(["kds_screen"]),
      },
      create: {
        slug: "kds_screen",
        name: "KDS Screen",
        description:
          "A dedicated Kitchen Display System screen for your line — orders stream in live and can be bumped per station, no paper tickets. Coming soon.",
        monthlyPriceCents: 0, // price TBD — set later in /superadmin/add-ons
        enabledFeatures: JSON.stringify(["kds_screen"]),
        comingSoon: true,
        isActive: false,
        displayOrder: order,
      },
    });
    console.log(
      `✓ KDS Screen ready: slug=${row.slug} comingSoon=${row.comingSoon} active=${row.isActive} price=$${(row.monthlyPriceCents / 100).toFixed(2)} (TBD)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

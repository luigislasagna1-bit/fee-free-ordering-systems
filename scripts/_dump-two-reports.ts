/**
 * Read-only: dump two specific reseller reports (full body + comments) plus
 * the reporting restaurant's public slug/domain so the fixes can be verified
 * on the live customer page.
 *   npx tsx scripts/run-on-prod.ts scripts/_dump-two-reports.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const IDS = ["cmr803ovq000504l28i0t104w", "cmr80t9rk000304jslfwbu6tn"];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  for (const id of IDS) {
    const r = await prisma.resellerReport.findUnique({
      where: { id },
      include: { comments: { orderBy: { createdAt: "asc" } } },
    });
    if (!r) { console.log(`\n=== ${id}: NOT FOUND ===`); continue; }
    console.log("\n══════════════════════════════════════════════════════");
    console.log(`[${r.status}] (${(r as any).type}/${(r as any).priority}) #${r.id}`);
    console.log(`TITLE: ${r.title}`);
    console.log(`BY: ${(r as any).authorName} <${(r as any).authorEmail}> • ${r.createdAt.toISOString().slice(0, 10)}`);
    console.log(`BODY:\n${(r as any).body}`);
    for (const c of r.comments) {
      console.log(`\n--- COMMENT by ${(c as any).authorName} ${c.createdAt.toISOString().slice(0, 16)} ---\n${(c as any).body}`);
    }
  }

  // The reporter's restaurants (PISU MARKETING) — public slugs for read-only verification.
  const restaurants = await prisma.restaurant.findMany({
    where: { resellerProfile: { companyName: { contains: "PISU", mode: "insensitive" } } },
    select: { name: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true },
  });
  console.log("\n=== Reporter restaurants ===");
  for (const x of restaurants) console.log(JSON.stringify(x));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

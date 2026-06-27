/**
 * READ-ONLY diagnostic: confirm the reseller de-brand gate is behaving correctly in prod.
 *
 * Mirrors isResellerDebranded() / isResellerBranded() from src/lib/white-label.ts and prints,
 * for every reseller-attached restaurant, whether the "Powered by Fee Free Ordering" credit is
 * HIDDEN — plus a sample of non-reseller restaurants (which must ALWAYS show the credit).
 *
 * Run against prod:  npx tsx scripts/run-on-prod.ts scripts/_check-reseller-debrand.ts
 * Writes nothing.
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const deb = (p: any) =>
  !!(p && p.status === "approved" && ((p.imprint && String(p.imprint).trim()) || p.brandLogoUrl));
const bra = (p: any) => !!(p && p.status === "approved" && p.whiteLabelStatus === "active");
const rname = (p: any) =>
  p?.companyName || p?.businessName || p?.name || (p ? `(reseller ${String(p.id).slice(0, 8)})` : "—");

async function main() {
  const url = process.env.DATABASE_URL as string;
  console.log("DB:", String(url).replace(/:[^:@]+@/, ":***@"), "\n");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  const resR = await prisma.restaurant.findMany({
    where: { resellerProfileId: { not: null } },
    take: 300,
    select: { name: true, slug: true, resellerProfileId: true, resellerProfile: true },
    orderBy: { name: "asc" },
  });
  console.log(`=== RESELLER-ATTACHED restaurants: ${resR.length} ===`);
  for (const r of resR as any[]) {
    const p = r.resellerProfile;
    console.log(`• ${r.name}  (slug=${r.slug})`);
    console.log(
      `    reseller="${rname(p)}"  status=${p?.status}  imprint=${
        p?.imprint && String(p.imprint).trim() ? "SET" : "—"
      }  logo=${p?.brandLogoUrl ? "SET" : "—"}  wlStatus=${p?.whiteLabelStatus ?? "—"}`
    );
    console.log(
      `    -> CREDIT ${deb(p) ? "HIDDEN  (free de-brand, EXPECTED)" : "SHOWS"}   paid-branded=${bra(p)}`
    );
  }
  console.log("");

  const nonCount = await prisma.restaurant.count({ where: { resellerProfileId: null } });
  const sample = await prisma.restaurant.findMany({
    where: { resellerProfileId: null },
    take: 12,
    select: { name: true, slug: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`=== NON-reseller restaurants: ${nonCount}  ->  CREDIT SHOWS for ALL of these ===`);
  for (const r of sample as any[]) console.log(`• ${r.name} (slug=${r.slug})`);

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

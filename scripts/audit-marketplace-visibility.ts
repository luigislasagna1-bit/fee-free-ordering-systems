/**
 * Read-only audit of which restaurants SHOULD appear on /marketplace
 * vs which ones are currently hidden by the recent published-only
 * filter. Cross-checks the public marketplace endpoint against the
 * raw DB so we can confirm task #9.
 *
 * Run: `npx tsx scripts/audit-marketplace-visibility.ts`
 */
import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// Dynamic require AFTER env is loaded — @/lib/db reads DATABASE_URL at module
// init time, so a static import would fire before our dotenv calls.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prisma = require("@/lib/db").default;

async function main() {
  const all = await prisma.restaurant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      publishedAt: true,
      marketplaceListing: {
        select: { isListed: true, billingMode: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total restaurants in DB: ${all.length}\n`);

  const shouldShow: typeof all = [];
  const blocked: Array<{ r: (typeof all)[number]; reason: string }> = [];

  for (const r of all) {
    const reasons: string[] = [];
    if (!r.isActive) reasons.push("isActive=false");
    if (!r.publishedAt) reasons.push("publishedAt=null");
    if (!r.marketplaceListing) reasons.push("no marketplaceListing");
    else if (!r.marketplaceListing.isListed) reasons.push("listing.isListed=false");

    if (reasons.length === 0) shouldShow.push(r);
    else blocked.push({ r, reason: reasons.join(", ") });
  }

  console.log(`SHOULD APPEAR on /marketplace (${shouldShow.length}):`);
  for (const r of shouldShow) {
    console.log(`  ${r.slug.padEnd(40)} (${r.name})`);
  }

  console.log(`\nBLOCKED from /marketplace (${blocked.length}):`);
  for (const { r, reason } of blocked) {
    console.log(`  ${r.slug.padEnd(40)} (${r.name}) — ${reason}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

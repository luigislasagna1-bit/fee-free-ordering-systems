/**
 * Read-only check: what's the subdomain field for Luigi's Lasagna?
 * Used to figure out which <slug>.feefreeordering.com URL to probe.
 */
import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const prisma = require("@/lib/db").default;

async function main() {
  const slug = process.argv[2] || "luigis-lasagna-pizzeria";
  const r = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true, publishedAt: true, isActive: true },
  });
  if (!r) {
    console.log(`No restaurant with slug "${slug}"`);
    return;
  }
  console.log(`Restaurant: ${r.name}`);
  console.log(`  id:                 ${r.id}`);
  console.log(`  slug:               ${r.slug}`);
  console.log(`  subdomain:          ${r.subdomain ?? "(not set — defaults to slug)"}`);
  console.log(`  customDomain:       ${r.customDomain ?? "(none)"} (status: ${r.customDomainStatus})`);
  console.log(`  isActive:           ${r.isActive}`);
  console.log(`  publishedAt:        ${r.publishedAt?.toISOString() ?? "(unpublished)"}`);
  console.log("");
  const effectiveSub = r.subdomain ?? r.slug;
  console.log(`Effective subdomain URL: https://${effectiveSub}.feefreeordering.com`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

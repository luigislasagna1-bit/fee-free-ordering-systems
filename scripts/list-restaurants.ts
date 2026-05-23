/** Read-only: list all restaurants with their slug/subdomain/customDomain. */
import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prisma = require("@/lib/db").default;

async function main() {
  const rs = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, subdomain: true, customDomain: true, isActive: true, publishedAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${rs.length} restaurants:\n`);
  for (const r of rs) {
    const flags = [r.isActive ? "active" : "paused", r.publishedAt ? "published" : "unpublished"].join("/");
    console.log(`  [${flags}]  ${r.slug}`);
    console.log(`    name:         ${r.name}`);
    console.log(`    subdomain:    ${r.subdomain ?? "(null)"}`);
    console.log(`    customDomain: ${r.customDomain ?? "(none)"}`);
    console.log("");
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

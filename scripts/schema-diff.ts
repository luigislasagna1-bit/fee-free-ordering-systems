/**
 * Lists every column on every public table in the DB, so we can compare
 * against what prisma/schema.prisma expects.
 *
 * Usage:
 *   npx tsx scripts/schema-diff.ts <db-url>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.argv[2];
if (!url) { console.error("Usage: npx tsx scripts/schema-diff.ts <db-url>"); process.exit(1); }

async function main() {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log("Tables that interest the User.findUnique include:\n");

  for (const table of ["User", "Restaurant", "ResellerProfile"]) {
    const cols: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${table}'
      ORDER BY ordinal_position
    `);
    console.log(`${table}: ${cols.length} columns`);
    for (const c of cols) {
      console.log(`   ${c.column_name.padEnd(30)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`);
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

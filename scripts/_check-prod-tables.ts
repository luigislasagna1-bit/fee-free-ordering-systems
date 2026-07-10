/** READ-ONLY: confirm the prod schema delta before pushing OrderDispute. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" });
config({ path: ".env" });
async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  const names = rows.map((r) => r.table_name);
  console.log(`prod public tables: ${names.length}`);
  console.log(`OrderDispute present: ${names.includes("OrderDispute") ? "YES" : "NO (push will add it)"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message?.slice(0, 200)); process.exit(1); });

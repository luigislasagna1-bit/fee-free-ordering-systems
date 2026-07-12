/** READ-ONLY: newest AdminAuditLog rows (Team feature verification). */
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
  const rows = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  for (const r of rows) {
    console.log(`${r.createdAt.toISOString()} ${r.action.padEnd(18)} actor=${r.actorEmail} entity=${r.entity} detail=${JSON.stringify(r.detail)}`);
  }
  if (rows.length === 0) console.log("(no audit rows)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

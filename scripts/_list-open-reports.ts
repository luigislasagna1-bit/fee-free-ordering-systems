/** List all reseller reports not yet FIXED/CLOSED (run on prod via run-on-prod). */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const all = await prisma.resellerReport.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, type: true, createdAt: true, authorEmail: true },
    take: 50,
  });
  for (const r of all) {
    console.log(`${r.status.padEnd(12)} ${r.id.slice(0, 9)} [${r.type}] ${r.title.slice(0, 70)} (${r.createdAt.toISOString().slice(0, 10)})`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Read-only: list the last comments on cms0idtz7 to spot duplicate replies. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" }); config({ path: ".env" });
async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const comments = await p.resellerReportComment.findMany({
    where: { reportId: "cms0idtz700000akts24hra1g" },
    orderBy: { createdAt: "asc" },
    select: { id: true, authorName: true, createdAt: true, body: true },
  });
  for (const c of comments) {
    console.log(`${c.id}  ${c.authorName}  ${c.createdAt.toISOString()}  ${c.body.slice(0, 60).replace(/\n/g, " ")}`);
  }
}
main();

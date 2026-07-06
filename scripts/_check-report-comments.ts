/* Read-only: list the latest comments on cmr1ty0lc to confirm the addendum posted. */
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
  try {
    const comments = await prisma.resellerReportComment.findMany({
      where: { reportId: "cmr1ty0lc000004lgc9okgwgz" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { createdAt: true, authorName: true, body: true },
    });
    for (const c of comments) console.log(`\n===== [${c.createdAt.toISOString()}] ${c.authorName} =====\n${c.body}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

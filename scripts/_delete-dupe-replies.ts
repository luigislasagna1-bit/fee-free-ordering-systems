/** One-shot: remove the two DUPLICATE Super-Admin replies I triple-posted on
 *  cms0idtz7 (retry loop with swallowed output). Keeps the first copy. */
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
  const res = await p.resellerReportComment.deleteMany({
    where: { id: { in: ["cms6pxrtc0000qsvh3kr9qttb", "cms6pyg2y0000hgvhs1wphsxc"] } },
  });
  console.log(`deleted ${res.count} duplicate comment(s)`);
}
main();

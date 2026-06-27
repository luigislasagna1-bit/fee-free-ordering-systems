/** READ-ONLY: dump the 13 old FIXED reports that lack a reply (title + body + reporter).
 *    npx tsx scripts/run-on-prod.ts scripts/_dump-13-reports.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const IDS = [
  "cmqfjcnf9000p04l5hxmn0390", "cmq3knaqj000d04l8asrxw4h7", "cmq3k0m4d001104l2hgoml7t5",
  "cmpy91b64000004lgr31vi71b", "cmpxet3oy001704kvoqnr8qsi", "cmpxeqj5p001c04jot2v3sxch",
  "cmpxeomsa001804jo7b13qpco", "cmpxekkro001104kvi585qukw", "cmpxeh56g000x04kv19kxeibu",
  "cmpxe5fd2000q04joh3gs6f5h", "cmpxe23kj000o04jo3khvc3kf", "cmpxcpyed000304l9gkuuj4f9",
  "cmpxbvfn1000j04jos776pw6o",
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const reports = await prisma.resellerReport.findMany({ where: { id: { in: IDS } } });
  for (const r of reports) {
    const reporter = (r as any).reportedByName || (r as any).authorName || "?";
    console.log(`\n#### ${r.id}\nTITLE: ${r.title}\nBY: ${reporter}\nTYPE: ${r.type}\nBODY: ${(r.body || "").replace(/\s+/g, " ").trim()}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

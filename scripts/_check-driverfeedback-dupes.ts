/** READ-ONLY pre-check for the v1.1 Phase 2 `@@unique([assignmentId, source])`
 *  constraint on DriverFeedback: group rows by (assignmentId, source) where
 *  assignmentId is not null and report any groups with count > 1. If any groups
 *  print, the unique constraint push would fail on that database and the dupes
 *  must be triaged first. No writes of any kind. */
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
  const p = new PrismaClient({ adapter } as any);

  const total = await p.driverFeedback.count();
  const withAssignment = await p.driverFeedback.count({ where: { assignmentId: { not: null } } });

  const groups = await p.driverFeedback.groupBy({
    by: ["assignmentId", "source"],
    where: { assignmentId: { not: null } },
    _count: { _all: true },
  });
  const dupes = groups.filter((g) => g._count._all > 1);

  console.log(`DriverFeedback rows: ${total} total, ${withAssignment} with a non-null assignmentId`);
  console.log(`Distinct (assignmentId, source) groups: ${groups.length}`);
  if (dupes.length === 0) {
    console.log("Duplicate (assignmentId, source) groups: 0 — the unique constraint is safe to apply.");
  } else {
    console.log(`Duplicate (assignmentId, source) groups: ${dupes.length} — MUST be triaged before the push:`);
    for (const g of dupes) {
      console.log(`  assignmentId=${g.assignmentId}  source=${g.source}  count=${g._count._all}`);
    }
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

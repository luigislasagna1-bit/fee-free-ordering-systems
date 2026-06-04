/**
 * READ-ONLY: list reseller reports (bug/feature tracker) from the target DB.
 *   npx tsx scripts/run-on-prod.ts scripts/list-reseller-reports.ts
 * Add --set-in-progress=<id> to flip ONE report to IN_PROGRESS (used after a
 * fix ships). Never touches FIXED (human-gated).
 */
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

  const setArg = process.argv.find((a) => a.startsWith("--set-in-progress="));
  if (setArg) {
    const id = setArg.split("=")[1];
    const cur = await prisma.resellerReport.findUnique({ where: { id }, select: { status: true, title: true } });
    if (!cur) { console.log("No report with id", id); }
    else if (cur.status === "FIXED") { console.log("Refusing: report is FIXED (human-gated):", cur.title); }
    else {
      await prisma.resellerReport.update({ where: { id }, data: { status: "IN_PROGRESS" } });
      console.log(`✅ ${id} → IN_PROGRESS  (${cur.title})`);
    }
    await prisma.$disconnect();
    return;
  }

  const reports = await prisma.resellerReport.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, title: true, type: true, status: true, priority: true,
      body: true, imageUrls: true, createdAt: true,
      reportedByName: true, authorName: true,
    },
  });
  console.log(`\n=== ${reports.length} reseller reports ===\n`);
  for (const r of reports) {
    let imgs = 0;
    try { const a = JSON.parse(r.imageUrls || "[]"); imgs = Array.isArray(a) ? a.length : 0; } catch {}
    console.log(`[${r.status}] (${r.type}/${r.priority}) ${r.title}`);
    console.log(`   id=${r.id}  by=${r.reportedByName || r.authorName || "?"}  imgs=${imgs}  ${r.createdAt.toISOString().slice(0,10)}`);
    const desc = (r.body || "").replace(/\s+/g, " ").trim();
    if (desc) console.log(`   ${desc.slice(0, 240)}${desc.length > 240 ? "…" : ""}`);
    console.log("");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

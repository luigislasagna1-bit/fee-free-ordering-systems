/** Read-only: dump Fabrizio's iOS reseller report (body + AI analysis + comments
 *  + attachment URLs) for analysis. Prints, changes nothing. */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  // Find Fabrizio's iOS report — most recent report by an author matching
  // "fabrizio" whose title/body mentions ios/app.
  const candidates = await prisma.resellerReport.findMany({
    where: {
      OR: [
        { authorName: { contains: "abriz", mode: "insensitive" } },
        { authorEmail: { contains: "abriz", mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, type: true, status: true, priority: true, authorName: true, updatedAt: true },
  });
  console.log(`Fabrizio reports (${candidates.length}):`);
  for (const c of candidates) console.log(`  [${c.status}] ${c.type}  "${c.title}"  (${c.id}, upd ${c.updatedAt.toISOString().slice(0, 10)})`);

  const ios = candidates.find((c) => /ios|iphone|ipad|app/i.test(c.title)) ?? candidates[0];
  if (!ios) { console.log("\nNo report found."); await prisma.$disconnect(); return; }

  const r = await prisma.resellerReport.findUnique({
    where: { id: ios.id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!r) { await prisma.$disconnect(); return; }

  console.log("\n================ REPORT ================");
  console.log(`id: ${r.id}\ntitle: ${r.title}\ntype: ${r.type} | status: ${r.status} | priority: ${r.priority}`);
  console.log(`author: ${r.authorName} <${r.authorEmail}>  filed ${r.createdAt.toISOString()}`);
  const imgs = safeArr(r.imageUrls);
  console.log(`\nattachments (${imgs.length}):`);
  for (const u of imgs) console.log("  " + u);
  console.log("\n---- BODY ----\n" + r.body);
  console.log("\n---- SYSTEM AI ANALYSIS ----\n" + (r.aiAnalysis || "(none generated)"));
  console.log(`\n---- COMMENTS (${r.comments.length}) ----`);
  for (const c of r.comments) {
    const ci = safeArr(c.imageUrls);
    console.log(`\n[${c.createdAt.toISOString()}] ${c.authorName} <${c.authorEmail}>${ci.length ? `  (${ci.length} attachment(s))` : ""}`);
    console.log(c.body);
    for (const u of ci) console.log("  attach: " + u);
  }
  console.log("\n================ END ================");
  await prisma.$disconnect();
}

function safeArr(s: string | null): string[] {
  if (!s) return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * READ-ONLY: full body + screenshots + comments of one reseller report.
 *   npx tsx scripts/run-on-prod.ts scripts/_read-report.ts <reportId>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("pass a reportId");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.resellerReport.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!r) { console.log("not found"); return; }

  console.log(`TITLE: ${r.title}`);
  console.log(`STATUS: ${r.status} | TYPE: ${r.type} | PRIORITY: ${r.priority}`);
  console.log(`AUTHOR: ${r.authorName} <${r.authorEmail}>  created=${r.createdAt.toISOString()}`);
  console.log(`\n--- BODY ---\n${r.body}`);
  const imgs = (() => { try { return JSON.parse(r.imageUrls ?? "[]"); } catch { return []; } })();
  console.log(`\n--- SCREENSHOTS (${imgs.length}) ---`);
  for (const u of imgs) console.log(`  ${u}`);
  console.log(`\n--- COMMENTS (${r.comments.length}) ---`);
  for (const c of r.comments) {
    const cimgs = (() => { try { return JSON.parse(c.imageUrls ?? "[]"); } catch { return []; } })();
    console.log(`\n[${c.createdAt.toISOString()}] ${c.authorName} <${c.authorEmail}>${cimgs.length ? ` (${cimgs.length} img)` : ""}:\n${c.body}`);
    for (const u of cimgs) console.log(`  img: ${u}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

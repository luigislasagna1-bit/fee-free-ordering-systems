/** READ-ONLY: print attachment image URLs for the given reseller reports
 *  (report body images + every comment's images, with author + timestamp). */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const IDS = [
  "cmrj664ru001504jl9gyrovfz", // Display issues
  "cmrldhwep00000ahurwghiksj", // Visual improvements (kitchen app)
  "cmrmbgtd1000604jmzlnup0ve", // Night Mode
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  for (const id of IDS) {
    const r = await p.resellerReport.findUnique({
      where: { id },
      select: { id: true, title: true, imageUrls: true, comments: { orderBy: { createdAt: "asc" }, select: { authorName: true, createdAt: true, imageUrls: true } } },
    });
    if (!r) { console.log(`${id}: NOT FOUND`); continue; }
    console.log(`\n== ${r.title} (${r.id})`);
    const parse = (s: string | null) => { try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; } };
    for (const u of parse(r.imageUrls)) console.log(`  [BODY] ${u}`);
    for (const c of r.comments) {
      for (const u of parse(c.imageUrls)) console.log(`  [${c.createdAt.toISOString().slice(0, 16)} ${c.authorName}] ${u}`);
    }
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

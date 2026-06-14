/**
 * READ-ONLY: dump NEW reseller reports with full detail (body, screenshots,
 * comments + their screenshots, AI analysis, upvotes) so we can plan fixes
 * precisely. Lists every image URL at the end for downloading + viewing.
 * Luigi 2026-06-14.
 *   npx tsx scripts/dump-new-reports.ts        # prod (commented .env.local URL)
 */
import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function resolveUrl(): string {
  const arg = process.argv[2];
  if (arg && arg !== "prod") return arg;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  dotenvConfig({ path: ".env.local" });
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error("No DATABASE_URL found in .env.local");
}

function parseImgs(s: string | null | undefined): string[] {
  if (!s || s === "[]") return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}

async function main() {
  const url = resolveUrl();
  console.log(`Reading from: ${url.replace(/:[^:@]+@/, ":****@")}`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const reports = await prisma.resellerReport.findMany({
      where: { status: "NEW" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: {
        comments: { orderBy: { createdAt: "asc" } },
        _count: { select: { upvotes: true } },
      },
    });
    console.log(`\n===== ${reports.length} NEW reports =====\n`);
    const allImages: string[] = [];
    for (const r of reports) {
      console.log("================================================================");
      console.log(`[${r.status}] ${r.type} / ${r.priority} / upvotes=${(r as any)._count.upvotes} / #${r.id}`);
      console.log(`TITLE: ${r.title}`);
      console.log(`BY: ${r.authorName} <${r.authorEmail}>  ${r.createdAt.toISOString().slice(0, 10)}`);
      console.log(`BODY:\n${r.body}`);
      const imgs = parseImgs(r.imageUrls);
      if (imgs.length) {
        console.log(`SCREENSHOTS (${imgs.length}):`);
        imgs.forEach((u) => { console.log(`  ${u}`); allImages.push(u); });
      }
      if (r.aiAnalysis) console.log(`AI-ANALYSIS:\n${r.aiAnalysis}`);
      if (r.comments.length) {
        console.log(`COMMENTS (${r.comments.length}):`);
        for (const c of r.comments) {
          console.log(`  - ${c.authorName} ${c.createdAt.toISOString().slice(0, 16)}: ${c.body}`);
          parseImgs(c.imageUrls).forEach((u) => { console.log(`      [comment img] ${u}`); allImages.push(u); });
        }
      }
      console.log("");
    }
    console.log(`\n===== ALL ${allImages.length} IMAGE URLS =====`);
    allImages.forEach((u) => console.log(u));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

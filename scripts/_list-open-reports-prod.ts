/** Read-only: open reports against EVERY DATABASE_URL in .env.local (active dev + commented prod),
 *  so we can spot unanswered Fabrizio follow-ups regardless of which branch is active. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function listFor(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@").slice(0, 80);
  console.log(`\n########## DB: ${masked}`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  try {
    const reports = await p.resellerReport.findMany({
      where: { status: { not: "FIXED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, status: true, updatedAt: true, authorName: true,
        comments: { orderBy: { createdAt: "asc" }, select: { authorName: true, createdAt: true, body: true } },
      },
    });
    for (const r of reports) {
      console.log(`\n=== [${r.status}] "${r.title}" (${r.id.slice(0, 9)}) upd ${r.updatedAt.toISOString()}`);
      for (const c of r.comments) {
        const who = c.authorName?.toUpperCase().includes("ADMIN") ? "US " : "FAB";
        console.log(`  ${who} ${c.createdAt.toISOString().slice(0, 16)}  ${c.body.slice(0, 110).replace(/\n/g, " ")}`);
      }
    }
    console.log(`\n${reports.length} non-FIXED report(s).`);
  } finally {
    await p.$disconnect();
  }
}

async function main() {
  for (const u of urls) {
    try { await listFor(u); } catch (e: any) { console.log(`  ERROR: ${String(e?.message).slice(0, 200)}`); }
  }
}
main();

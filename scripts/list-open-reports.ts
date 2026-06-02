/**
 * List open reseller reports as JSON — the input for triage (Phase 2).
 *
 * "Open" = NEW, IN_PROGRESS, or IN_TESTING (Fixed / Won't Fix are
 * excluded). Prints enough per report for Claude to triage: de-dupe
 * against siblings, classify, and locate the likely root-cause area in
 * the codebase. Read-only — never writes.
 *
 * Usage (against prod):
 *   npx tsx scripts/run-on-prod.ts scripts/list-open-reports.ts
 * Or locally / explicit DB:
 *   npx tsx scripts/list-open-reports.ts [database-url]
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL — pass it as an arg or set it in .env.local / .env");
  process.exit(1);
}

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const reports = await prisma.resellerReport.findMany({
      where: { status: { in: ["NEW", "IN_PROGRESS", "IN_TESTING"] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, title: true, body: true, type: true, status: true, priority: true,
        authorName: true, authorEmail: true, reportedByName: true, reportedByEmail: true,
        createdAt: true,
        _count: { select: { comments: true, upvotes: true, verifications: true } },
      },
    });

    const out = reports.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      priority: r.priority,
      reporter: r.reportedByName ?? r.authorName,
      reporterEmail: r.reportedByEmail ?? r.authorEmail,
      createdAt: r.createdAt.toISOString(),
      comments: r._count.comments,
      upvotes: r._count.upvotes,
      verifications: r._count.verifications,
      // Truncate body so the JSON stays readable; full text is on the page.
      body: r.body.length > 4000 ? r.body.slice(0, 4000) + "…[truncated]" : r.body,
    }));

    console.log(JSON.stringify({ count: out.length, reports: out }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

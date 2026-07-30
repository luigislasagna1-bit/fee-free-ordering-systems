/** Read-only: dump specific reseller reports by id — body, attachments,
 *  comments (with attachments), activity — so the full thread is visible. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error("usage: _dump-reports-by-id.ts <id> [id...]"); process.exit(1); }
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  for (const id of ids) {
    const r = await p.resellerReport.findUnique({
      where: { id },
      include: {
        comments: { orderBy: { createdAt: "asc" } },
        activity: { orderBy: { createdAt: "asc" } },
      },
    });
    console.log("================================================");
    if (!r) { console.log(`NOT FOUND: ${id}`); continue; }
    console.log(`[${r.status} · ${r.priority}] ${r.type} — "${r.title}"`);
    console.log(`id ${r.id} · author ${r.authorName} <${r.authorEmail}> · created ${r.createdAt.toISOString()} · updated ${r.updatedAt.toISOString()}`);
    if (r.reportedByName) console.log(`reported by: ${r.reportedByName} <${r.reportedByEmail}>`);
    console.log(`report attachments: ${r.imageUrls ?? "(none)"}`);
    console.log("--- BODY ---\n" + r.body);
    console.log(`--- COMMENTS (${r.comments.length}) ---`);
    for (const c of r.comments) {
      console.log(`\n  [${c.createdAt.toISOString().slice(0, 16)}] ${c.authorName} <${c.authorEmail}>:`);
      console.log("  " + c.body.split("\n").join("\n  "));
      if (c.imageUrls && c.imageUrls !== "[]") console.log(`  attachments: ${c.imageUrls}`);
    }
    console.log(`--- ACTIVITY (${r.activity.length}) ---`);
    for (const a of r.activity) console.log(`  [${a.createdAt.toISOString().slice(0, 16)}] ${a.actorName}: ${a.kind}${a.detail ? " " + a.detail : ""}`);
    console.log();
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

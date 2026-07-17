/**
 * One-off: replace the arg-mangled comment on report cmrldhwep00000ahurwghiksj
 * (shell concatenation in run-on-prod ate everything after the first em-dash,
 * leaving author "—", body "Fixed"). Deletes the junk comment and posts the
 * intended reply with the body HARDCODED — no CLI args to mangle.
 *   npx tsx scripts/run-on-prod.ts scripts/_reply-cmrldhwep-0000.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const REPORT_ID = "cmrldhwep00000ahurwghiksj";
const BAD_COMMENT_ID = "cmro6t2y80000c4vh6fste765";

const BODY = `Fixed — good catch, and it was a leftover of our own dedup fix.

WHY IT HAPPENED: when we removed the duplicate countdown, we kept a fallback rule — the small chip under the service icon only appears when the right side shows no time. A DONE order hides its right-side timer, so the fallback wrongly brought back the frozen 00:00 under the icon the moment the order was marked complete.

WHAT CHANGED: finished tiles (DONE, cancelled, rejected) now show no time chip at all — a completed order doesn't need a countdown anywhere. Live orders are untouched: an active order past its promised time still shows the quiet 00:00 on the right in "In Progress", exactly as before.

PLEASE RE-TEST: let an order's countdown reach 00:00, mark it DONE, and check the tile — it should show only the DONE badge, with nothing under the Takeaway/Delivery icon. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const bad = await prisma.resellerReportComment.findUnique({ where: { id: BAD_COMMENT_ID }, select: { id: true, body: true, authorName: true } });
  if (bad) {
    console.log(`deleting junk comment (${bad.authorName}: "${bad.body.slice(0, 30)}")`);
    await prisma.resellerReportComment.delete({ where: { id: BAD_COMMENT_ID } });
  } else {
    console.log("junk comment not found (already deleted?)");
  }

  const comment = await prisma.resellerReportComment.create({
    data: { reportId: REPORT_ID, authorEmail: "admin@feefreeordering.com", authorName: "Super Admin", body: BODY },
    select: { id: true },
  });
  await prisma.resellerReport.update({ where: { id: REPORT_ID }, data: { updatedAt: new Date() } });
  console.log(`✅ proper reply posted (${comment.id})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

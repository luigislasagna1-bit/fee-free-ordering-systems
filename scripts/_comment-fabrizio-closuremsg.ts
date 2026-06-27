/** Follow-up reply on Fabrizio's "Closing days / closed services" report — per-service
 *  closure custom-message now shows. Keeps status IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-closuremsg.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqp8l948000004kys6m8xktn";

const COMMENT = `Follow-up — the last item you raised here is fixed too. When you set a custom customer message on a PER-SERVICE extraordinary closure (e.g. pickup closed 4–8pm, or special hours for a single service), that message now appears in the amber banner on the ordering page, next to the closure notice. Before, the message only showed for a FULL (all-services) closure, so a note on a single-service "closed hours" / special-hours window was dropped. Live now — please set a per-service closing/special-hours window WITH a custom message and confirm the message shows on the ordering page.`;

const NOTIF_BODY = "Fixed the last item: a custom customer message on a PER-SERVICE extraordinary closure (e.g. pickup closed 4–8pm) now shows in the ordering-page banner — before, only full-closure messages appeared. Live now; please re-test with a per-service window + a note.";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const prev = report.status;
  await prisma.$transaction(async (tx) => {
    if (prev !== "IN_TESTING") {
      await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
      await tx.resellerReportActivity.create({ data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` } });
    }
    await tx.resellerReportComment.create({ data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT } });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients)
      await tx.resellerNotification.create({ data: { recipientEmail: email, kind: "report_comment", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME } });
  });
  console.log(`✅ "${report.title}": comment posted (status ${prev === "IN_TESTING" ? "stays" : "→"} IN_TESTING)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

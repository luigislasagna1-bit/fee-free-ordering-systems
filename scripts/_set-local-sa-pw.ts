/** DEV-only: set a known password on the LOCAL superadmin so browser E2E can
 *  log in through the real flow. Refuses prod. Also prints how many reports
 *  currently carry the NEW badge for that viewer (drives the Mark-all-read
 *  button visibility). */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const EMAIL = "admin@feefreeordering.com";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, role: true } });
  if (!u || u.role !== "superadmin") throw new Error(`no local superadmin ${EMAIL}`);
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await bcrypt.hash("Verify123!", 12), emailVerifiedAt: new Date(), lockedUntil: null, failedLoginCount: 0 },
  });

  const [reports, seen] = await Promise.all([
    prisma.resellerReport.findMany({ select: { id: true, updatedAt: true } }),
    prisma.resellerReportSeen.findMany({ where: { viewerEmail: EMAIL }, select: { reportId: true, seenAt: true } }),
  ]);
  const seenMap = new Map(seen.map((s) => [s.reportId, s.seenAt.getTime()]));
  const unread = reports.filter((r) => {
    const s = seenMap.get(r.id);
    return s === undefined || r.updatedAt.getTime() > s;
  }).length;
  console.log(`✓ ${EMAIL} pw=Verify123! | reports=${reports.length} | NEW-for-viewer=${unread}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

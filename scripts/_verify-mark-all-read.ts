/** DEV-only E2E for markAllReportsSeen (the "Mark all read" button):
 *  1. creates 2 throwaway reports + 1 pre-existing stale seen row
 *  2. asserts the viewer's NEW math (updatedAt > seenAt, or no row) flags both
 *  3. runs markAllReportsSeen → asserts 0 NEW remain (rows created + bumped)
 *  4. bumps one report's updatedAt → asserts exactly that one is NEW again
 *  5. cleans up everything it created. Also prints local superadmin emails
 *     so the browser check can log in. Never touches prod. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { createRequire } from "module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The lib imports the Next-only marker "server-only", which doesn't resolve
// under tsx. Reroute just that specifier to an empty module.
const req = createRequire(import.meta.url);
const Module = req("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return req.resolve("./_noop.cjs");
  return origResolve.call(this, request, ...rest);
};

const VIEWER = "verify-mark-all@test.local";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

  const mk = (n: number) =>
    prisma.resellerReport.create({
      data: {
        title: `_verify-mark-all-read throwaway ${n}`,
        body: "throwaway — created and deleted by scripts/_verify-mark-all-read.ts",
        type: "BUG",
        authorEmail: VIEWER,
        authorName: "Verify Script",
      },
      select: { id: true, updatedAt: true },
    });

  // The page's isNew rule, verbatim (page.tsx): no row → NEW; updatedAt > seenAt → NEW.
  const newIds = async () => {
    const [reports, seen] = await Promise.all([
      prisma.resellerReport.findMany({ select: { id: true, updatedAt: true } }),
      prisma.resellerReportSeen.findMany({ where: { viewerEmail: VIEWER }, select: { reportId: true, seenAt: true } }),
    ]);
    const seenMap = new Map(seen.map((s) => [s.reportId, s.seenAt.getTime()]));
    return reports.filter((r) => {
      const s = seenMap.get(r.id);
      return s === undefined || r.updatedAt.getTime() > s;
    }).map((r) => r.id);
  };

  let pass = true;
  const check = (label: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) pass = false;
  };

  const [r1, r2] = [await mk(1), await mk(2)];
  try {
    // Stale seen row on r1 (older than its updatedAt) — the "opened it last week,
    // new comment since" case. r2 has no row at all — the "never opened" case.
    await prisma.resellerReportSeen.create({
      data: { reportId: r1.id, viewerEmail: VIEWER, seenAt: new Date(Date.now() - 86_400_000) },
    });

    let ids = await newIds();
    check("before: both throwaways NEW for viewer", ids.includes(r1.id) && ids.includes(r2.id));
    const beforeTotal = ids.length;

    const { markAllReportsSeen } = await import("../src/lib/reseller-reports-workflow");
    const marked = await markAllReportsSeen(VIEWER);
    check(`markAllReportsSeen returned full report count`, marked >= 2, `marked=${marked}`);

    ids = await newIds();
    check(`after: ZERO reports NEW for viewer (was ${beforeTotal})`, ids.length === 0, ids.length ? `still new: ${ids.join(",")}` : "");

    // New activity AFTER mark-all must re-flag exactly that report. Stamp
    // updatedAt the way real activity does — "now", never a future time.
    await prisma.resellerReport.update({ where: { id: r2.id }, data: { updatedAt: new Date() } });
    ids = await newIds();
    check("new activity re-flags only the touched report", ids.length === 1 && ids[0] === r2.id, `new: ${ids.join(",") || "(none)"}`);

    // Idempotence: second run still ends at zero. Tiny wait so seenAt lands
    // strictly after the activity bump (the page rule is strict >).
    await new Promise((r) => setTimeout(r, 50));
    await markAllReportsSeen(VIEWER);
    ids = await newIds();
    check("second mark-all clears it again (idempotent)", ids.length === 0);
  } finally {
    // Cascade on ResellerReportSeen.report removes the seen rows with the reports.
    await prisma.resellerReport.deleteMany({ where: { id: { in: [r1.id, r2.id] } } });
    await prisma.resellerReportSeen.deleteMany({ where: { viewerEmail: VIEWER } });
  }

  const sas = await prisma.user.findMany({ where: { role: "superadmin" }, select: { email: true } });
  console.log(`\n  local superadmin logins: ${sas.map((s) => s.email).join(", ") || "(none)"}`);
  console.log(pass ? "\nALL CHECKS PASSED" : "\nFAILURES — see above");
  await prisma.$disconnect();
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

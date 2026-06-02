/**
 * POST /api/reseller-reports/[id]/ship-fix — SUPERADMIN ONLY.
 *
 * Marks a report's fix as shipped: moves it to IN_TESTING, drops a
 * comment, and emails the reporter + upvoters asking them to verify on
 * the live site. The actual close to FIXED still requires human
 * verification (reseller quorum or a manual superadmin close) — this
 * endpoint never sets FIXED. See src/lib/reseller-reports-workflow.ts.
 *
 * Body (optional): { version?: string, note?: string }
 *   version — e.g. a build tag or short SHA, shown in the comment/email.
 *   note    — a sentence to the reporter ("try a hard refresh first").
 */
import { NextRequest, NextResponse } from "next/server";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { markFixShipped } from "@/lib/reseller-reports-workflow";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canChangeStatus) {
    return NextResponse.json({ error: "Only superadmin can ship a fix" }, { status: 403 });
  }
  const { id } = await params;

  let body: { version?: string; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — version/note are optional.
  }

  const result = await markFixShipped(id, {
    actorEmail: access.email,
    actorName: access.name,
    version: typeof body.version === "string" ? body.version.trim().slice(0, 60) : null,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: `Cannot ship fix — report is ${result.reason}` }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status: "IN_TESTING", notified: result.notified });
}

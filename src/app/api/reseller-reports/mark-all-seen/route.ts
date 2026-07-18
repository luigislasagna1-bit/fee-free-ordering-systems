/**
 * POST /api/reseller-reports/mark-all-seen — clear the viewer's NEW badge on
 * every report at once (the "Mark all read" button on the list page).
 *
 * Scoped strictly to the CALLER's own seen-markers — there is no way to pass
 * someone else's email; the viewer identity always comes from the session via
 * getReportAccess(). Idempotent: a second POST just re-bumps seenAt.
 * Luigi 2026-07-18.
 */
import { NextResponse } from "next/server";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { markAllReportsSeen } from "@/lib/reseller-reports-workflow";

export async function POST() {
  const access = await getReportAccess();
  if (!access.canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const marked = await markAllReportsSeen(access.email);
  return NextResponse.json({ ok: true, marked });
}

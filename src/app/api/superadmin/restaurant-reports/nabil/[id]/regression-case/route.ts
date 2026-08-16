import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { buildRegressionScenarioForCall, regressionScenarioResponse } from "@/lib/voice/regression-case-download";

/**
 * GET /api/superadmin/restaurant-reports/nabil/[id]/regression-case
 * The reported call as a sim Scenario JSON — "work on the fix together":
 * drop it under src/lib/voice/sim/scenarios/regressions and it runs in the
 * release gate. Same builder as the restaurant's own download.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const report = await prisma.voiceCallReport.findUnique({ where: { id }, select: { callId: true } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const built = await buildRegressionScenarioForCall(report.callId);
  if (!built) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return regressionScenarioResponse(built.call.id, built.scenario);
}

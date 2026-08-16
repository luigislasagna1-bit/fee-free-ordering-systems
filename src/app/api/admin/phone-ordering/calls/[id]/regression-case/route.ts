import { NextRequest, NextResponse } from "next/server";
import { requirePhoneOrderingAdmin } from "../../../guard";
import { buildRegressionScenarioForCall, regressionScenarioResponse } from "@/lib/voice/regression-case-download";

/**
 * GET /api/admin/phone-ordering/calls/[id]/regression-case
 *
 * "Turn this call into a regression case": downloads a sim Scenario JSON
 * (src/lib/voice/sim/scenario-types.ts) built from this call's event log —
 * the caller's real turns as the script, and the placed Order (or, failing
 * that, the last cart event) as the expected cart. Owner-authenticated and
 * scoped by the session's restaurantId — a call id alone is never trusted.
 * The file is meant to be reviewed and dropped under sim/scenarios/regressions.
 * The DB half lives in src/lib/voice/regression-case-download.ts, shared with
 * the superadmin route behind a restaurant's call report.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const { id } = await params;
  const built = await buildRegressionScenarioForCall(id, gate.restaurantId);
  if (!built) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return regressionScenarioResponse(built.call.id, built.scenario);
}

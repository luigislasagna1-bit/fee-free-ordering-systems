import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";

/**
 * GET /api/admin/setup-progress
 *
 * Returns the freshest SetupProgress JSON for the signed-in restaurant.
 * Powers the client-side refresh loop in SetupProgressProvider — the
 * admin sidebar and GuidedSetupPill poll this every 30s and on each
 * route change so the percent / checkmarks update without a full page
 * reload.
 *
 * No-store cache so polling never serves a stale snapshot.
 */
export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const progress = await loadSetupProgress(restaurantId);

  return NextResponse.json(progress, {
    headers: { "Cache-Control": "no-store" },
  });
}

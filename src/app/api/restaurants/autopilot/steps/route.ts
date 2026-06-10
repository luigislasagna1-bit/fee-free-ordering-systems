/**
 * GET / PUT /api/restaurants/autopilot/steps
 *
 * Owner-configurable drip steps for a stepped Autopilot campaign
 * (reengagement / second_order). Restaurant scope is ALWAYS derived from the
 * session — never trust a client-supplied restaurantId (AGENTS.md).
 *
 *   GET ?campaignType=reengagement → { steps:[...] } (the persisted steps, or the
 *        default ladder when none saved yet so the editor has something to show).
 *   PUT { campaignType, steps:[...], campaignEnabled } → saves + mirrors each
 *        step's % to its promo, returns the persisted steps.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getSteps, saveSteps, defaultSteps, isSteppedType, type StepInput } from "@/lib/autopilot-steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = new URL(req.url).searchParams.get("campaignType") ?? "";
  if (!isSteppedType(type)) {
    return NextResponse.json({ error: "campaignType must be reengagement or second_order" }, { status: 400 });
  }
  const persisted = await getSteps(restaurantId, type);
  const steps = persisted.length ? persisted : defaultSteps(type);
  return NextResponse.json({ steps });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { campaignType?: string; steps?: unknown; campaignEnabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { campaignType, steps, campaignEnabled } = body;
  if (!campaignType || !isSteppedType(campaignType)) {
    return NextResponse.json({ error: "Invalid campaignType" }, { status: 400 });
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
  }

  await saveSteps(restaurantId, campaignType, steps as StepInput[], !!campaignEnabled);
  const saved = await getSteps(restaurantId, campaignType);
  return NextResponse.json({ steps: saved });
}

/**
 * GET / PATCH /api/restaurants/autopilot/master
 *
 * Owns the AutopilotState row for the signed-in admin's restaurant.
 *
 *   GET   → returns the full AutopilotState (master + per-campaign
 *           toggles + lastRun timestamps). Auto-creates the row on
 *           first read so the admin UI always has something to render.
 *
 *   PATCH → accepts partial updates of any of:
 *             masterEnabled
 *             secondOrderEnabled
 *             reEngageEnabled
 *             cartAbandonmentEnabled
 *           Everything else (lastRun timestamps) is owned by the cron
 *           and not writable by the admin UI.
 *
 * Restaurant scope is derived from the session — we never trust a
 * client-supplied restaurantId per AGENTS.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getOrCreateAutopilotState } from "@/lib/autopilot-state";
import prisma from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getOrCreateAutopilotState(restaurantId);
  return NextResponse.json({
    masterEnabled: state.masterEnabled,
    secondOrderEnabled: state.secondOrderEnabled,
    reEngageEnabled: state.reEngageEnabled,
    cartAbandonmentEnabled: state.cartAbandonmentEnabled,
    lastSecondOrderRun: state.lastSecondOrderRun,
    lastReEngageRun: state.lastReEngageRun,
    lastCartAbandonRun: state.lastCartAbandonRun,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only allow the 4 boolean toggles — lastRun timestamps are owned by cron.
  const data: {
    masterEnabled?: boolean;
    secondOrderEnabled?: boolean;
    reEngageEnabled?: boolean;
    cartAbandonmentEnabled?: boolean;
  } = {};
  for (const k of [
    "masterEnabled",
    "secondOrderEnabled",
    "reEngageEnabled",
    "cartAbandonmentEnabled",
  ] as const) {
    if (typeof body[k] === "boolean") data[k] = body[k] as boolean;
  }

  // Make sure the row exists, then apply.
  await getOrCreateAutopilotState(restaurantId);
  const updated = await prisma.autopilotState.update({
    where: { restaurantId },
    data,
  });

  return NextResponse.json({
    masterEnabled: updated.masterEnabled,
    secondOrderEnabled: updated.secondOrderEnabled,
    reEngageEnabled: updated.reEngageEnabled,
    cartAbandonmentEnabled: updated.cartAbandonmentEnabled,
    lastSecondOrderRun: updated.lastSecondOrderRun,
    lastReEngageRun: updated.lastReEngageRun,
    lastCartAbandonRun: updated.lastCartAbandonRun,
  });
}

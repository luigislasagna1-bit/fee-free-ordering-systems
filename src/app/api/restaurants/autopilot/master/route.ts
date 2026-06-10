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
import { ensureSteppedCampaign } from "@/lib/autopilot-steps";
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

  // Sync each campaign's drip steps + PRE-MADE promos to its toggle (Luigi
  // 2026-06-09/10): enabling Re-engage seeds the 5-step win-back ladder (+ WIN1..5
  // promos) and an AutopilotCampaign anchor row; enabling 2nd-order seeds its
  // single step (+ 2NDOFF). Disabling soft-disables the promos. Step %s drive the
  // promos. cart_abandonment is not stepped (own sweep, no fixed promo).
  const TOGGLE_TO_TYPE: Record<string, string> = {
    secondOrderEnabled: "second_order",
    reEngageEnabled: "reengagement",
  };
  for (const [key, type] of Object.entries(TOGGLE_TO_TYPE)) {
    const v = data[key as keyof typeof data];
    if (typeof v === "boolean") await ensureSteppedCampaign(restaurantId, type, v);
  }

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

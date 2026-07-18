/**
 * GET    /api/restaurants/kickstarter
 *   Returns the restaurant's Kickstarter state + recent imports.
 *
 * PATCH  /api/restaurants/kickstarter
 *   Flip the firstBuyPromoEnabled and/or inviteProspectsEnabled
 *   toggles. Flipping firstBuyPromoEnabled cascades to the auto-
 *   created Promotion row (create or soft-disable via the
 *   helpers in src/lib/kickstarter.ts).
 *
 * Auth: session-scoped restaurantId — never trust a client-provided
 * id. Same pattern as the /api/restaurants/autopilot route this is
 * modeled on.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import {
  KICKSTARTER_FIRST_BUY_REF,
  disableFirstBuyPromo,
  disableInviteProspects,
  enableFirstBuyPromo,
  enableInviteProspects,
  getOrCreateKickstarterState,
} from "@/lib/kickstarter";

export const dynamic = "force-dynamic";

async function loadPayload(restaurantId: string) {
  const [state, promo, imports] = await Promise.all([
    getOrCreateKickstarterState(restaurantId),
    prisma.promotion.findFirst({
      where: { restaurantId, campaignRef: KICKSTARTER_FIRST_BUY_REF },
      select: { id: true, isActive: true },
    }),
    // Recent 5 imports — small index-backed lookup so the kickstarter
    // page render stays cheap even when a restaurant has dozens of past
    // imports.
    prisma.prospectImport.findMany({
      where: { restaurantId },
      orderBy: { uploadedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    // Effective state: the promo row can be paused from /admin/promotions
    // (which doesn't touch KickstarterState), and reporting the stale flag
    // as ON is how the 2026-07 FIRSTBUY incident stayed invisible. Keep in
    // sync with the same rule in src/app/admin/kickstarter/page.tsx.
    firstBuyPromoEnabled: state.firstBuyPromoEnabled && (promo?.isActive ?? false),
    inviteProspectsEnabled: state.inviteProspectsEnabled,
    firstBuyPromoId: promo?.id ?? null,
    imports,
  };
}

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await loadPayload(restaurantId);
  return NextResponse.json(payload);
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { firstBuyPromoEnabled?: boolean; inviteProspectsEnabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Dispatch ONLY when the field is present + boolean. Allows owners to
  // PATCH a single toggle without affecting the other.
  if (typeof body.firstBuyPromoEnabled === "boolean") {
    if (body.firstBuyPromoEnabled) await enableFirstBuyPromo(restaurantId);
    else await disableFirstBuyPromo(restaurantId);
  }
  if (typeof body.inviteProspectsEnabled === "boolean") {
    if (body.inviteProspectsEnabled) await enableInviteProspects(restaurantId);
    else await disableInviteProspects(restaurantId);
  }

  const payload = await loadPayload(restaurantId);
  return NextResponse.json(payload);
}

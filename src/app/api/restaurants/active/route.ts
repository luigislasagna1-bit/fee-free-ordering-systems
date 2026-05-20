import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

/**
 * PUT /api/restaurants/active — toggle Restaurant.isActive.
 *
 * isActive=false pauses customer ordering at /order/<slug> without
 * touching publishing state. Used by the Profile-page toggle for
 * temporary closures (holidays, equipment failures, etc.).
 *
 * Owner-scoped: only the authed owner's own restaurant can be toggled
 * — restaurantId is taken from the session, never from the request body.
 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isActive: body.isActive },
  });

  return NextResponse.json({ ok: true, isActive: body.isActive });
}

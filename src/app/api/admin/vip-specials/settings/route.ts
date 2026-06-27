/**
 * PATCH /api/admin/vip-specials/settings  — body { memberLabel }
 *
 * Saves what the restaurant calls its VIP-special recipients (used in the
 * announcement email: "As a {memberLabel} at …"). Empty → clears to the localized
 * default. Scoped to the owner's restaurant.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const label = typeof body.memberLabel === "string" ? body.memberLabel.trim().slice(0, 40) : "";
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { vipMemberLabel: label || null } });
  return NextResponse.json({ ok: true, memberLabel: label || null });
}

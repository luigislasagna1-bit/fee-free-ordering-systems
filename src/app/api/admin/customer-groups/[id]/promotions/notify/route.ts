/**
 * POST /api/admin/customer-groups/[id]/promotions/notify  — body { promotionId }
 *
 * Re-send the VIP member-special announcement email to all members of the group
 * (e.g. after adding new members). The promotion must already be attached to the
 * group. Sends are fire-and-forget; the response returns how many members have a
 * usable email. Scoped to the owner's restaurant.
 */
import { NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyGroupOfSpecial, countEmailableMembers } from "@/lib/vip-notify";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const promotionId = typeof body.promotionId === "string" ? body.promotionId : "";
  if (!promotionId) return NextResponse.json({ error: "promotionId is required" }, { status: 400 });

  // The link must exist AND belong to this restaurant (scoping + correctness).
  const link = await prisma.customerGroupPromotion.findFirst({
    where: { groupId, promotionId, restaurantId },
    select: { id: true },
  });
  if (!link) return NextResponse.json({ error: "Special not found in this group" }, { status: 404 });

  const emailed = await countEmailableMembers(groupId);
  after(async () => {
    try { await notifyGroupOfSpecial({ groupId, promotionId, restaurantId }); }
    catch (e) { console.error("[customer-groups notify]", e); }
  });
  return NextResponse.json({ ok: true, emailed });
}

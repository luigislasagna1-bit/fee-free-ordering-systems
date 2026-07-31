/**
 * POST /api/admin/customer-groups/[id]/members/notify
 *   body { memberIds?: string[] }   — omit to email the WHOLE group
 *
 * Re-sends the "you've been added — here are your perks" welcome. Needed
 * because members added before the welcome email existed (or added with the
 * notify toggle off) would otherwise have to be removed and re-added to hear
 * about their perks (Luigi 2026-07-31).
 *
 * Restaurant-scoped from the session. Any memberIds are re-checked against
 * this group AND this restaurant, so a tampered id can't email someone else's
 * customer.
 *
 * Returns how many were actually emailed — notifyGroupWelcome sends nothing
 * when the group grants no active perk, so a 0 here is meaningful, not a
 * silent failure.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyGroupWelcome } from "@/lib/vip-notify";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;

  const group = await prisma.customerGroup.findFirst({
    where: { id: groupId, restaurantId },
    select: { id: true },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body = whole group */ }
  const requested: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];

  let memberIds: string[] | undefined;
  if (requested.length) {
    // Re-scope every id: it must belong to THIS group and THIS restaurant.
    const rows = await prisma.customerGroupMember.findMany({
      where: { id: { in: requested }, groupId, restaurantId },
      select: { id: true },
    });
    if (!rows.length) return NextResponse.json({ error: "No matching members" }, { status: 404 });
    memberIds = rows.map((r) => r.id);
  }

  // Awaited (not fire-and-forget): this is an explicit human action and the
  // owner needs the real count back to know it worked.
  const sent = await notifyGroupWelcome({ groupId, restaurantId, memberIds });
  return NextResponse.json({ ok: true, sent });
}

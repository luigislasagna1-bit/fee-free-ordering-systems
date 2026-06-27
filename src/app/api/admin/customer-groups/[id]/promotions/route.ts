/**
 * POST   /api/admin/customer-groups/[id]/promotions   — attach a promotion (body { promotionId })
 * DELETE /api/admin/customer-groups/[id]/promotions?promotionId=…  — detach it
 *
 * Attaching a promotion to a VIP group makes it MEMBER-ONLY (Phase 1): the link's
 * mere existence hides it from the public menu/banner and the general promo pool,
 * and the checkout routes auto-apply it only for this group's members (signed in
 * or typing a group email). Detaching restores the promotion to its own normal
 * behaviour — no promo fields are mutated, so it's fully reversible.
 */
import { NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyGroupOfSpecial, countEmailableMembers } from "@/lib/vip-notify";

async function scope(id: string, restaurantId: string) {
  const g = await prisma.customerGroup.findUnique({ where: { id }, select: { id: true, restaurantId: true } });
  return g && g.restaurantId === restaurantId ? g : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;
  if (!(await scope(groupId, restaurantId))) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const promotionId = typeof body.promotionId === "string" ? body.promotionId : "";
  if (!promotionId) return NextResponse.json({ error: "promotionId is required" }, { status: 400 });

  // Never trust the client's id — the promotion must belong to this restaurant.
  const promo = await prisma.promotion.findUnique({ where: { id: promotionId }, select: { id: true, restaurantId: true } });
  if (!promo || promo.restaurantId !== restaurantId) return NextResponse.json({ error: "Promotion not found" }, { status: 404 });

  try {
    const link = await prisma.customerGroupPromotion.create({
      data: { groupId, promotionId, restaurantId },
      select: { id: true },
    });
    // Optional: email the members about the new special (fire-and-forget).
    let emailed = 0;
    if (body.notify === true) {
      emailed = await countEmailableMembers(groupId);
      after(async () => {
        try { await notifyGroupOfSpecial({ groupId, promotionId, restaurantId }); }
        catch (e) { console.error("[customer-groups notify on attach]", e); }
      });
    }
    return NextResponse.json({ ok: true, linkId: link.id, emailed });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ ok: true, alreadyLinked: true });
    console.error("[customer-groups link promo]", e);
    return NextResponse.json({ error: "Could not attach the special" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;
  if (!(await scope(groupId, restaurantId))) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const promotionId = new URL(req.url).searchParams.get("promotionId") || "";
  if (!promotionId) return NextResponse.json({ error: "promotionId is required" }, { status: 400 });

  // Scoped delete — deleteMany on the composite so a cross-restaurant id is a no-op.
  await prisma.customerGroupPromotion.deleteMany({ where: { groupId, promotionId, restaurantId } });
  return NextResponse.json({ ok: true });
}

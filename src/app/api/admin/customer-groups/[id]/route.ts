/**
 * GET    /api/admin/customer-groups/[id]   — group + members
 * PATCH  /api/admin/customer-groups/[id]   — rename / edit description
 * DELETE /api/admin/customer-groups/[id]   — delete the group (members cascade)
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

async function ownGroup(id: string, restaurantId: string) {
  const g = await prisma.customerGroup.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, name: true, description: true, memberLabel: true, createdAt: true, updatedAt: true },
  });
  if (!g || g.restaurantId !== restaurantId) return null;
  return g;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const group = await ownGroup(id, restaurantId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const rows = await prisma.customerGroupMember.findMany({
    where: { groupId: id },
    orderBy: { addedAt: "desc" },
    take: 1000,
    select: {
      id: true, customerId: true, email: true, phone: true, name: true, addedAt: true,
      customer: { select: { name: true, email: true, phone: true, passwordHash: true } },
    },
  });
  // Never leak passwordHash — map to a hasAccount flag + flatten contact.
  const members = rows.map((m) => ({
    id: m.id,
    customerId: m.customerId,
    name: m.name ?? m.customer?.name ?? null,
    email: m.email ?? m.customer?.email ?? null,
    phone: m.phone ?? m.customer?.phone ?? null,
    hasAccount: !!m.customer?.passwordHash,
    addedAt: m.addedAt,
  }));

  // Member specials = promotions attached to this group (Phase 1). Plus a list of
  // the restaurant's other promotions the owner can attach (the picker).
  const links = await prisma.customerGroupPromotion.findMany({
    where: { groupId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      promotion: {
        select: { id: true, name: true, promotionType: true, isActive: true, displayMode: true, couponCode: true, ruleConfig: true, stackingRule: true, orderType: true, minimumOrder: true },
      },
    },
  });
  const specials = links.map((l) => ({ linkId: l.id, ...l.promotion }));
  const linkedIds = new Set(specials.map((s) => s.id));

  const allPromos = await prisma.promotion.findMany({
    // Active only — an inactive promo can't auto-apply, so it isn't pickable.
    where: { restaurantId, isActive: true },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, name: true, promotionType: true, isActive: true, displayMode: true,
      couponCode: true, ruleConfig: true, minimumOrder: true,
      _count: { select: { groupLinks: true } },
    },
  });
  const pickable = allPromos
    .filter((p) => !linkedIds.has(p.id))
    .map(({ _count, ...p }) => ({ ...p, groupCount: _count.groupLinks }));

  return NextResponse.json({ group, members, specials, pickable });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownGroup(id, restaurantId))) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const data: { name?: string; description?: string | null; memberLabel?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    data.name = name;
  }
  if (body.description !== undefined) data.description = body.description?.toString().slice(0, 500) || null;
  // Per-group "what do you call your members" override (null → restaurant default).
  if (body.memberLabel !== undefined) data.memberLabel = body.memberLabel?.toString().trim().slice(0, 40) || null;

  try {
    await prisma.customerGroup.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "A group with that name already exists." }, { status: 409 });
    console.error("[customer-groups PATCH]", e);
    return NextResponse.json({ error: "Could not update the group" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownGroup(id, restaurantId))) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  // Members cascade; any Promotion.customerGroupId set to NULL (onDelete SetNull)
  // — the assigned promos + their grants stay valid, they just lose the badge.
  await prisma.customerGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

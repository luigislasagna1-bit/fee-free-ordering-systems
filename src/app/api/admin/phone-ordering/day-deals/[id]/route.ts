import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../../guard";

export const runtime = "nodejs";

/**
 * Day-deal pairings (MenuItemDeal) -- item API.
 *   PATCH  /api/admin/phone-ordering/day-deals/[id]   toggle active
 *   DELETE /api/admin/phone-ordering/day-deals/[id]   remove
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const row = await prisma.menuItemDeal.findFirst({
    where: { id, restaurantId: gate.restaurantId },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active (boolean) is required" }, { status: 400 });
  }

  const updated = await prisma.menuItemDeal.update({
    where: { id },
    data: { active: body.active },
    include: {
      dealItem: { select: { name: true, price: true } },
      standardItem: { select: { name: true, price: true } },
    },
  });
  return NextResponse.json({ ok: true, deal: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const row = await prisma.menuItemDeal.findFirst({
    where: { id, restaurantId: gate.restaurantId },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuItemDeal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

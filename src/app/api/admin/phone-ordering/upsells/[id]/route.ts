import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../../guard";
import { MAX_NOTE_CHARS, parseSortOrder, upsellCapReached } from "../../validators";

export const runtime = "nodejs";

/**
 * Nabil featured upsells — item API.
 *   PATCH  /api/admin/phone-ordering/upsells/[id]   note / sortOrder / active
 *   DELETE /api/admin/phone-ordering/upsells/[id]   remove
 *
 * Activating a 6th upsell → 409 code "upsell_limit" (cap checked in a
 * transaction, same as the collection POST).
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const upsell = await prisma.voiceUpsell.findUnique({
    where: { id },
    select: { restaurantId: true, active: true },
  });
  if (!upsell || upsell.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.note === "string") data.note = body.note.trim().slice(0, MAX_NOTE_CHARS) || null;
  if (typeof body.active === "boolean") data.active = body.active;
  const sortOrder = parseSortOrder(body.sortOrder);
  if (sortOrder !== null) data.sortOrder = sortOrder;

  const activating = data.active === true && !upsell.active;
  const result = await prisma.$transaction(async (tx) => {
    if (activating) {
      const activeOthers = await tx.voiceUpsell.count({
        where: { restaurantId: gate.restaurantId, active: true, NOT: { id } },
      });
      if (upsellCapReached(activeOthers)) return { limited: true as const };
    }
    const updated = await tx.voiceUpsell.update({
      where: { id },
      data,
      include: { menuItem: { select: { name: true, price: true, isAvailable: true } } },
    });
    return { updated };
  });

  if ("limited" in result) {
    return NextResponse.json({ error: "Upsell limit reached", code: "upsell_limit" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, upsell: result.updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const upsell = await prisma.voiceUpsell.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!upsell || upsell.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.voiceUpsell.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

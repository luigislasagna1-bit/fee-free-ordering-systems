import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../../guard";

export const runtime = "nodejs";

/**
 * Nabil blocked callers — item API.
 *   DELETE /api/admin/phone-ordering/blocked-callers/[id]   unblock
 */

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const caller = await prisma.blockedCaller.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!caller || caller.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.blockedCaller.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

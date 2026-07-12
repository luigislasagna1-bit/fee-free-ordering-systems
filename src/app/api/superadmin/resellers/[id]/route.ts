import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";

/**
 * PATCH /api/superadmin/resellers/[id]
 * body: { customCommissionRate: number | null }
 *
 * Superadmin-only. Updates editable fields on a ResellerProfile. Currently
 * the only writable field is customCommissionRate; pass null to clear the
 * override and fall back to the default tier table.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};

  if ("customCommissionRate" in body) {
    const raw = body.customCommissionRate;
    if (raw === null || raw === "") {
      update.customCommissionRate = null;
    } else {
      const rate = Number(raw);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json(
          { error: "Custom commission rate must be a number between 0 and 100" },
          { status: 400 }
        );
      }
      update.customCommissionRate = rate;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const profile = await prisma.resellerProfile.update({
    where: { id },
    data: update,
    select: { id: true, customCommissionRate: true },
  });

  return NextResponse.json({ ok: true, profile });
}

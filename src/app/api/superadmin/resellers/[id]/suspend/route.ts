import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isSuperadmin } from "@/lib/roles";

/**
 * POST /api/superadmin/resellers/[id]/suspend
 * Suspends a reseller. Their User.role stays reseller_partner (so they can
 * log in to see the suspension notice), but no commissions accrue and they
 * can't impersonate restaurants while status !== "approved".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!isSuperadmin(user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string | null = body?.reason ? String(body.reason).slice(0, 500) : null;

  const profile = await prisma.resellerProfile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.resellerProfile.update({
    where: { id },
    data: {
      status: "suspended",
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });

  return NextResponse.json({ ok: true });
}

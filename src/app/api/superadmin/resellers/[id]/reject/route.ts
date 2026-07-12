import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { notifyResellerOfApplicationChange } from "@/lib/reseller-application-notify";

/**
 * POST /api/superadmin/resellers/[id]/reject
 * Mark a pending application as rejected. The User stays at role
 * "pending_reseller" — they can log in to see the rejection notice. We don't
 * delete the row so they can't re-apply with the same email immediately.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string | null = body?.reason ? String(body.reason).slice(0, 500) : null;

  const profile = await prisma.resellerProfile.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wasAlreadyRejected = profile.status === "rejected";
  await prisma.resellerProfile.update({
    where: { id },
    data: {
      status: "rejected",
      suspendedReason: reason,
    },
  });

  // Notify on real state transition only — same idempotency reasoning
  // as the approve endpoint.
  if (!wasAlreadyRejected) {
    void notifyResellerOfApplicationChange(id, "rejected", reason);
  }

  return NextResponse.json({ ok: true });
}

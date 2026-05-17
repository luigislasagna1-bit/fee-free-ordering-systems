import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { availableBalanceCents } from "@/lib/commission";

const MIN_PAYOUT_CENTS = 50_00; // $50 minimum

/**
 * GET /api/reseller/payouts
 * List the caller's payout requests.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payouts = await prisma.payoutRequest.findMany({
    where: { resellerProfileId: user.resellerProfileId },
    orderBy: { requestedAt: "desc" },
    include: {
      _count: { select: { commissions: true } },
    },
  });

  const balance = await availableBalanceCents(user.resellerProfileId);
  return NextResponse.json({ payouts, availableBalanceCents: balance, minPayoutCents: MIN_PAYOUT_CENTS });
}

/**
 * POST /api/reseller/payouts
 * Create a payout request. Sweeps all currently-`available` commissions into
 * the request, sets their payoutRequestId, and freezes the total at request
 * time. Min $50. The superadmin then approves and marks paid.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Reseller must be approved (suspended/rejected accounts can't request payout)
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") {
    return NextResponse.json({ error: "Your account is not approved" }, { status: 403 });
  }

  // No outstanding requested/approved payout — one in flight at a time.
  const pending = await prisma.payoutRequest.findFirst({
    where: {
      resellerProfileId: user.resellerProfileId,
      status: { in: ["requested", "approved"] },
    },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json(
      { error: "You already have a payout in flight. Wait until it's paid or rejected." },
      { status: 409 }
    );
  }

  const availableCents = await availableBalanceCents(user.resellerProfileId);
  if (availableCents < MIN_PAYOUT_CENTS) {
    return NextResponse.json(
      { error: `Minimum payout is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}. Your available balance is $${(availableCents / 100).toFixed(2)}.` },
      { status: 400 }
    );
  }

  // Sweep available commissions into a single PayoutRequest. Done in a
  // transaction so we can't double-include a commission across two requests.
  const result = await prisma.$transaction(async (tx) => {
    const commissions = await tx.commissionTransaction.findMany({
      where: { resellerProfileId: user.resellerProfileId, status: "available" },
      select: { id: true, commissionCents: true },
    });
    if (commissions.length === 0) {
      throw new Error("No available commissions");
    }
    const total = commissions.reduce((s, c) => s + c.commissionCents, 0);
    const payout = await tx.payoutRequest.create({
      data: {
        resellerProfileId: user.resellerProfileId!,
        amountCents: total,
      },
    });
    await tx.commissionTransaction.updateMany({
      where: { id: { in: commissions.map((c) => c.id) } },
      data: { payoutRequestId: payout.id },
    });
    return { payout, count: commissions.length };
  });

  return NextResponse.json({
    ok: true,
    payoutId: result.payout.id,
    amountCents: result.payout.amountCents,
    commissionsCount: result.count,
  });
}

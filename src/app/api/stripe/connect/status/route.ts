import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getConnectAccountStatus, stripeReady } from "@/lib/stripe";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  });

  if (!restaurant?.stripeAccountId) {
    return NextResponse.json({ status: "not_connected", accountId: null });
  }

  if (!(await stripeReady())) {
    return NextResponse.json({ status: restaurant.stripeAccountStatus || "not_connected", accountId: restaurant.stripeAccountId, stripeDisabled: true });
  }

  try {
    // getConnectAccountStatus now throws on failure (instead of returning {error}).
    const acct = await getConnectAccountStatus(restaurant.stripeAccountId);

    let status = "pending";
    if (acct.chargesEnabled && acct.payoutsEnabled) status = "connected";
    else if (acct.requiresAction) status = "action_required";

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        stripeAccountStatus: status,
        stripeChargesEnabled: acct.chargesEnabled ?? false,
        stripePayoutsEnabled: acct.payoutsEnabled ?? false,
      },
    });

    return NextResponse.json({ status, accountId: restaurant.stripeAccountId, ...acct });
  } catch (err: any) {
    return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
  }
}

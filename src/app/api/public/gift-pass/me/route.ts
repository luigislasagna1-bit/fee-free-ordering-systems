/**
 * GET /api/public/gift-pass/me — storefront-banner read for the OrderingPage.
 * Reads the `ff_gift_pass` cookie (if any), renews the sliding session
 * window, and returns the spendable balance + restaurant name, or a typed
 * `reason` so the UI can say WHY nothing is showing (expired / superseded /
 * account_exists / none) rather than silently showing nothing. Never a
 * status oracle beyond the caller's OWN cookie — this reads no request
 * body, so there is nothing here for another party to enumerate.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { getGiftPassSession, giftPassCookieOptions } from "@/lib/gift-wallet-pass";
import { getBalance } from "@/lib/reward-ledger";
import { formatCurrency } from "@/lib/utils";

export async function GET(_req: NextRequest) {
  const res = await getGiftPassSession();
  const noStoreHeaders = { "Cache-Control": "no-store" };

  if (!res.ok) {
    return NextResponse.json({ ok: false, reason: res.reason }, { headers: noStoreHeaders });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: res.info.restaurantId },
    select: { name: true, currency: true, slug: true, rewardsEnabled: true },
  });
  if (!restaurant || !restaurant.rewardsEnabled) {
    return NextResponse.json({ ok: false, reason: "rewards_off" }, { headers: noStoreHeaders });
  }

  const balance = await getBalance({ restaurantId: res.info.restaurantId, customerId: res.info.customerId });

  // Keep the browser cookie's own maxAge in sync with the DB sliding window
  // we just (potentially) renewed inside getGiftPassSession().
  const store = await cookies();
  const current = store.get(giftPassCookieOptions().name)?.value;
  if (current) store.set({ ...giftPassCookieOptions(), value: current });

  return NextResponse.json(
    {
      ok: true,
      balance,
      amountLabel: formatCurrency(balance, restaurant.currency),
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      // The pass holder's OWN address — safe to hand back to its own holder
      // (gated on possessing the cookie, and it's the exact address the gift
      // email was sent to). Lets the checkout form prefill + lock the
      // contact email so the customer doesn't have to remember/retype the
      // exact address their wallet is keyed to.
      email: res.info.email,
    },
    { headers: noStoreHeaders },
  );
}

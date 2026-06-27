/**
 * PATCH /api/admin/rewards/settings
 *
 * Saves the restaurant's Reward Dollars (store-credit) configuration. KEYS-
 * whitelist + clamp pattern (like vip-specials/settings + order-handling) so a
 * tampered body can never write an arbitrary column or an out-of-range value.
 * Scoped to the owner's restaurant. Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const num = (v: any, min: number, max: number, dflt: number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: Record<string, any> = {};
  if ("rewardsEnabled" in body) data.rewardsEnabled = !!body.rewardsEnabled;
  if ("rewardEarnEnabled" in body) data.rewardEarnEnabled = !!body.rewardEarnEnabled;
  if ("rewardRedeemEnabled" in body) data.rewardRedeemEnabled = !!body.rewardRedeemEnabled;
  if ("rewardEarnMode" in body) data.rewardEarnMode = body.rewardEarnMode === "per_dollar" ? "per_dollar" : "percent";
  if ("rewardEarnPercent" in body) data.rewardEarnPercent = num(body.rewardEarnPercent, 0, 100, 0);
  if ("rewardEarnPerDollar" in body) data.rewardEarnPerDollar = num(body.rewardEarnPerDollar, 0, 1_000_000, 0);
  if ("rewardMinRedeemBalance" in body) data.rewardMinRedeemBalance = num(body.rewardMinRedeemBalance, 0, 1_000_000, 0);
  if ("rewardMaxRedeemPercent" in body) data.rewardMaxRedeemPercent = num(body.rewardMaxRedeemPercent, 0, 100, 100);
  if ("rewardSignupBonus" in body) data.rewardSignupBonus = num(body.rewardSignupBonus, 0, 1_000_000, 0);
  if ("rewardExpiryDays" in body) data.rewardExpiryDays = Math.max(0, Math.min(3650, Math.round(Number(body.rewardExpiryDays) || 0)));
  if ("rewardLabelSingular" in body)
    data.rewardLabelSingular = typeof body.rewardLabelSingular === "string" && body.rewardLabelSingular.trim()
      ? body.rewardLabelSingular.trim().slice(0, 40) : null;
  if ("rewardLabelPlural" in body)
    data.rewardLabelPlural = typeof body.rewardLabelPlural === "string" && body.rewardLabelPlural.trim()
      ? body.rewardLabelPlural.trim().slice(0, 40) : null;

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, unchanged: true });

  await prisma.restaurant.update({ where: { id: restaurantId }, data });
  return NextResponse.json({ ok: true });
}

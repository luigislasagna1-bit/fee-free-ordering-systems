import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

/** PUT — save the ordering-page promo popup (its own Admin → Marketing → Promo Popup page,
 *  moved out of the profile route 2026-06-25). The button can link to a URL, OPEN a promotion's
 *  detail, or APPLY a coupon. Sanitized to ONLY the known fields with capped lengths — never
 *  persist an arbitrary blob; the action gates which target field is kept. */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const p = (body?.orderingPopup ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const rawAction = typeof p.buttonAction === "string" ? p.buttonAction : "url";
  const action = rawAction === "promo" || rawAction === "coupon" ? rawAction : "url";

  const orderingPopup = {
    enabled: !!p.enabled,
    imageUrl: str(p.imageUrl, 2000),
    title: str(p.title, 200),
    body: str(p.body, 2000),
    buttonLabel: str(p.buttonLabel, 100),
    buttonAction: action,
    buttonUrl: action === "url" ? str(p.buttonUrl, 2000) : null,
    buttonPromoId: action === "promo" ? str(p.buttonPromoId, 100) : null,
    buttonCouponCode: action === "coupon" ? (str(p.buttonCouponCode, 40)?.toUpperCase() ?? null) : null,
  };
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { orderingPopup } });
  return NextResponse.json({ ok: true });
}

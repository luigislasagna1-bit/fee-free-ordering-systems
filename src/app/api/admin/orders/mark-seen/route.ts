import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

/**
 * Stamp "orders seen up to now" for the current owner.
 *
 * The admin header bell / sidebar badge surface a NEW-orders notification:
 * the count of pending orders that arrived since the owner last looked at the
 * Orders page. This route records that "last looked" moment in a per-restaurant
 * cookie; the admin layout reads it back and only counts pending orders newer
 * than the stamp. Visiting /admin/orders (which POSTs here on mount + each
 * auto-refresh) therefore clears the bell — exactly the "see it → it clears"
 * behaviour Luigi asked for (2026-06-11), with no DB write on this hot-ish path.
 *
 * The cookie value is `<restaurantId>:<ISO timestamp>` so a superadmin who
 * switches between impersonated restaurants doesn't carry one restaurant's
 * "seen" stamp into another — the layout ignores the stamp unless the
 * restaurantId matches the one currently being viewed.
 */
export const ORDERS_SEEN_COOKIE = "ff-orders-seen";

export async function POST() {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ORDERS_SEEN_COOKIE, `${user.restaurantId}:${new Date().toISOString()}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — the notification is "since you last looked"
  });
  return res;
}

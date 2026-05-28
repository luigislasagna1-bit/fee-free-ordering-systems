/**
 * POST /api/restaurants/[slug]/account/logout
 *
 * Clears the per-restaurant session cookie. Idempotent — calling it
 * without a session is a no-op.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { RESTAURANT_CUSTOMER_COOKIE_NAME } from "@/lib/restaurant-customer-session";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: RESTAURANT_CUSTOMER_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}

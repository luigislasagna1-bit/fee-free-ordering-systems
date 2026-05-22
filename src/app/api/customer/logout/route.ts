/** POST /api/customer/logout — clears the customer session cookie. */
import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE_NAME } from "@/lib/customer-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CUSTOMER_COOKIE_NAME);
  return res;
}

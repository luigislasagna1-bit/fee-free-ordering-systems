// Stripe redirects here after the restaurant owner completes onboarding
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  // Redirect back to admin settings with success flag
  return NextResponse.redirect(`${baseUrl}/admin/settings?stripe=connected`);
}

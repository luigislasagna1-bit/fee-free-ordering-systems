import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * PATCH /api/admin/integrations
 * body: { facebookPixelId?: string|null, googleAnalyticsId?: string|null }
 *
 * Owner-scoped. Saves (or clears, with an empty string) the restaurant's
 * marketing-tracking IDs for their own ordering site. The ID shape is validated
 * BEFORE storage — both because a typo'd pixel does nothing, and because these
 * values are interpolated into inline <script> on /order/<slug>, so we only
 * ever store characters that can't break out of the snippet. Luigi 2026-06-17.
 */
const FB_PIXEL_RE = /^\d{6,20}$/; // Meta Pixel IDs are long numeric strings
const GA4_RE = /^G-[A-Z0-9]{4,15}$/i; // GA4 Measurement ID, e.g. G-XXXXXXXXXX

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: { facebookPixelId?: string | null; googleAnalyticsId?: string | null } = {};

  if ("facebookPixelId" in body) {
    const v = String(body.facebookPixelId ?? "").trim();
    if (v && !FB_PIXEL_RE.test(v)) {
      return NextResponse.json(
        { error: "Enter a valid Facebook Pixel ID (the numeric ID from Meta Events Manager).", code: "invalid_pixel" },
        { status: 400 },
      );
    }
    data.facebookPixelId = v || null;
  }

  if ("googleAnalyticsId" in body) {
    const v = String(body.googleAnalyticsId ?? "").trim();
    if (v && !GA4_RE.test(v)) {
      return NextResponse.json(
        { error: "Enter a valid Google Analytics Measurement ID (looks like G-XXXXXXXXXX).", code: "invalid_ga" },
        { status: 400 },
      );
    }
    data.googleAnalyticsId = v ? v.toUpperCase() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.restaurant.update({ where: { id: user.restaurantId }, data });
  return NextResponse.json({ ok: true });
}

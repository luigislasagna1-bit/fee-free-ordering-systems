import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { validateSubdomainFormat } from "@/lib/domains/reserved";

/**
 * GET /api/admin/domain/check-subdomain?value=foo
 *
 * Lightweight availability check used while the user is typing. Validates
 * format (length, chars, reserved-list) then checks uniqueness in DB,
 * excluding the active restaurant's own current subdomain (so the form is
 * idempotent on re-save).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (req.nextUrl.searchParams.get("value") || "").toLowerCase().trim();
  const fmt = validateSubdomainFormat(raw);
  if (!fmt.ok) return NextResponse.json({ available: false, reason: fmt.reason });

  const existing = await prisma.restaurant.findFirst({
    where: { subdomain: raw, NOT: { id: user.restaurantId } },
    select: { id: true },
  });

  if (existing) return NextResponse.json({ available: false, reason: "Already taken" });
  return NextResponse.json({ available: true });
}

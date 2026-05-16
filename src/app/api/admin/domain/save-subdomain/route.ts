import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { validateSubdomainFormat } from "@/lib/domains/reserved";

/**
 * PUT /api/admin/domain/save-subdomain { value: "luigis" }
 *
 * Replaces the active restaurant's subdomain. The middleware LRU will pick
 * up the new value within 60 s; an explicit invalidate is not strictly
 * required but worth wiring if we move to a longer TTL later.
 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const value = String(body?.value || "").toLowerCase().trim();

  const fmt = validateSubdomainFormat(value);
  if (!fmt.ok) return NextResponse.json({ error: fmt.reason }, { status: 400 });

  const taken = await prisma.restaurant.findFirst({
    where: { subdomain: value, NOT: { id: user.restaurantId } },
    select: { id: true },
  });
  if (taken) return NextResponse.json({ error: "Already taken" }, { status: 409 });

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: { subdomain: value },
  });

  return NextResponse.json({ ok: true, subdomain: value });
}

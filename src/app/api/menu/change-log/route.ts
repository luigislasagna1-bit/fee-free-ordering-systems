import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * Read the menu change log for the signed-in owner's restaurant, newest first.
 * Restaurant is derived from the SESSION (never a client id), and the result is
 * hard-capped at 50 rows (no unbounded findMany). Fabrizio 2026-07-08.
 */
export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.menuChangeLog.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    // NOTE: actorEmail is deliberately NOT returned — under impersonation it is
    // the superadmin/reseller's real platform email, which the tenant must not
    // see (and the viewer never uses it). actorName + viaImpersonation suffice.
    select: {
      id: true, actorName: true, viaImpersonation: true,
      entityType: true, entityName: true, action: true, summary: true, createdAt: true,
    },
  });
  return NextResponse.json({ entries: rows });
}

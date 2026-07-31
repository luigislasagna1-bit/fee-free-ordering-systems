/**
 * GET /api/admin/customers/search?q=<term>&excludeGroupId=<id>
 *
 * Typeahead over the SESSION restaurant's customers, for pickers that need to
 * choose real people rather than have the owner retype email addresses
 * (first consumer: adding members to a VIP group — Luigi 2026-07-31).
 *
 * Restaurant-scoped from the session, never from the client: a tampered query
 * can only ever see this restaurant's customers.
 *
 * Scale: `q` is required (no "list everything" mode), the WHERE is always
 * anchored on restaurantId — which is indexed, as are [restaurantId, email]
 * and [restaurantId, phone] — and results are hard-capped at MAX_RESULTS. A
 * 10k-customer restaurant cannot turn this into a full-table read.
 *
 * `excludeGroupId` drops people who are ALREADY members of that group, so the
 * picker never offers a duplicate (the add endpoint dedupes too — this is for
 * the UI, not for correctness).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const MAX_RESULTS = 25;
/** Below this we'd match half the table for one keystroke — the client also
 *  debounces, but the server must not depend on the client behaving. */
const MIN_QUERY = 2;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const excludeGroupId = req.nextUrl.searchParams.get("excludeGroupId")?.trim() || null;
  if (q.length < MIN_QUERY) return NextResponse.json({ customers: [] });

  // Members already in the group — resolved to customerIds so the picker can
  // grey them out. Scoped to this restaurant so a foreign groupId reveals
  // nothing.
  let alreadyIn = new Set<string>();
  if (excludeGroupId) {
    const existing = await prisma.customerGroupMember.findMany({
      where: { groupId: excludeGroupId, restaurantId },
      select: { customerId: true },
      take: 5000,
    });
    alreadyIn = new Set(existing.map((m) => m.customerId).filter(Boolean) as string[]);
  }

  const rows = await prisma.customer.findMany({
    where: {
      restaurantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true, passwordHash: true },
    orderBy: { name: "asc" },
    take: MAX_RESULTS,
  });

  return NextResponse.json({
    customers: rows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      // Never leak the hash — the picker only needs to badge "has an account".
      hasAccount: !!c.passwordHash,
      alreadyMember: alreadyIn.has(c.id),
    })),
  });
}

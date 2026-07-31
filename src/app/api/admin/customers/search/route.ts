/**
 * GET /api/admin/customers/search?q=<term>&excludeGroupId=<id>&offset=<n>&limit=<n>
 *
 * The SESSION restaurant's customers, for pickers that choose real people
 * rather than making the owner retype email addresses (first consumer: adding
 * members to a VIP group — Luigi 2026-07-31).
 *
 * Two modes, same endpoint:
 *   • BROWSE — no `q`: a plain paged list, so the owner can scroll and page
 *     through everyone instead of having to guess a search term first
 *     (Luigi 2026-07-31, "should be a better way to see the customers").
 *   • SEARCH — `q` given: filters by name / email / phone.
 *
 * Restaurant-scoped from the session, never from the client: a tampered query
 * can only ever see this restaurant's customers.
 *
 * Scale: the WHERE is always anchored on restaurantId (indexed, as are
 * [restaurantId, email] and [restaurantId, phone]); `limit` is clamped to
 * MAX_LIMIT so browse mode can't be turned into a full-table dump; and the
 * total is counted with the same WHERE so the client can page without
 * over-fetching. A 10k-customer restaurant pages 25 rows at a time.
 *
 * `excludeGroupId` marks people ALREADY in that group so the picker can grey
 * them out (the add endpoint dedupes too — this is for the UI, not safety).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const excludeGroupId = sp.get("excludeGroupId")?.trim() || null;
  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(sp.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

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

  // Browse mode = no filter beyond the restaurant; search mode adds the OR.
  const where = {
    restaurantId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, passwordHash: true },
      // Name then id: `name` is not unique, so without the id tiebreaker two
      // pages could repeat or skip a row (the paginated-sort rule from the
      // admin table work).
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    total,
    offset,
    limit,
    hasMore: offset + rows.length < total,
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

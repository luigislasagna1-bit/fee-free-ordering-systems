/**
 * VIP member-only promotions (Phase 1 of the VIP Groups expansion, 2026-06-27).
 *
 * A promotion linked to ≥1 VIP group (via `CustomerGroupPromotion`) is
 * "member-only": it is EXCLUDED from the public promo pool / menu banner, and
 * auto-applied ONLY for that group's members — both signed-in members and guests
 * who type a group email at checkout (no code needed).
 *
 * The two checkout routes (apply-promos preview + orders charge) share this
 * resolver so preview == charge. The pure helpers (`partitionMemberOnly`,
 * `promosForGroups`) are unit-tested directly; the DB lookups are thin and gated
 * so non-VIP restaurants pay ~nothing on the hot order path.
 *
 * NOTE: prisma is imported lazily inside the DB helper so the pure functions
 * (partitionMemberOnly / promosForGroups) can be unit-tested without a database.
 */
export type VipIdentity = {
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
};

type LinkedPromo = { id: string; groupLinks?: { groupId: string }[] };

/** Split promotions into the PUBLIC pool vs MEMBER-ONLY (linked to ≥1 VIP group).
 *  Pure. Member-only promos must never enter the general/banner pool. */
export function partitionMemberOnly<T extends LinkedPromo>(promos: T[]): { general: T[]; memberOnly: T[] } {
  const general: T[] = [];
  const memberOnly: T[] = [];
  for (const p of promos) (p.groupLinks && p.groupLinks.length ? memberOnly : general).push(p);
  return { general, memberOnly };
}

/** Pure: which member-only promos apply given the groups an identity belongs to. */
export function promosForGroups<T extends LinkedPromo>(memberOnly: T[], groupIds: Set<string>): T[] {
  if (!groupIds.size) return [];
  return memberOnly.filter((p) => (p.groupLinks ?? []).some((l) => groupIds.has(l.groupId)));
}

/** Resolve which VIP groups an identity belongs to. Matches:
 *   - a signed-in member by `customerId`,
 *   - a guest member by the email/phone typed at checkout,
 *   - an ACCOUNT member (row keyed by customerId, email null) by mapping the
 *     typed email/phone back to their Customer account.
 *  Restaurant-scoped + indexed; callers only invoke it when member-only promos
 *  exist, so it never runs for ordinary restaurants. Scale seam: this result is
 *  cacheable per (restaurant, identity) if VIP usage ever gets hot. */
export async function resolveMemberGroupIds(restaurantId: string, identity: VipIdentity): Promise<Set<string>> {
  const prisma = (await import("@/lib/db")).default;
  const email = identity.email?.trim().toLowerCase() || null;
  const phone = identity.phone?.trim() || null;
  const customerIds = new Set<string>();
  if (identity.customerId) customerIds.add(identity.customerId);

  // Map a typed email/phone to a Customer so account members (stored by
  // customerId, email null) still match when checking out as a guest.
  if (email || phone) {
    const custs = await prisma.customer.findMany({
      where: {
        restaurantId,
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
      take: 5,
    });
    for (const c of custs) customerIds.add(c.id);
  }

  if (!customerIds.size && !email && !phone) return new Set();

  const members = await prisma.customerGroupMember.findMany({
    where: {
      restaurantId,
      OR: [
        ...(customerIds.size ? [{ customerId: { in: [...customerIds] } }] : []),
        ...(email ? [{ email }] : []), // guest member emails are stored lowercased
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { groupId: true },
  });
  return new Set(members.map((m) => m.groupId));
}

/** Full resolution for a checkout route: the member-only promos this identity is
 *  entitled to (caller forces `autoApply:true` + applies channel/suppressed
 *  filters before handing them to the engine). Returns [] cheaply when there are
 *  no member-only promos or no identity. */
export async function qualifyingMemberOnlyPromos<T extends LinkedPromo>(
  restaurantId: string,
  identity: VipIdentity,
  memberOnly: T[],
): Promise<T[]> {
  if (!memberOnly.length) return [];
  if (!identity.customerId && !identity.email && !identity.phone) return [];
  const groupIds = await resolveMemberGroupIds(restaurantId, identity);
  return promosForGroups(memberOnly, groupIds);
}

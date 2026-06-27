/**
 * VIP member-only promotions ("VIP Specials", Program 3 Phase 1).
 *
 * A promotion linked to ≥1 VIP TARGET (via `CustomerGroupPromotion`) is
 * "member-only": EXCLUDED from the public promo pool / menu banner, and
 * auto-applied ONLY for whoever the target covers — a whole GROUP, or specific
 * INDIVIDUALS (an account by customerId, and/or a person by email/phone). Works
 * for signed-in members and for guests who type a matching email at checkout.
 *
 * Both checkout routes (apply-promos preview + orders charge) share this resolver
 * so preview == charge. The pure helpers (`partitionMemberOnly`,
 * `promosForIdentity`) are unit-tested; the DB lookups are gated so non-VIP
 * restaurants pay ~nothing on the hot order path.
 *
 * NOTE: prisma is imported lazily inside the DB helper so the pure functions can
 * be unit-tested without a database.
 */
export type VipIdentity = {
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** A single VIP target on a promotion: a group OR an individual. */
export type VipTarget = {
  groupId?: string | null;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
};

type LinkedPromo = { id: string; groupLinks?: VipTarget[] };

/** Everything about an identity needed to match targets. */
export type ResolvedIdentity = {
  groupIds: Set<string>;
  customerIds: Set<string>;
  email: string | null;
  phone: string | null;
};

/** Split promotions into the PUBLIC pool vs MEMBER-ONLY (linked to ≥1 target).
 *  Pure. Member-only promos must never enter the general/banner pool. */
export function partitionMemberOnly<T extends LinkedPromo>(promos: T[]): { general: T[]; memberOnly: T[] } {
  const general: T[] = [];
  const memberOnly: T[] = [];
  for (const p of promos) (p.groupLinks && p.groupLinks.length ? memberOnly : general).push(p);
  return { general, memberOnly };
}

/** Pure: which member-only promos apply to a resolved identity — matching ANY of
 *  a promo's targets by group membership, account id, email, or phone. */
export function promosForIdentity<T extends LinkedPromo>(memberOnly: T[], resolved: ResolvedIdentity): T[] {
  const { groupIds, customerIds, email, phone } = resolved;
  return memberOnly.filter((p) =>
    (p.groupLinks ?? []).some((tgt) =>
      (!!tgt.groupId && groupIds.has(tgt.groupId)) ||
      (!!tgt.customerId && customerIds.has(tgt.customerId)) ||
      (!!tgt.email && !!email && tgt.email.toLowerCase() === email) ||
      (!!tgt.phone && !!phone && tgt.phone === phone),
    ),
  );
}

/** Resolve groups + account ids + contact for an identity. Maps a typed
 *  email/phone back to a Customer so account targets/members still match when
 *  checking out as a guest. Restaurant-scoped + indexed; only called when
 *  member-only promos exist. Scale seam: cacheable per (restaurant, identity). */
export async function resolveIdentityTargets(restaurantId: string, identity: VipIdentity): Promise<ResolvedIdentity> {
  const prisma = (await import("@/lib/db")).default;
  const email = identity.email?.trim().toLowerCase() || null;
  const phone = identity.phone?.trim() || null;
  const customerIds = new Set<string>();
  if (identity.customerId) customerIds.add(identity.customerId);

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

  let groupIds = new Set<string>();
  if (customerIds.size || email || phone) {
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
    groupIds = new Set(members.map((m) => m.groupId));
  }

  return { groupIds, customerIds, email, phone };
}

/** Full resolution for a checkout route: the member-only promos this identity is
 *  entitled to (caller forces `autoApply:true`). Returns [] cheaply when there
 *  are no member-only promos or no identity. */
export async function qualifyingMemberOnlyPromos<T extends LinkedPromo>(
  restaurantId: string,
  identity: VipIdentity,
  memberOnly: T[],
): Promise<T[]> {
  if (!memberOnly.length) return [];
  if (!identity.customerId && !identity.email && !identity.phone) return [];
  const resolved = await resolveIdentityTargets(restaurantId, identity);
  return promosForIdentity(memberOnly, resolved);
}

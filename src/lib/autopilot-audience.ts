/**
 * Autopilot audience — who counts as a "club member" and what they get.
 *
 * Why this exists (Luigi 2026-08-11, from Ben Bilton's report):
 * Autopilot's win-back / second-order / cart-recovery campaigns are aimed at
 * ORDINARY customers. VIP club members already hold standing discounts (Luigi's
 * clubs run 20–30% off), so handing them another 5–20% code is pure margin loss.
 * Ten of the first sixty-five Autopilot emails on Luigi's store went to club
 * members — Ben among them — because the audience query filtered on exactly one
 * thing: marketing consent. There was no notion of a group being excluded from
 * anything; `CustomerGroupPromotion` can only say "these people GET this deal".
 *
 * Two settings, deliberately separate:
 *   CustomerGroup.skipAutopilotOffers  — WHO is a club (owner ticks the group)
 *   AutopilotState.<campaign>VipMode   — WHAT they get, per campaign
 *
 * `skipAutopilotOffers` defaults to FALSE so nothing changes for any restaurant
 * until an owner deliberately ticks a group — "customer group" is a generic
 * bucket here and a catering-leads list must keep receiving campaigns. The mode
 * columns can carry the *sensible* default ("no_offer") precisely because they
 * are inert until a group is ticked.
 *
 * Query budget: TWO extra queries per restaurant per campaign run, and ZERO for
 * a restaurant with no ticked group (the early return below). Both hit existing
 * indexes — CustomerGroup(restaurantId) and CustomerGroupMember's
 * (restaurantId, customerId) / (restaurantId, email) — and the member lookup is
 * bounded by the candidate list, never by club size. No N+1.
 */
import prisma from "@/lib/db";

/** What a club member gets from a given campaign. */
export type VipMode =
  /** Treated like everyone else — the pre-2026-08-11 behaviour. */
  | "offer"
  /** Still emailed, but with the coupon replaced by a note about their club. */
  | "no_offer"
  /** Not emailed at all by this campaign. */
  | "skip";

export const VIP_MODES: VipMode[] = ["offer", "no_offer", "skip"];
export const DEFAULT_VIP_MODE: VipMode = "no_offer";

/** Coerce an arbitrary stored/posted value to a valid mode. */
export function normalizeVipMode(v: unknown): VipMode {
  return typeof v === "string" && (VIP_MODES as string[]).includes(v) ? (v as VipMode) : DEFAULT_VIP_MODE;
}

/** The AutopilotState column that governs each campaign type. */
const MODE_FIELD: Record<string, "reEngageVipMode" | "secondOrderVipMode" | "cartAbandonVipMode"> = {
  reengagement: "reEngageVipMode",
  second_order: "secondOrderVipMode",
  cart_abandonment: "cartAbandonVipMode",
};

export function vipModeFieldFor(campaignType: string): "reEngageVipMode" | "secondOrderVipMode" | "cartAbandonVipMode" | null {
  return MODE_FIELD[campaignType] ?? null;
}

/** One person Autopilot is considering emailing. Any subset of ids may be null. */
export type AudienceIdentity = {
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** A club member we matched, and the club we matched them to. */
export type VipMatch = {
  /** Display name of the group, for the "your club pricing already applies" note. */
  groupName: string;
  /** The owner's own word for a member ("VIP", "Founder") when they set one. */
  memberLabel: string | null;
};

export type AutopilotAudience = {
  /** True when this restaurant has at least one ticked group. */
  hasClubs: boolean;
  /** The club this identity belongs to, or null when they're an ordinary customer. */
  match(identity: AudienceIdentity): VipMatch | null;
  /** Distinct PEOPLE matched, for the admin summary (not member rows). */
  matchedCount: number;
};

const NO_CLUBS: AutopilotAudience = { hasClubs: false, match: () => null, matchedCount: 0 };

const lc = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim().toLowerCase();
  return s ? s : null;
};

/**
 * Resolve which of `identities` belong to a club this restaurant has excluded.
 *
 * Pass the ALREADY-CAPPED candidate list — the member lookup is scoped to those
 * identities so a 50,000-member club costs the same as a 30-member one.
 *
 * Membership rows are written either as a linked `customerId` (when the person
 * exists as a Customer) or as a raw lower-cased `email`, and phone-only rows are
 * possible for hand-typed contacts — all three are matched, because a guest who
 * was added to the club by email is just as much a member as a linked one.
 *
 * Never throws: on a lookup failure it returns "nobody is a club member", which
 * degrades to the old behaviour (everyone gets the campaign) rather than
 * silently muting a restaurant's marketing.
 */
export async function resolveAutopilotAudience(
  restaurantId: string,
  identities: AudienceIdentity[],
): Promise<AutopilotAudience> {
  if (!identities.length) return NO_CLUBS;
  try {
    const clubs = await prisma.customerGroup.findMany({
      where: { restaurantId, skipAutopilotOffers: true },
      select: { id: true, name: true, memberLabel: true },
    });
    // The overwhelmingly common case — one cheap query and we're done.
    if (clubs.length === 0) return NO_CLUBS;

    const ids = [...new Set(identities.map((i) => i.customerId).filter((x): x is string => !!x))];
    const emails = [...new Set(identities.map((i) => lc(i.email)).filter((x): x is string => !!x))];
    const phones = [...new Set(identities.map((i) => (i.phone ?? "").trim()).filter(Boolean))];
    const or: Record<string, unknown>[] = [];
    if (ids.length) or.push({ customerId: { in: ids } });
    if (emails.length) or.push({ email: { in: emails } });
    if (phones.length) or.push({ phone: { in: phones } });
    if (!or.length) return NO_CLUBS;

    const rows = await prisma.customerGroupMember.findMany({
      where: { restaurantId, groupId: { in: clubs.map((c) => c.id) }, OR: or },
      select: { groupId: true, customerId: true, email: true, phone: true },
    });
    if (rows.length === 0) return { hasClubs: true, match: () => null, matchedCount: 0 };

    const clubById = new Map(clubs.map((c) => [c.id, c]));
    const byCustomerId = new Map<string, VipMatch>();
    const byEmail = new Map<string, VipMatch>();
    const byPhone = new Map<string, VipMatch>();
    for (const r of rows) {
      const club = clubById.get(r.groupId);
      if (!club) continue;
      const m: VipMatch = { groupName: club.name, memberLabel: club.memberLabel };
      // First club wins when someone is in two — the note only needs to name one.
      if (r.customerId && !byCustomerId.has(r.customerId)) byCustomerId.set(r.customerId, m);
      const e = lc(r.email);
      if (e && !byEmail.has(e)) byEmail.set(e, m);
      const p = (r.phone ?? "").trim();
      if (p && !byPhone.has(p)) byPhone.set(p, m);
    }

    const match = (identity: AudienceIdentity): VipMatch | null => {
      if (identity.customerId) {
        const hit = byCustomerId.get(identity.customerId);
        if (hit) return hit;
      }
      const e = lc(identity.email);
      if (e) {
        const hit = byEmail.get(e);
        if (hit) return hit;
      }
      const p = (identity.phone ?? "").trim();
      if (p) {
        const hit = byPhone.get(p);
        if (hit) return hit;
      }
      return null;
    };

    // Count distinct PEOPLE, not member rows: someone added both by email and by
    // being picked from the customer list has two rows but is one person, and a
    // person in two clubs is still one person.
    let matchedCount = 0;
    for (const i of identities) if (match(i)) matchedCount++;

    return { hasClubs: true, match, matchedCount };
  } catch (e) {
    console.error("[autopilot-audience] lookup failed — treating everyone as an ordinary customer", e);
    return NO_CLUBS;
  }
}

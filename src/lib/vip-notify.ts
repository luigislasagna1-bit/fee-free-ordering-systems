/**
 * Email a VIP group about a member-special (Program 3 Phase 1). Fire-and-forget
 * from the link/notify routes (wrap in `after()`); sends each member with an
 * email a tailored announcement — account holders are told to just sign in,
 * guests to enter their email at checkout (+ a nudge to make an account). The
 * special AUTO-APPLIES, so no code is sent.
 *
 * Scale seam: members are chunked so a large roster doesn't fan out unbounded.
 */
import prisma from "@/lib/db";
import { sendVipSpecialEmail } from "@/lib/email";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

function discountFromPromo(promo: { promotionType: string; ruleConfig: any }): { type: "percentage" | "fixed" | "other"; value?: number } {
  const rc = (promo.ruleConfig ?? {}) as any;
  if ((promo.promotionType === "percentage_off" || promo.promotionType === "percentage_combo") && typeof rc.discountPercent === "number") {
    return { type: "percentage", value: rc.discountPercent };
  }
  if ((promo.promotionType === "fixed_cart" || promo.promotionType === "fixed_combo") && typeof rc.discountAmount === "number") {
    return { type: "fixed", value: rc.discountAmount };
  }
  return { type: "other" };
}

/** How many members of this group have a usable email (for the synchronous
 *  "emailed N" response — the actual sends happen in the background). */
export async function countEmailableMembers(groupId: string): Promise<number> {
  return prisma.customerGroupMember.count({
    where: { groupId, OR: [{ email: { not: null } }, { customer: { email: { not: null } } }] },
  });
}

export async function notifyGroupOfSpecial(opts: { groupId: string; promotionId: string; restaurantId: string }): Promise<number> {
  const { groupId, promotionId, restaurantId } = opts;
  const [promo, restaurant, members] = await Promise.all([
    prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, name: true, description: true, promotionType: true, ruleConfig: true, minimumOrder: true, endsAt: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, slug: true, currency: true, defaultLanguage: true, email: true, phone: true, subdomain: true, customDomain: true, customDomainStatus: true },
    }),
    prisma.customerGroupMember.findMany({
      where: { groupId },
      take: 5000,
      select: { email: true, name: true, customer: { select: { email: true, name: true, passwordHash: true } } },
    }),
  ]);
  if (!promo || !restaurant) return 0;

  const disc = discountFromPromo(promo);
  const orderUrl = restaurantOrderUrl(restaurant, "");
  const targets = members
    .map((m) => ({
      email: m.email ?? m.customer?.email ?? null,
      name: m.name ?? m.customer?.name ?? null,
      hasAccount: !!m.customer?.passwordHash,
    }))
    .filter((m): m is { email: string; name: string | null; hasAccount: boolean } => !!m.email);

  let sent = 0;
  const CHUNK = 25;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map((tg) =>
      sendVipSpecialEmail({
        to: tg.email,
        customerName: tg.name ?? tg.email,
        restaurantName: restaurant.name,
        discountType: disc.type,
        discountValue: disc.value,
        dealName: promo.name,
        currency: restaurant.currency,
        minimumOrder: promo.minimumOrder ?? 0,
        expiresAt: promo.endsAt,
        description: promo.description,
        hasAccount: tg.hasAccount,
        orderUrl,
        restaurantUrl: orderUrl,
        restaurantEmail: restaurant.email,
        restaurantPhone: restaurant.phone,
        locale: restaurant.defaultLanguage,
      }),
    ));
    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else console.error("[vip-notify] one email failed:", r.reason);
    }
  }
  return sent;
}

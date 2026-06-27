/**
 * Email recipients about a VIP member-special (Program 3 Phase 1). Fire-and-forget
 * from the link/notify routes (wrap in `after()`); each recipient gets a tailored
 * announcement — account holders are told to just sign in, guests to enter their
 * email at checkout (+ a nudge to make an account). The special AUTO-APPLIES, so
 * no code is sent. Works for a whole GROUP or specific INDIVIDUALS.
 *
 * Scale seam: recipients are chunked so a large roster doesn't fan out unbounded.
 */
import prisma from "@/lib/db";
import { sendVipSpecialEmail } from "@/lib/email";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

export type SpecialRecipient = { email: string; name: string | null; hasAccount: boolean };

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

async function loadSpecialContext(promotionId: string, restaurantId: string) {
  const [promo, restaurant] = await Promise.all([
    prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, restaurantId: true, name: true, description: true, promotionType: true, ruleConfig: true, minimumOrder: true, endsAt: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, slug: true, currency: true, defaultLanguage: true, email: true, phone: true, subdomain: true, customDomain: true, customDomainStatus: true, vipMemberLabel: true },
    }),
  ]);
  if (!promo || promo.restaurantId !== restaurantId || !restaurant) return null;
  return { promo, restaurant, disc: discountFromPromo(promo), orderUrl: restaurantOrderUrl(restaurant, "") };
}

async function sendToRecipients(ctx: NonNullable<Awaited<ReturnType<typeof loadSpecialContext>>>, recipients: SpecialRecipient[]): Promise<number> {
  const { promo, restaurant, disc, orderUrl } = ctx;
  // De-dup by email so a person who is both an account and a pasted email isn't double-sent.
  const seen = new Set<string>();
  const list = recipients.filter((r) => r.email && !seen.has(r.email.toLowerCase()) && seen.add(r.email.toLowerCase()));
  let sent = 0;
  const CHUNK = 25;
  for (let i = 0; i < list.length; i += CHUNK) {
    const batch = list.slice(i, i + CHUNK);
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
        memberLabel: restaurant.vipMemberLabel,
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

/** How many members of a group have a usable email (synchronous "emailed N"). */
export async function countEmailableMembers(groupId: string): Promise<number> {
  return prisma.customerGroupMember.count({
    where: { groupId, OR: [{ email: { not: null } }, { customer: { email: { not: null } } }] },
  });
}

/** Email a whole group about a special. */
export async function notifyGroupOfSpecial(opts: { groupId: string; promotionId: string; restaurantId: string }): Promise<number> {
  const ctx = await loadSpecialContext(opts.promotionId, opts.restaurantId);
  if (!ctx) return 0;
  const members = await prisma.customerGroupMember.findMany({
    where: { groupId: opts.groupId },
    take: 5000,
    select: { email: true, name: true, customer: { select: { email: true, name: true, passwordHash: true } } },
  });
  const recipients = members
    .map((m) => ({
      email: m.email ?? m.customer?.email ?? null,
      name: m.name ?? m.customer?.name ?? null,
      hasAccount: !!m.customer?.passwordHash,
    }))
    .filter((r): r is SpecialRecipient => !!r.email);
  return sendToRecipients(ctx, recipients);
}

/** Email a specific set of individuals about a special. */
export async function notifyRecipientsOfSpecial(opts: { promotionId: string; restaurantId: string; recipients: SpecialRecipient[] }): Promise<number> {
  const ctx = await loadSpecialContext(opts.promotionId, opts.restaurantId);
  if (!ctx) return 0;
  return sendToRecipients(ctx, opts.recipients);
}

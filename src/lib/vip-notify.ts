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
import { sendVipSpecialEmail, sendVipGroupWelcomeEmail } from "@/lib/email";
import { getDict } from "@/lib/i18n-dict";
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
      // customerType decides WHICH instructions are truthful: "member" means the
      // engine refuses this deal for anyone not signed in, so the email must say
      // "sign in first" rather than "type your email at checkout". Omitting it
      // from this select is what let the email advertise a route checkout
      // rejects. Luigi 2026-07-31.
      select: { id: true, restaurantId: true, isActive: true, name: true, description: true, promotionType: true, ruleConfig: true, minimumOrder: true, endsAt: true, customerType: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, slug: true, currency: true, defaultLanguage: true, email: true, phone: true, subdomain: true, customDomain: true, customDomainStatus: true, vipMemberLabel: true },
    }),
  ]);
  // Fail safe: never email about an inactive promo — it would NEVER auto-apply at
  // checkout (both checkout paths load isActive:true only), so the recipient would
  // be promised a deal that does nothing. Skip all sends. Luigi 2026-06-27 (audit).
  if (!promo || promo.restaurantId !== restaurantId || !promo.isActive || !restaurant) return null;
  return { promo, restaurant, disc: discountFromPromo(promo), orderUrl: restaurantOrderUrl(restaurant, "") };
}

async function sendToRecipients(ctx: NonNullable<Awaited<ReturnType<typeof loadSpecialContext>>>, recipients: SpecialRecipient[], memberLabelOverride?: string | null): Promise<number> {
  const { promo, restaurant, disc, orderUrl } = ctx;
  // A GROUP can override "what you call your members" so its email reads e.g.
  // "As a Bruce Trail Staff…" instead of the restaurant default. Luigi 2026-06-30.
  const memberLabel = memberLabelOverride?.trim() || restaurant.vipMemberLabel;
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
        restaurantId: promo.restaurantId,
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
        // "Members only" = the engine requires a signed-in session, so the
        // email must instruct signing in rather than typing an address.
        requiresSignIn: promo.customerType === "member",
        orderUrl,
        restaurantUrl: orderUrl,
        restaurantEmail: restaurant.email,
        restaurantPhone: restaurant.phone,
        memberLabel,
        locale: restaurant.defaultLanguage,
      }),
    ));
    // send() reports failure by FULFILLING with { success: false } (it doesn't
    // reject), so "fulfilled" alone would count failed + dev-suppressed sends
    // — the owner would read "emailed 15 members" when nothing left.
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) sent++;
      else console.error("[vip-notify] one email failed:", r.status === "fulfilled" ? r.value.error : r.reason);
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
  const group = await prisma.customerGroup.findUnique({ where: { id: opts.groupId }, select: { memberLabel: true } });
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
  return sendToRecipients(ctx, recipients, group?.memberLabel);
}

/** Email a specific set of individuals about a special. */
export async function notifyRecipientsOfSpecial(opts: { promotionId: string; restaurantId: string; recipients: SpecialRecipient[] }): Promise<number> {
  const ctx = await loadSpecialContext(opts.promotionId, opts.restaurantId);
  if (!ctx) return 0;
  return sendToRecipients(ctx, opts.recipients);
}

/**
 * "You've been added to <group>" welcome, with the perks spelled out
 * (Luigi 2026-07-31 — members were added completely silently).
 *
 * The perk list is built from what the group ACTUALLY grants, so the email can
 * never promise something checkout won't honour:
 *   • the group's earn-rate override, resolved the same way the ledger does
 *     (a member's personal rate beats the group's, so we only advertise the
 *     group rate when it is genuinely the best they'd get);
 *   • every ACTIVE member special attached to the group (inactive ones never
 *     auto-apply, so mentioning them would be a lie — same rule as
 *     loadSpecialContext).
 *
 * Fire-and-forget from the routes (wrap in `after()`); chunked like the
 * special announcement so a big roster can't fan out unbounded.
 */
export async function notifyGroupWelcome(opts: {
  groupId: string;
  restaurantId: string;
  /** Limit to these member row ids — used to email ONLY the people just added
   *  (or one person on a manual resend). Omit to email the whole group. */
  memberIds?: string[];
}): Promise<number> {
  const [group, restaurant] = await Promise.all([
    prisma.customerGroup.findUnique({
      where: { id: opts.groupId },
      select: {
        id: true, restaurantId: true, name: true, memberLabel: true, rewardEarnPercent: true,
        // groupPromotions is the LINK table (the "Member specials" list on the
        // group page); `promotions` is a different, direct relation.
        groupPromotions: {
          select: { promotion: { select: { name: true, isActive: true, promotionType: true, ruleConfig: true } } },
        },
      },
    }),
    prisma.restaurant.findUnique({
      where: { id: opts.restaurantId },
      select: {
        name: true, slug: true, currency: true, defaultLanguage: true, email: true, phone: true,
        subdomain: true, customDomain: true, customDomainStatus: true, vipMemberLabel: true,
        rewardsEnabled: true, rewardEarnEnabled: true, rewardLabelPlural: true,
      },
    }),
  ]);
  if (!group || group.restaurantId !== opts.restaurantId || !restaurant) return 0;

  const t = await getDict(restaurant.defaultLanguage ?? "en");
  const orderUrl = restaurantOrderUrl(restaurant as any, "");
  const signupUrl = restaurantOrderUrl(restaurant as any, "/account/signup");

  // ── Perks ────────────────────────────────────────────────────────────────
  const perkLines: string[] = [];
  // Earn rate: only when rewards AND earning are switched on — with either off
  // the ledger never pays this rate, so advertising it would be false.
  if (restaurant.rewardsEnabled && restaurant.rewardEarnEnabled && (group.rewardEarnPercent ?? 0) > 0) {
    perkLines.push(t("email.vipGroupWelcome.perkEarnRate", {
      percent: group.rewardEarnPercent as number,
      label: restaurant.rewardLabelPlural?.trim() || t("email.vipGroupWelcome.defaultRewardLabel"),
    }));
  }
  for (const link of group.groupPromotions) {
    const p = link.promotion;
    if (!p?.isActive) continue;
    const rc = (p.ruleConfig ?? {}) as any;
    const pct = typeof rc.discountPercent === "number" ? rc.discountPercent : null;
    perkLines.push(
      pct != null
        ? t("email.vipGroupWelcome.perkPercent", { percent: pct, name: p.name })
        : t("email.vipGroupWelcome.perkNamed", { name: p.name }),
    );
  }
  // Nothing to announce → don't send a hollow "welcome, you get nothing".
  if (perkLines.length === 0) return 0;

  const members = await prisma.customerGroupMember.findMany({
    where: {
      groupId: opts.groupId,
      ...(opts.memberIds?.length ? { id: { in: opts.memberIds } } : {}),
    },
    take: 5000,
    select: { email: true, name: true, customer: { select: { email: true, name: true, passwordHash: true } } },
  });

  const seen = new Set<string>();
  const recipients = members
    .map((m) => ({
      email: (m.email ?? m.customer?.email ?? "").toLowerCase(),
      name: m.name ?? m.customer?.name ?? null,
      hasAccount: !!m.customer?.passwordHash,
    }))
    .filter((r) => r.email && !seen.has(r.email) && seen.add(r.email));

  const memberLabel = group.memberLabel?.trim() || restaurant.vipMemberLabel;
  let sent = 0;
  const CHUNK = 25;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const batch = recipients.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map((tg) =>
      sendVipGroupWelcomeEmail({
        to: tg.email,
        restaurantId: opts.restaurantId,
        customerName: tg.name ?? tg.email,
        restaurantName: restaurant.name,
        memberLabel,
        groupName: group.name,
        perkLines,
        // The restaurant's own word for its credit, so the email can draw the
        // one distinction that matters: discounts follow the typed address,
        // credit needs an account.
        rewardLabel: restaurant.rewardLabelPlural,
        hasAccount: tg.hasAccount,
        orderUrl,
        signupUrl,
        restaurantUrl: orderUrl,
        restaurantEmail: restaurant.email,
        restaurantPhone: restaurant.phone,
        locale: restaurant.defaultLanguage,
      }),
    ));
    // Same success-gating as sendToRecipients — fulfilled ≠ sent.
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) sent++;
      else console.error("[vip-notify] welcome email failed:", r.status === "fulfilled" ? r.value.error : r.reason);
    }
  }
  return sent;
}

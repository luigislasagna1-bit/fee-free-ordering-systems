/**
 * Kickstarter — Marketing Suite Phase 4
 *
 * The Kickstarter pillar of the marketing suite. Two campaigns:
 *
 *   First Buy Promo
 *     Auto-creates a "10% off your first order" pre-made promotion
 *     (Promotion row with campaignRef="kickstarter_first_buy") when
 *     the owner flips the toggle ON. Toggle OFF soft-disables the
 *     promo (isActive=false) but keeps the row so re-enable restores
 *     any owner edits.
 *
 *   Invite Prospects
 *     Owner uploads a CSV of prospect contacts; the hourly
 *     /api/cron/kickstarter-invites cron drips out invite emails in
 *     batches of 20-per-import (Resend rate-limit-friendly) using
 *     the KickstarterInviteEmail template.
 *
 * State lives in `KickstarterState` (one row per restaurant, upserted
 * lazily on first /admin/kickstarter visit + on any toggle PATCH).
 *
 * Why a lib (vs. inline in the route): the cron route also needs to
 * call sendInviteEmail(), and we want to keep the toggle semantics +
 * promo template in one place so future Claude doesn't accidentally
 * fork them.
 */

import prisma from "@/lib/db";
import { sendAutopilotEmail, setEmailImprint } from "@/lib/email";
import type { Prospect, Restaurant } from "@/generated/prisma/client";

/**
 * campaignRef tag used to identify pre-made promo rows owned by the
 * First Buy Promo campaign. Anywhere we need to look up "the
 * Kickstarter first-buy promo for this restaurant," use this constant
 * — not a hardcoded string at the callsite.
 */
export const KICKSTARTER_FIRST_BUY_REF = "kickstarter_first_buy";

/**
 * Default coupon code shown in the invite email. Customers can either
 * type it at checkout or click the CTA which auto-applies via
 * ?ref=kickstarter. Even with autoApply=true on the Promotion row, we
 * keep a code so the email reads as a tangible reward, not just an
 * abstract "10% off" promise.
 */
export const KICKSTARTER_FIRST_BUY_CODE = "FIRSTBUY";

/** Upsert + return the KickstarterState for a restaurant. */
export async function getOrCreateKickstarterState(restaurantId: string) {
  return prisma.kickstarterState.upsert({
    where: { restaurantId },
    update: {},
    create: { restaurantId },
  });
}

/**
 * Enable the First Buy Promo. Idempotent — calling twice is safe.
 * Returns the live Promotion row (existing or freshly created).
 */
export async function enableFirstBuyPromo(restaurantId: string) {
  await prisma.kickstarterState.upsert({
    where: { restaurantId },
    update: { firstBuyPromoEnabled: true },
    create: { restaurantId, firstBuyPromoEnabled: true },
  });

  // Look up existing row first. We deliberately match on (restaurantId +
  // campaignRef) — there can only be ONE first-buy promo per restaurant.
  const existing = await prisma.promotion.findFirst({
    where: { restaurantId, campaignRef: KICKSTARTER_FIRST_BUY_REF },
  });

  if (existing) {
    // Re-enable in case it was soft-disabled by a prior toggle-off.
    // Preserve any owner edits (name, description, discount %) made
    // since the original auto-create.
    if (!existing.isActive) {
      return prisma.promotion.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    return existing;
  }

  // Fresh create. Default ruleConfig matches the promo-engine contract
  // for promotionType=percentage_off → { discountPercent: number }.
  return prisma.promotion.create({
    data: {
      restaurantId,
      name: "First-time customer special",
      description: "10% off your first order — welcome!",
      promotionType: "percentage_off",
      isActive: true,
      stackingRule: "exclusive",
      orderType: "both",
      customerType: "new",
      minimumOrder: 0,
      ruleConfig: { discountPercent: 10 },
      autoApply: true,
      // Even though autoApply is true, we keep a memorable code so the
      // invite email can show it explicitly. The promo-engine evaluates
      // BOTH paths — auto-applied at checkout for new customers, AND
      // honored when typed manually.
      couponCode: KICKSTARTER_FIRST_BUY_CODE,
      campaignRef: KICKSTARTER_FIRST_BUY_REF,
    },
  });
}

/**
 * Disable the First Buy Promo. Soft-disables the Promotion row
 * (isActive=false) — we DON'T delete because the owner may flip the
 * toggle back on later and we want their edits preserved.
 */
export async function disableFirstBuyPromo(restaurantId: string) {
  await prisma.kickstarterState.upsert({
    where: { restaurantId },
    update: { firstBuyPromoEnabled: false },
    create: { restaurantId, firstBuyPromoEnabled: false },
  });
  // Scope to (restaurantId + campaignRef) so a malformed call can't
  // accidentally disable some other restaurant's promo.
  await prisma.promotion.updateMany({
    where: { restaurantId, campaignRef: KICKSTARTER_FIRST_BUY_REF },
    data: { isActive: false },
  });
}

/** Flip the Invite Prospects toggle ON. Doesn't do any send work — the
 *  cron handles batching. */
export async function enableInviteProspects(restaurantId: string) {
  await prisma.kickstarterState.upsert({
    where: { restaurantId },
    update: { inviteProspectsEnabled: true },
    create: { restaurantId, inviteProspectsEnabled: true },
  });
}

/** Flip the Invite Prospects toggle OFF. Existing imports stay in the
 *  DB but the cron skips this restaurant on the next pass. */
export async function disableInviteProspects(restaurantId: string) {
  await prisma.kickstarterState.upsert({
    where: { restaurantId },
    update: { inviteProspectsEnabled: false },
    create: { restaurantId, inviteProspectsEnabled: false },
  });
}

/**
 * Lightweight, dependency-free CSV parser. Handles:
 *   - Quoted fields with embedded commas
 *   - Escaped double quotes ("" → ")
 *   - CRLF or LF line endings
 *   - BOM at the start of the file
 *   - Empty trailing lines
 *
 * Returns rows as string[][]. Caller decides which row is the header
 * and how to map columns. We deliberately don't pull in papaparse —
 * keeps the bundle small + this CSV shape is simple (3 columns).
 */
export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") → literal quote
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // Swallow CR if followed by LF — treat CRLF as one line break
      if (text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush trailing field/row (no terminating newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (common from trailing blank lines)
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** Basic email regex. Not RFC 5322 — just rules out obviously bad
 *  inputs so we don't pass garbage to Resend. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send an invite email to one prospect. Used by the cron + by manual
 *  test triggers. Returns the underlying send result so the caller can
 *  track per-row errors. */
export async function sendInviteEmail(
  prospect: Pick<Prospect, "id" | "name" | "email">,
  restaurant: Pick<
    Restaurant,
    "id" | "name" | "slug" | "email" | "phone"
  > & { imprint?: string | null },
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  // The ?ref=kickstarter query param is what we'll attribute the
  // conversion to later (cross-checked against ProspectImport when an
  // order arrives from this prospect's email). The auto-apply happens
  // independently — the new-customer promo fires at checkout regardless
  // of the link they used. Keeping ref purely for attribution.
  const ctaUrl = baseUrl
    ? `${baseUrl}/order/${restaurant.slug}?ref=kickstarter`
    : `/order/${restaurant.slug}?ref=kickstarter`;

  const subject = `Try ${restaurant.name} — 10% off your first order`;

  // We reuse sendAutopilotEmail rather than calling Resend directly —
  // it already wires List-Unsubscribe (RFC 8058 required by Gmail/Yahoo
  // bulk rules), Reply-To-restaurant, and the per-restaurant whitelabel
  // imprint plumbing. The dedicated KickstarterInviteEmail template
  // (see src/emails/templates/KickstarterInviteEmail.tsx) exists as the
  // intended richer layout — TODO post-launch: refactor email.ts to
  // expose a sendHtml() primitive so we can swap the autopilot wrapper
  // for the dedicated template without losing the unsubscribe plumbing.
  if (restaurant.imprint) setEmailImprint(restaurant.imprint);
  try {
    return await sendAutopilotEmail({
      to: prospect.email,
      customerName: prospect.name ?? "there",
      restaurantName: restaurant.name,
      subject,
      // Body is rendered inside AutopilotEmail's pre-line block; keep
      // it brief and let the CTA do the heavy lifting.
      body: `We'd love to have you try ${restaurant.name}. As a welcome gift, here's 10% off your first order — use code ${KICKSTARTER_FIRST_BUY_CODE} at checkout (or it'll auto-apply when you click below).`,
      couponCode: KICKSTARTER_FIRST_BUY_CODE,
      couponLabel: "10% off your first order",
      ctaUrl,
      ctaLabel: "Start your order",
      restaurantUrl: baseUrl ? `${baseUrl}/order/${restaurant.slug}` : undefined,
      restaurantEmail: restaurant.email ?? undefined,
      restaurantPhone: restaurant.phone ?? undefined,
      // unsubscribeUrl: the prospect can unsubscribe by clicking the
      // List-Unsubscribe header (Gmail's "Unsubscribe" button) which
      // posts to the restaurant's ordering page with ?unsubscribe=1.
      // Server-side handler flips Prospect.unsubscribedAt so the cron
      // skips them next time.
      unsubscribeUrl: baseUrl
        ? `${baseUrl}/order/${restaurant.slug}?unsubscribe=1&prospect=${prospect.id}`
        : undefined,
    });
  } finally {
    if (restaurant.imprint) setEmailImprint(null);
  }
}

import "server-only";
import prisma from "@/lib/db";
import { loadMessages, isSupportedLocale } from "@/lib/i18n-server";
import { sendBillingNotificationEmail } from "@/lib/email";
import { hasAnyPaidAddOn } from "@/lib/entitlements";
import { FREE_PLAN_MONTHLY_CAP } from "@/lib/order-cap";

/**
 * FREE-plan order-cap owner notifications (Luigi 2026-06-16). Two best-effort,
 * fire-after-response emails so the owner isn't blindsided by the cap:
 *
 *   1. notifyCapWarning80 — ONE "you're approaching your limit" email per month,
 *      sent the first time usage lands in the 80-99 band. Guarded by
 *      Restaurant.capWarn80SentAt (reset to null on the monthly rollover in
 *      order-cap.ts, so it re-arms each month).
 *   2. notifyCapReached100 — "you're losing orders" alert when an order is
 *      actually turned away at the cap. Rate-limited to ~once / 3h via
 *      Restaurant.capBlockAlertSentAt.
 *
 * Both CLAIM their guard column (an atomic update) BEFORE composing/sending, so
 * two simultaneous orders can't double-send. Both swallow all errors — a missing
 * key, a dead address, or Resend being down must never affect the order flow.
 * Always call from inside `after()` (post-response) so there's zero added
 * latency on the customer-facing route. Mirrors src/lib/dunning-notify.ts.
 */

type Dict = Record<string, string>;

async function capDict(locale?: string | null): Promise<Dict> {
  const en = (((await loadMessages("en")) as any).orderCapNotify ?? {}) as Dict;
  if (!locale || !isSupportedLocale(locale) || locale === "en") return en;
  try {
    const loc = (((await loadMessages(locale)) as any).orderCapNotify ?? {}) as Dict;
    return { ...en, ...loc }; // en fills any key the locale is missing
  } catch {
    return en;
  }
}

/** Tiny {placeholder} interpolation — leaves unknown placeholders intact. */
function fill(s: string, vars: Record<string, string | number>): string {
  return (s ?? "").replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const addOnsUrl = () => `${process.env.NEXT_PUBLIC_APP_URL || ""}/admin/billing/add-ons`;

/** Localized "Month Day" for the reset date (e.g. "July 1"). Empty if unknown. */
function formatResetDate(resetAt: Date | null, locale?: string | null): string {
  if (!resetAt) return "";
  const tag = locale && isSupportedLocale(locale) ? locale : "en";
  try {
    return new Intl.DateTimeFormat(tag, { month: "long", day: "numeric" }).format(resetAt);
  } catch {
    return "";
  }
}

/**
 * Fire-and-forget: email the owner ONCE this month when usage crosses into the
 * 80-99 band. The caller should only invoke this when the post-increment count
 * is in that band (cheap gate), but we re-validate here and claim the guard
 * atomically so it's safe to call unconditionally too.
 */
export async function notifyCapWarning80(restaurantId: string): Promise<void> {
  try {
    if (await hasAnyPaidAddOn(restaurantId)) return; // paid add-on lifts the cap
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        email: true,
        defaultLanguage: true,
        currentMonthOrderCount: true,
        currentMonthResetAt: true,
        capWarn80SentAt: true,
      },
    });
    if (!r || !r.email) return;
    const count = r.currentMonthOrderCount;
    if (count < 80 || count >= FREE_PLAN_MONTHLY_CAP) return; // only the 80-99 band
    if (r.capWarn80SentAt) return; // already warned this month
    // Claim the slot FIRST so a simultaneous order can't also send.
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { capWarn80SentAt: new Date() },
    });
    const t = await capDict(r.defaultLanguage);
    await sendBillingNotificationEmail({
      to: r.email,
      restaurantName: r.name,
      subject: t.warnTitle,
      headline: t.warnTitle,
      body: fill(t.warnBody, {
        count,
        cap: FREE_PLAN_MONTHLY_CAP,
        remaining: FREE_PLAN_MONTHLY_CAP - count,
        resetDate: formatResetDate(r.currentMonthResetAt, r.defaultLanguage),
      }),
      ctaLabel: t.cta,
      ctaUrl: addOnsUrl(),
    });
  } catch (e) {
    console.error("[order-cap] notifyCapWarning80 failed:", e);
  }
}

const BLOCK_ALERT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // ~3h

/**
 * Fire-and-forget: alert the owner that an order was TURNED AWAY at the cap
 * ("you're losing orders"). Rate-limited to once per ~3h via capBlockAlertSentAt.
 * Called from the order/reservation rejection path (the restaurant is, by
 * definition, on the FREE-no-add-on combo there, so no exempt check needed).
 */
export async function notifyCapReached100(restaurantId: string): Promise<void> {
  try {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        email: true,
        defaultLanguage: true,
        currentMonthResetAt: true,
        capBlockAlertSentAt: true,
      },
    });
    if (!r || !r.email) return;
    const now = Date.now();
    if (r.capBlockAlertSentAt && now - r.capBlockAlertSentAt.getTime() < BLOCK_ALERT_COOLDOWN_MS) return;
    // Claim the slot first (rate-limit window) so concurrent rejections don't spam.
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { capBlockAlertSentAt: new Date() },
    });
    const t = await capDict(r.defaultLanguage);
    await sendBillingNotificationEmail({
      to: r.email,
      restaurantName: r.name,
      subject: t.blockTitle,
      headline: t.blockTitle,
      body: fill(t.blockBody, {
        cap: FREE_PLAN_MONTHLY_CAP,
        resetDate: formatResetDate(r.currentMonthResetAt, r.defaultLanguage),
      }),
      ctaLabel: t.cta,
      ctaUrl: addOnsUrl(),
    });
  } catch (e) {
    console.error("[order-cap] notifyCapReached100 failed:", e);
  }
}

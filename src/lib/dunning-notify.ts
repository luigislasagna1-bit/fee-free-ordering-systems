import "server-only";
import { loadMessages, isSupportedLocale } from "@/lib/i18n-server";
import { sendBillingNotificationEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

/**
 * Dunning notification senders (Luigi 2026-06-15). Compose the localized
 * `dunning` strings and fire them over the existing channels — email via
 * sendBillingNotificationEmail, text via sendSms — so there are no new
 * templates or providers. Every send is best-effort: a failure is logged and
 * never throws, so one bad address can't break the daily cron sweep.
 *
 * Locale: each recipient is messaged in their own restaurant's defaultLanguage,
 * with English as the fallback for any string a locale is missing.
 */

type Dict = Record<string, string>;

async function dunningDict(locale?: string | null): Promise<Dict> {
  const en = (((await loadMessages("en")) as any).dunning ?? {}) as Dict;
  if (!locale || !isSupportedLocale(locale) || locale === "en") return en;
  try {
    const loc = (((await loadMessages(locale)) as any).dunning ?? {}) as Dict;
    return { ...en, ...loc }; // en fills any key the locale is missing
  } catch {
    return en;
  }
}

/** Tiny {placeholder} interpolation — leaves unknown placeholders intact. */
function fill(s: string, vars: Record<string, string | number>): string {
  return (s ?? "").replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const base = () => process.env.NEXT_PUBLIC_APP_URL || "";
const billingUrl = () => `${base()}/admin/billing`;
const addOnsUrl = () => `${base()}/admin/billing/add-ons`;
const resellerUrl = () => `${base()}/reseller`;
const locationsUrl = () => `${base()}/admin/locations`;

/** Daily countdown to the restaurant owner (email + SMS) during grace. */
export async function sendOwnerCountdown(args: {
  to: string;
  restaurantName: string;
  locale?: string | null;
  phone?: string | null;
  daysLeft: number;
}) {
  const t = await dunningDict(args.locale);
  const url = billingUrl();
  try {
    await sendBillingNotificationEmail({
      to: args.to,
      restaurantName: args.restaurantName,
      subject: t.ownerSubject,
      headline: t.ownerHeadline,
      body: fill(t.ownerBody, { days: args.daysLeft }),
      ctaLabel: t.ownerCta,
      ctaUrl: url,
    });
  } catch (e) {
    console.error("[dunning] owner countdown email failed", e);
  }
  if (args.phone) {
    try {
      await sendSms({ to: args.phone, body: fill(t.ownerSms, { days: args.daysLeft, url }) });
    } catch (e) {
      console.error("[dunning] owner countdown sms failed", e);
    }
  }
}

/** One-time notice when grace has expired and paid features are paused. */
export async function sendOwnerDowngraded(args: {
  to: string;
  restaurantName: string;
  locale?: string | null;
}) {
  const t = await dunningDict(args.locale);
  try {
    await sendBillingNotificationEmail({
      to: args.to,
      restaurantName: args.restaurantName,
      subject: t.downgradedSubject,
      headline: t.downgradedHeadline,
      body: t.downgradedBody,
      ctaLabel: t.downgradedCta,
      ctaUrl: addOnsUrl(),
    });
  } catch (e) {
    console.error("[dunning] owner downgraded email failed", e);
  }
}

/** Alert the reseller that a restaurant in their network has a failed payment. */
export async function sendResellerAlert(args: {
  to: string;
  restaurantName: string;
  locale?: string | null;
}) {
  const t = await dunningDict(args.locale);
  try {
    await sendBillingNotificationEmail({
      to: args.to,
      restaurantName: args.restaurantName,
      subject: t.resellerSubject,
      headline: fill(t.resellerHeadline, { restaurant: args.restaurantName }),
      body: fill(t.resellerBody, { restaurant: args.restaurantName }),
      ctaLabel: t.resellerCta,
      ctaUrl: resellerUrl(),
    });
  } catch (e) {
    console.error("[dunning] reseller alert email failed", e);
  }
}

/** Warn a child location that its brand parent's Multi-Location plan is unpaid. */
export async function sendChildBrandWarning(args: {
  to: string;
  childName: string;
  brandName: string;
  locale?: string | null;
}) {
  const t = await dunningDict(args.locale);
  try {
    await sendBillingNotificationEmail({
      to: args.to,
      restaurantName: args.childName,
      subject: t.childWarnSubject,
      headline: fill(t.childWarnHeadline, { brand: args.brandName }),
      body: fill(t.childWarnBody, { child: args.childName, brand: args.brandName }),
      ctaLabel: t.childWarnCta,
      ctaUrl: locationsUrl(),
    });
  } catch (e) {
    console.error("[dunning] child brand-warning email failed", e);
  }
}

/** Tell a child location its brand link ended and it now self-manages. */
export async function sendChildBrandReset(args: {
  to: string;
  childName: string;
  brandName: string;
  locale?: string | null;
}) {
  const t = await dunningDict(args.locale);
  try {
    await sendBillingNotificationEmail({
      to: args.to,
      restaurantName: args.childName,
      subject: fill(t.childResetSubject, { child: args.childName }),
      headline: t.childResetHeadline,
      body: fill(t.childResetBody, { child: args.childName, brand: args.brandName }),
      ctaLabel: t.childResetCta,
      ctaUrl: locationsUrl(),
    });
  } catch (e) {
    console.error("[dunning] child brand-reset email failed", e);
  }
}

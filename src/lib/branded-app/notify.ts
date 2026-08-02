import "server-only";
import { loadMessages, isSupportedLocale } from "@/lib/i18n-server";
import { sendBillingNotificationEmail } from "@/lib/email";
import type { BrandedAppPlatformKind, BrandedAppStatus } from "./status";

/**
 * Branded Mobile App — owner-facing status emails (Luigi 2026-08-02).
 * Modeled line-for-line on src/lib/dunning-notify.ts: localized strings from
 * the `brandedApp.emails` namespace, delivered through the existing generic
 * sendBillingNotificationEmail template — no new template, no new provider.
 * Best-effort: failures log and never throw (a bad address must never break
 * a status transition).
 *
 * Locale: the restaurant's defaultLanguage, English filling any missing key.
 */

type Dict = Record<string, string>;

async function emailDict(locale?: string | null): Promise<Dict> {
  const en = ((((await loadMessages("en")) as any).brandedApp ?? {}).emails ?? {}) as Dict;
  if (!locale || !isSupportedLocale(locale) || locale === "en") return en;
  try {
    const loc = ((((await loadMessages(locale)) as any).brandedApp ?? {}).emails ?? {}) as Dict;
    return { ...en, ...loc };
  } catch {
    return en;
  }
}

function fill(s: string, vars: Record<string, string | number>): string {
  return (s ?? "").replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const statusUrl = () => `${process.env.NEXT_PUBLIC_APP_URL || ""}/admin/mobile-app`;

/** Statuses that email the restaurant (mirrors notificationsFor in status.ts). */
const OWNER_EMAILED: ReadonlySet<string> = new Set([
  "needs_owner",
  "building",
  "in_store_review",
  "live",
  "suspended",
]);

/**
 * Email the owner about a platform-status change. Key scheme per status:
 *   brandedApp.emails.{status}Subject / {status}Headline / {status}Body
 * Placeholders: {restaurant}, {platform} (localized store name), {storeUrl}.
 */
export async function sendBrandedAppStatusEmail(args: {
  to: string;
  restaurantName: string;
  locale?: string | null;
  platform: BrandedAppPlatformKind;
  toStatus: BrandedAppStatus;
  storeUrl?: string | null;
}): Promise<void> {
  if (!OWNER_EMAILED.has(args.toStatus)) return;
  const t = await emailDict(args.locale);
  const platformName = args.platform === "ios" ? t.platformIos : t.platformAndroid;
  const vars = {
    restaurant: args.restaurantName,
    platform: platformName ?? args.platform,
    storeUrl: args.storeUrl ?? statusUrl(),
  };
  const key = (suffix: string) => t[`${camel(args.toStatus)}${suffix}`] ?? "";
  try {
    await sendBillingNotificationEmail({
      to: args.to,
      restaurantName: args.restaurantName,
      subject: fill(key("Subject"), vars),
      headline: fill(key("Headline"), vars),
      body: fill(key("Body"), vars),
      ctaLabel: args.toStatus === "live" && args.storeUrl ? t.liveCta : t.statusCta,
      ctaUrl: args.toStatus === "live" && args.storeUrl ? args.storeUrl : statusUrl(),
    });
  } catch (e) {
    console.error("[branded-app] status email failed", e);
  }
}

function camel(status: BrandedAppStatus): string {
  const parts = status.split("_");
  return parts[0] + parts.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

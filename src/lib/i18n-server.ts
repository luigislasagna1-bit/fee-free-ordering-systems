import { cookies, headers } from "next/headers";
import prisma from "@/lib/db";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/locales";

// Single source of truth lives in src/lib/locales.ts. Re-export so callers
// of "@/lib/i18n-server" keep resolving the same names.
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/locales";

/**
 * Resolve the effective locale for the current request.
 *
 * Order of precedence:
 *  1. fee-free-locale cookie  (customer's explicit choice, or auth-page picker)
 *  2. opts.restaurantId → restaurant.defaultLanguage  (admin/kitchen/customer pages
 *     drive language from the per-restaurant setting when no cookie)
 *  3. Accept-Language header  (auth pages with no session)
 *  4. "en"  (final fallback)
 */
export async function resolveLocale(opts?: { restaurantId?: string | null }): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("fee-free-locale")?.value;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;

  if (opts?.restaurantId) {
    try {
      const r = await prisma.restaurant.findUnique({
        where: { id: opts.restaurantId },
        select: { defaultLanguage: true },
      });
      if (isSupportedLocale(r?.defaultLanguage)) return r.defaultLanguage as Locale;
    } catch {
      // Non-fatal; fall through to header / default.
    }
  }

  const h = await headers();
  const accept = h.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().split(/[-;]/)[0]?.toLowerCase();
    if (isSupportedLocale(code)) return code;
  }

  return DEFAULT_LOCALE;
}

/** Cookie that stores a STAFF member's own UI-language choice (admin + kitchen).
 *  Deliberately SEPARATE from the customer `fee-free-locale` cookie so that
 *  changing the customer-facing language (or a customer/owner previewing the
 *  ordering page in another language) never flips the staff console. */
export const STAFF_LOCALE_COOKIE = "ff-staff-locale";

/**
 * Resolve the locale for STAFF-facing surfaces (admin console, kitchen display).
 *
 * Unlike resolveLocale(), this is strictly PER-USER and never inherits
 * `restaurant.defaultLanguage` (which is the CUSTOMER-facing default) nor the
 * customer `fee-free-locale` cookie. So one person changing the customer
 * language — or the restaurant's default — can't suddenly turn another staff
 * member's admin Italian. Luigi 2026-06-05.
 *
 * Order of precedence:
 *  1. ff-staff-locale cookie  (this staff member's explicit choice)
 *  2. Accept-Language header   (their browser's language)
 *  3. "en"                     (final fallback)
 */
export async function resolveStaffLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(STAFF_LOCALE_COOKIE)?.value;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;

  const h = await headers();
  const accept = h.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().split(/[-;]/)[0]?.toLowerCase();
    if (isSupportedLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export async function loadMessages(locale: Locale) {
  return (await import(`@/messages/${locale}.json`)).default;
}

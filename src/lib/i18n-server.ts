import { cookies, headers } from "next/headers";
import prisma from "@/lib/db";

export const SUPPORTED_LOCALES = ["en", "fr", "es", "it", "pt"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

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

export async function loadMessages(locale: Locale) {
  return (await import(`@/messages/${locale}.json`)).default;
}

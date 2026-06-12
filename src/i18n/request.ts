import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/locales";

// Single source of truth lives in src/lib/locales.ts. Re-export so existing
// importers of "@/i18n/request" keep resolving.
export {
  SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, RTL_LOCALES,
  isSupportedLocale, isRtlLocale, LOCALE_OPTIONS, type Locale,
} from "@/lib/locales";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();

  // ── Staff area vs customer area ─────────────────────────────────────────
  // This resolver powers every bare getTranslations()/useTranslations call on
  // the SERVER. Historically it only read the CUSTOMER cookie
  // (fee-free-locale), which made admin pages BILINGUAL for any owner who had
  // ever browsed their own ordering page in another language: client
  // components followed the staff locale (the admin layout's provider) while
  // server components followed the stale customer cookie — e.g. an English
  // admin with an Italian "Promozioni e Coupon" title (Luigi 2026-06-11).
  // Admin server components must resolve EXACTLY like the admin layout:
  // staff cookie → restaurant default → browser → en. The proxy attaches
  // x-pathname to every /admin request, so the branch is reliable; /kitchen,
  // /superadmin and /reseller have no server getTranslations callers today
  // (verified), and customer surfaces keep fee-free-locale behaviour
  // unchanged.
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const isStaffArea = pathname === "/admin" || pathname.startsWith("/admin/");

  let locale: Locale;
  if (isStaffArea) {
    // Mirror src/app/admin/layout.tsx: resolveStaffLocale(restaurantDefault).
    // Session + restaurant lookups are best-effort — any failure falls back
    // to cookie/browser/en rather than breaking the page. Dynamic imports
    // keep prisma/next-auth off the customer-page hot path entirely.
    let restaurantDefault: string | null = null;
    try {
      const { getSessionUser } = await import("@/lib/session");
      const user = await getSessionUser();
      if (user?.restaurantId) {
        const prisma = (await import("@/lib/db")).default;
        const r = await prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: { defaultLanguage: true },
        });
        restaurantDefault = r?.defaultLanguage ?? null;
      }
    } catch {
      // Best-effort only.
    }
    const { resolveStaffLocale } = await import("@/lib/i18n-server");
    locale = await resolveStaffLocale(restaurantDefault);
  } else {
    const cookieLocale = cookieStore.get("fee-free-locale")?.value;
    locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  }

  const messages = (await import(`@/messages/${locale}.json`)).default;
  return { locale, messages };
});

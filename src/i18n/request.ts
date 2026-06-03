import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/locales";

// Single source of truth lives in src/lib/locales.ts. Re-export so existing
// importers of "@/i18n/request" keep resolving.
export {
  SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, RTL_LOCALES,
  isSupportedLocale, isRtlLocale, LOCALE_OPTIONS, type Locale,
} from "@/lib/locales";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("fee-free-locale")?.value;
  const locale: Locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const messages = (await import(`@/messages/${locale}.json`)).default;
  return { locale, messages };
});

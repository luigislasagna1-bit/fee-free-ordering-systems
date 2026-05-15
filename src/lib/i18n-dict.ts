/**
 * Translation lookup for non-React server contexts (receipt rendering, email
 * sending). React components use `useTranslations` from next-intl; this helper
 * exists for code paths like print routes and email sending where the
 * translator function isn't already wired in via a provider.
 *
 * Usage:
 *   const t = await getDict(locale);
 *   t("receipt.customer.subtotal");
 *   t("email.orderConfirmed.subject", { orderNumber: "123" });
 */
import { isSupportedLocale, type Locale } from "./i18n-server";

type AnyDict = Record<string, unknown>;

const cache = new Map<Locale, AnyDict>();

async function load(locale: Locale): Promise<AnyDict> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const messages = (await import(`@/messages/${locale}.json`)).default as AnyDict;
  cache.set(locale, messages);
  return messages;
}

function lookup(dict: AnyDict, dottedKey: string): unknown {
  return dottedKey.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as AnyDict)[part];
    return undefined;
  }, dict);
}

export interface Translator {
  (key: string, vars?: Record<string, string | number>): string;
  /** Look up a non-string node — useful for arrays like FAQ items. */
  raw<T = unknown>(key: string): T | undefined;
  locale: Locale;
}

export async function getDict(rawLocale: string | null | undefined): Promise<Translator> {
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en";
  const dict = await load(locale);
  // Always load English as the fallback so missing keys don't render as the
  // raw key path.
  const en = locale === "en" ? dict : await load("en");

  const fn = ((key: string, vars?: Record<string, string | number>) => {
    let value = lookup(dict, key);
    if (typeof value !== "string") value = lookup(en, key);
    if (typeof value !== "string") return key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = (value as string).replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value as string;
  }) as Translator;

  fn.raw = <T,>(key: string): T | undefined => {
    const v = lookup(dict, key);
    return (v === undefined ? lookup(en, key) : v) as T | undefined;
  };
  fn.locale = locale;
  return fn;
}

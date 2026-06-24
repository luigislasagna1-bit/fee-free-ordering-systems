import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { resolveResellerBranding, type ResellerBranding } from "@/lib/reseller-branding";
import { isNeutralResellerHost } from "@/lib/restaurant-url";
import { LoginForm } from "./LoginForm";

/**
 * Robots metadata — when a reseller's custom domain serves this page,
 * we DON'T want Google indexing `partner.com/login` as a duplicate of
 * the canonical `feefreeordering.com/login`. Both URLs render the
 * same login form (only the chrome differs), so duplicate-content
 * penalties + brand confusion would be real risks.
 *
 * The proxy rewrites `partner.com/<anything>` to `/login?reseller=<id>`,
 * so the presence of the `reseller` query param is our signal that
 * a reseller domain is in play. We noindex in that case and leave
 * the canonical login page indexable as usual.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ reseller?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  // On the NEUTRAL reseller host (restaurantownerlogin.com) the de-branded
  // "Restaurant Login" tab title is set by src/app/login/layout.tsx. We must
  // NOT set `title` here — the page segment is more specific than the layout,
  // so a page title would override the neutral one. Defer the title to the
  // layout in that case; still keep robots noindex (a shared login host should
  // never be indexed any more than a reseller-branded one).
  const host = (await headers()).get("host");
  if (isNeutralResellerHost(host)) {
    return {
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }
  if (sp.reseller) {
    return {
      title: "Sign in",
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }
  return { title: "Sign in" };
}

/**
 * Login page server shell.
 *
 * When accessed via a reseller's verified custom domain, the proxy
 * rewrites the URL to /login?reseller=<resellerProfileId>. We resolve
 * the reseller's branding fields (logo + brandLoginTitle) server-side
 * and pass them to the form so the page renders with the partner's
 * brand instead of the default Fee Free Ordering chrome.
 *
 * Resellers without the white-label Full tier never reach this code
 * path — the resolver only emits resellerProfileId when their
 * customDomainStatus is "verified" AND whiteLabelStatus is "active"
 * AND whiteLabelTier is "full". A lapsed subscription stops the
 * proxy from routing the domain (which prevents this query) so the
 * white-label experience is automatically revoked.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reseller?: string; registered?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);

  // Neutral reseller login host (restaurantownerlogin.com) — the SHARED
  // de-branded login for FREE reseller partners. It carries no per-reseller
  // brand, so we DON'T resolve ?reseller= branding here (the host is generic);
  // we just render the neutral chrome (no Fee Free Ordering, no partner logo).
  const host = (await headers()).get("host");
  const isNeutral = isNeutralResellerHost(host);

  // Resolve reseller-branded chrome (logo + title + company name + brand
  // colors) via the shared resolver. Gated on an ACTIVE white-label sub for an
  // APPROVED reseller (both Basic + Full unlock the imprint/logo; custom domains
  // are Full-gated upstream at the proxy). resellerScopeId is passed to the form
  // so NextAuth's authorize() hook can enforce scope (only users belonging to
  // this reseller can sign in here); referralCode powers the reseller-aware
  // "Sign up" link → /signup?reseller=<scopeId>. Skipped on the neutral host
  // (no per-reseller ?reseller= context there).
  const resolved = isNeutral ? null : await resolveResellerBranding(sp.reseller);
  const branding: ResellerBranding | null = resolved?.branding ?? null;
  const resellerScopeId: string | null = resolved?.resellerScopeId ?? null;
  const referralCode: string | null = resolved?.referralCode ?? null;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LoginForm
        locale={locale}
        branding={branding}
        resellerScopeId={resellerScopeId}
        referralCode={referralCode}
        isNeutral={isNeutral}
      />
    </NextIntlClientProvider>
  );
}

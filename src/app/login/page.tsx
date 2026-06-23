import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import { resolveResellerBranding, type ResellerBranding } from "@/lib/reseller-branding";
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

  // Resolve reseller-branded chrome (logo + title + company name + brand
  // colors) via the shared resolver. Gated on an ACTIVE white-label sub for an
  // APPROVED reseller (both Basic + Full unlock the imprint/logo; custom domains
  // are Full-gated upstream at the proxy). resellerScopeId is passed to the form
  // so NextAuth's authorize() hook can enforce scope (only users belonging to
  // this reseller can sign in here); referralCode powers the reseller-aware
  // "Sign up" link → /signup?reseller=<scopeId>.
  const resolved = await resolveResellerBranding(sp.reseller);
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
      />
    </NextIntlClientProvider>
  );
}

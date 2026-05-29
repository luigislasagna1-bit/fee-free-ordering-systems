import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import prisma from "@/lib/db";
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

  let branding: { logoUrl: string | null; title: string | null; companyName: string | null } | null = null;
  let resellerScopeId: string | null = null;
  if (sp.reseller && /^[a-z0-9-]{20,40}$/i.test(sp.reseller)) {
    // Branding shows for ANY active white-label tier — both Basic and
    // Full unlock the imprint/logo. (Custom domains require Full at
    // the proxy level; Generic subdomains work on either tier. So a
    // Basic-tier reseller's generic subdomain MUST still resolve to
    // branding here — previously we filtered on whiteLabelTier: "full"
    // which silently broke Basic-tier branding.)
    const r = await prisma.resellerProfile.findFirst({
      where: {
        id: sp.reseller,
        whiteLabelStatus: "active",
        status: "approved",
      },
      select: { id: true, brandLogoUrl: true, brandLoginTitle: true, companyName: true },
    });
    if (r) {
      branding = {
        logoUrl: r.brandLogoUrl,
        title: r.brandLoginTitle,
        companyName: r.companyName,
      };
      // We pass the resellerProfileId to the form so it can include it
      // as a credential on sign-in. The NextAuth authorize() hook uses
      // it to enforce scope: only users belonging to this reseller
      // (their own admin, their restaurants, staff under them) can
      // authenticate here.
      resellerScopeId = r.id;
    }
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LoginForm
        locale={locale}
        branding={branding}
        resellerScopeId={resellerScopeId}
      />
    </NextIntlClientProvider>
  );
}

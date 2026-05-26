import { NextIntlClientProvider } from "next-intl";
import { resolveLocale, loadMessages } from "@/lib/i18n-server";
import prisma from "@/lib/db";
import { LoginForm } from "./LoginForm";

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
  if (sp.reseller && /^[a-z0-9-]{20,40}$/i.test(sp.reseller)) {
    const r = await prisma.resellerProfile.findFirst({
      where: {
        id: sp.reseller,
        whiteLabelStatus: "active",
        whiteLabelTier: "full",
        status: "approved",
      },
      select: { brandLogoUrl: true, brandLoginTitle: true, companyName: true },
    });
    if (r) {
      branding = {
        logoUrl: r.brandLogoUrl,
        title: r.brandLoginTitle,
        companyName: r.companyName,
      };
    }
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LoginForm locale={locale} branding={branding} />
    </NextIntlClientProvider>
  );
}

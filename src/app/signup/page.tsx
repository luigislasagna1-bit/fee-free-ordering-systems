import { resolveLocale } from "@/lib/i18n-server";
import { SignupForm } from "./SignupForm";
import prisma from "@/lib/db";

/**
 * Signup page. Accepts an optional `?invite=<token>` query param which
 * pre-fills "I'm joining the X brand as a new location" context. When the
 * token is valid, the form shows a banner with the brand name and pre-fills
 * the suggested location name if the inviter provided one. The token is
 * passed through to /api/auth/register, which stamps parentRestaurantId
 * on the new Restaurant.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; ref?: string; claim?: string }>;
}) {
  const locale = await resolveLocale();
  const params = await searchParams;
  const inviteToken = params.invite?.trim() || null;
  // Import-to-try claim token (?claim=<token>) — the visitor is claiming a sandbox
  // restaurant they built on /import; pre-fill its name so signup attaches it.
  const claimToken = params.claim?.trim() || null;

  // Reseller referral code (?ref=<code>). The reseller's share link is
  // /signup?ref=<code>; we capture it here and hand it to the form so it can
  // forward it to /api/auth/register, which stamps resellerProfileId on the
  // new restaurant. This hand-off was MISSING — the form never read or sent
  // the ref, and nothing set the feefree_ref cookie, so every reseller signup
  // was silently recorded as a direct (unattributed) signup. Fabrizio 2026-06-16.
  const refCode = params.ref?.trim() || null;

  let inviteContext: {
    token: string;
    brandName: string;
    suggestedName: string | null;
    suggestedEmail: string | null;
    expired: boolean;
    used: boolean;
  } | null = null;

  if (inviteToken) {
    const invite = await prisma.locationInvite.findUnique({
      where: { token: inviteToken },
      include: { brand: { select: { name: true } } },
    });
    if (invite) {
      inviteContext = {
        token: inviteToken,
        brandName: invite.brand.name,
        suggestedName: invite.suggestedName,
        suggestedEmail: invite.email,
        expired: invite.expiresAt < new Date(),
        used: !!invite.acceptedAt,
      };
    }
  }

  let claimContext: {
    token: string;
    suggestedName: string | null;
    expired: boolean;
    used: boolean;
  } | null = null;

  if (claimToken) {
    const sb = await prisma.sandboxRestaurant.findUnique({
      where: { claimToken },
      include: { restaurant: { select: { name: true } } },
    });
    if (sb) {
      claimContext = {
        token: claimToken,
        suggestedName: sb.restaurant?.name ?? null,
        expired: sb.expiresAt < new Date(),
        used: !!sb.claimedAt,
      };
    }
  }

  return <SignupForm locale={locale} inviteContext={inviteContext} refCode={refCode} claimContext={claimContext} />;
}

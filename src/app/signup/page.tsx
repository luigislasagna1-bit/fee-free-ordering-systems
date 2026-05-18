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
  searchParams: Promise<{ invite?: string }>;
}) {
  const locale = await resolveLocale();
  const params = await searchParams;
  const inviteToken = params.invite?.trim() || null;

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

  return <SignupForm locale={locale} inviteContext={inviteContext} />;
}

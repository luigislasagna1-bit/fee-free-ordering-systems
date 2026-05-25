import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { LogoClient } from "./LogoClient";

/**
 * /reseller/branding/logo
 *
 * Logo upload + management. The uploaded image is stored on Vercel
 * Blob (or local public/uploads/reseller/... in dev) and the URL is
 * persisted on ResellerProfile.brandLogoUrl.
 *
 * Currently the logo is rendered in the email footer above the
 * "Powered by <imprint>" line, sized small (~24px tall) so it shows
 * partner brand presence without overpowering the email body.
 *
 * Future surfaces (Phase 2b+): branded login page hero, custom
 * domain landing pages.
 */
export default async function ResellerLogoPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      brandLogoUrl: true,
      whiteLabelStatus: true,
      whiteLabelTier: true,
    },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  // Paywall — needs an active White-Label subscription (basic or full).
  const wlActive = profile.whiteLabelStatus === "active" &&
    (profile.whiteLabelTier === "basic" || profile.whiteLabelTier === "full");
  if (!wlActive) redirect("/reseller/branding");

  return <LogoClient initialLogoUrl={profile.brandLogoUrl ?? null} />;
}

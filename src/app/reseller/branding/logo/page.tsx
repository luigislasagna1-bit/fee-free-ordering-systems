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
      brandLoginBgUrl: true,
    },
  });
  // Logo editor is FREE for any APPROVED reseller — no white-label
  // subscription gate (Luigi 2026-06-23 restructure: imprint + logo are
  // the free de-brand tier). Unapproved resellers go back to holding.
  if (profile?.status !== "approved") redirect("/reseller/holding");

  return (
    <LogoClient
      initialLogoUrl={profile.brandLogoUrl ?? null}
      initialLoginBgUrl={profile.brandLoginBgUrl ?? null}
    />
  );
}

import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { ImprintClient } from "./ImprintClient";

/**
 * /reseller/branding/imprint
 *
 * Imprint editor — the reseller sets a single line of contact info that
 * gets appended to receipts + transactional emails for every restaurant
 * attributed to them. GloriaFood PartnerNet's equivalent shows up as
 * "Supported by Partner Name LLC | contact@partner.com | +1234567890"
 * in receipt footers.
 *
 * Phase 1 ships persistence + email/receipt rendering; Phase 2 gates the
 * feature behind a paid white-label subscription. For now anyone with
 * an approved ResellerProfile can set it.
 */
export default async function ResellerImprintPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      imprint: true,
      companyName: true,
      whiteLabelStatus: true,
      whiteLabelTier: true,
    },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  // Paywall — the editor requires an active White-Label subscription
  // (basic or full). Send unpaid resellers to the overview page where
  // they can subscribe.
  const wlActive = profile.whiteLabelStatus === "active" &&
    (profile.whiteLabelTier === "basic" || profile.whiteLabelTier === "full");
  if (!wlActive) redirect("/reseller/branding");

  return (
    <ImprintClient
      initialImprint={profile.imprint ?? ""}
      companyName={profile.companyName ?? null}
    />
  );
}

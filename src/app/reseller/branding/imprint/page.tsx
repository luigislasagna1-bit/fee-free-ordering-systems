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
 * FREE for any approved reseller (Luigi 2026-06-23 restructure). The imprint +
 * logo are the free "de-brand" tier — no paid subscription required. Only the
 * paid "Branded" tier ($19.99/mo) gates the login page + custom domain.
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
    },
  });
  // Imprint editor is FREE for any APPROVED reseller — no white-label
  // subscription gate. Unapproved resellers go back to holding.
  if (profile?.status !== "approved") redirect("/reseller/holding");

  return (
    <ImprintClient
      initialImprint={profile.imprint ?? ""}
      companyName={profile.companyName ?? null}
    />
  );
}

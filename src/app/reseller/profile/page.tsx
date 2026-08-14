import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { decrypt } from "@/lib/encrypt";
import { buildResellerReferralUrl } from "@/lib/reseller/referral-url";
import { ProfileClient } from "./ProfileClient";

export default async function ResellerProfilePage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!profile) redirect("/reseller/holding");

  let payoutDetailsDecrypted: string | null = null;
  if (profile.payoutDetails && profile.payoutDetailsIv && profile.payoutDetailsTag && process.env.ENCRYPTION_KEY) {
    try {
      payoutDetailsDecrypted = decrypt(profile.payoutDetails, profile.payoutDetailsIv, profile.payoutDetailsTag);
    } catch {
      payoutDetailsDecrypted = null;
    }
  }

  // Referral link on the partner's OWN most-branded host — a paid Branded partner used to
  // be shown feefreeordering.com here despite paying for a custom domain. See
  // src/lib/reseller/referral-url.ts.
  const referral = buildResellerReferralUrl(profile);

  return (
    <ProfileClient
      initial={{
        email: profile.user.email,
        name: profile.user.name ?? "",
        companyName: profile.companyName ?? "",
        website: profile.website ?? "",
        country: profile.country ?? "",
        payoutMethod: (profile.payoutMethod as "paypal" | "bank" | "other" | null) ?? null,
        payoutDetails: payoutDetailsDecrypted,
        referralCode: profile.referralCode,
        referralUrl: referral.url,
      }}
    />
  );
}

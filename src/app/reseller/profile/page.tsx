import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isResellerPartner } from "@/lib/roles";
import { decrypt } from "@/lib/encrypt";
import { ProfileClient } from "./ProfileClient";

export default async function ResellerProfilePage() {
  const user = await getSessionUser();
  if (!user || !isResellerPartner(user.role) || !user.resellerProfileId) {
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

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
        referralUrl: `${baseUrl}/signup?ref=${profile.referralCode}`,
      }}
    />
  );
}

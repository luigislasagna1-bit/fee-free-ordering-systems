/**
 * Reseller application-status notification helper.
 *
 * Shared by /api/partners/apply (variant="received") and the superadmin
 * approve / reject endpoints (variant="approved" / "rejected") so the
 * applicant gets a transactional email at each lifecycle transition.
 *
 * Fire-and-forget — the email is dispatched without await blocking the
 * API response. If the email fails (Resend down, recipient bounced),
 * the underlying state change still succeeds; we just log and move on.
 */
import prisma from "@/lib/db";
import { sendResellerApplicationStatusEmail, setEmailImprint } from "@/lib/email";

type Variant = "received" | "approved" | "rejected";

/**
 * Look up the applicant + send the right variant.
 *
 * @param resellerProfileId  ResellerProfile.id
 * @param variant            Which lifecycle event fired
 * @param rejectionReason    Only relevant when variant === "rejected"
 */
export async function notifyResellerOfApplicationChange(
  resellerProfileId: string,
  variant: Variant,
  rejectionReason?: string | null,
): Promise<void> {
  try {
    const profile = await prisma.resellerProfile.findUnique({
      where: { id: resellerProfileId },
      select: {
        companyName: true,
        referralCode: true,
        user: { select: { email: true, name: true } },
      },
    });
    if (!profile?.user?.email) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const recipientName =
      profile.user.name?.split(" ")[0] ||
      profile.companyName ||
      "there";
    // On approval, include the shareable referral URL so the partner can
    // start sending it to restaurants right away without an extra step.
    const referralUrl =
      variant === "approved" && profile.referralCode
        ? `${baseUrl}/signup?ref=${profile.referralCode}`
        : null;
    const dashboardUrl =
      variant === "approved"
        ? `${baseUrl}/reseller`
        : `${baseUrl}/login`;

    await sendResellerApplicationStatusEmail({
      to: profile.user.email,
      variant,
      recipientName,
      companyName: profile.companyName,
      referralCode: variant === "approved" ? profile.referralCode : null,
      referralUrl,
      rejectionReason: variant === "rejected" ? rejectionReason ?? null : null,
      dashboardUrl,
    });
  } catch (err) {
    console.error("[reseller-application-notify] failed", { resellerProfileId, variant, err });
  } finally {
    setEmailImprint(null);
  }
}

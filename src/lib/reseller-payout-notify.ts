/**
 * Reseller payout-status notification helper.
 *
 * Shared by the three superadmin payout API routes (approve / mark-paid
 * / reject) so the customer-facing communication is consistent and we
 * only have one place to update if the payload changes.
 *
 * Fire-and-forget — the email is dispatched without await blocking the
 * API response. If the email fails (Resend down, recipient bounced),
 * the payout state change is unaffected and we just log the error.
 * Resellers can still see the new state on their dashboard.
 */
import prisma from "@/lib/db";
import { sendResellerPayoutNotificationEmail, setEmailImprint } from "@/lib/email";

const PAYOUT_METHOD_LABELS: Record<string, string> = {
  paypal: "PayPal",
  stripe: "Stripe",
  bank_transfer: "Bank transfer",
  wise: "Wise",
  check: "Check",
};

export function fmtPayoutMethod(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return PAYOUT_METHOD_LABELS[raw] ?? raw;
}

export function fmtAmountCents(cents: number, currency: string = "usd"): string {
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toUpperCase() + " ";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/**
 * Look up the reseller's contact + dispatch the right notification email.
 * Returns nothing — caller doesn't need to wait for delivery and
 * shouldn't block the API response on it. Errors are logged in-flight.
 */
export async function notifyResellerOfPayoutChange(
  payoutId: string,
  variant: "approved" | "paid" | "rejected",
): Promise<void> {
  try {
    const payout = await prisma.payoutRequest.findUnique({
      where: { id: payoutId },
      select: {
        amountCents: true,
        currency: true,
        payoutReference: true,
        rejectedReason: true,
        notes: true,
        resellerProfile: {
          select: {
            payoutMethod: true,
            companyName: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
    });
    if (!payout?.resellerProfile?.user?.email) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const recipientName =
      payout.resellerProfile.user.name?.split(" ")[0] ||
      payout.resellerProfile.companyName ||
      "there";

    await sendResellerPayoutNotificationEmail({
      to: payout.resellerProfile.user.email,
      variant,
      recipientName,
      amount: fmtAmountCents(payout.amountCents, payout.currency),
      payoutMethod: fmtPayoutMethod(payout.resellerProfile.payoutMethod),
      payoutReference: variant === "paid" ? payout.payoutReference : null,
      rejectionReason: variant === "rejected" ? payout.rejectedReason : null,
      notes: payout.notes,
      dashboardUrl: `${baseUrl}/reseller/payouts`,
    });
  } catch (err) {
    console.error("[reseller-payout-notify] failed", { payoutId, variant, err });
  } finally {
    // Clear the imprint regardless of whether send() set it — defensive
    // since we don't currently use whitelabel imprints for reseller
    // emails, but if we ever do this prevents leakage to the next send.
    setEmailImprint(null);
  }
}

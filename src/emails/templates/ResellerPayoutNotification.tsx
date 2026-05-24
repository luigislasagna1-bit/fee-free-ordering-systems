/**
 * Reseller payout-status notification email.
 *
 * Sent at every status transition on a PayoutRequest:
 *
 *   variant="approved" → "Your payout was approved — money is on its way"
 *                        Emerald header. Body confirms amount + method, sets
 *                        expectations on timing (typically 1-3 business days
 *                        for Stripe / PayPal, longer for international bank
 *                        transfer).
 *
 *   variant="paid"     → "Your payout has been sent"
 *                        Emerald header. Includes the payout reference (e.g.
 *                        PayPal transaction ID, Stripe transfer ID) so the
 *                        partner can match it against their own records.
 *
 *   variant="rejected" → "Your payout request couldn't be processed"
 *                        Navy header (transactional/action-needed). Shows the
 *                        rejection reason from the superadmin so the partner
 *                        knows what to fix + can re-request.
 *
 * All three use the same React component; the variant prop drives header
 * color + copy. Money MOVEMENT still happens manually out-of-band — this
 * is just the customer-facing communication around it.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type ResellerPayoutNotificationProps = {
  variant: "approved" | "paid" | "rejected";
  /** The partner's display name. */
  recipientName: string;
  /** Pre-formatted amount with currency symbol, e.g. "$427.50". */
  amount: string;
  /** Human label of how the money will be sent (e.g. "PayPal", "Stripe", "Bank transfer"). */
  payoutMethod?: string | null;
  /** Reference / transaction ID, e.g. PayPal payment ID. Only used on `paid`. */
  payoutReference?: string | null;
  /** Reason supplied by the superadmin. Only used on `rejected`. */
  rejectionReason?: string | null;
  /** Optional free-text notes from the superadmin. */
  notes?: string | null;
  /** Link back to /reseller/payouts so they can see the full history. */
  dashboardUrl: string;
  imprint?: string;
};

export default function ResellerPayoutNotification(props: ResellerPayoutNotificationProps) {
  const {
    variant, recipientName, amount, payoutMethod, payoutReference,
    rejectionReason, notes, dashboardUrl, imprint,
  } = props;

  const isPositive = variant !== "rejected";
  const title =
    variant === "approved" ? "Your payout was approved"
    : variant === "paid"   ? "Your payout has been sent"
    :                        "Your payout request couldn't be processed";
  const subtitle =
    variant === "approved" ? `${amount} is on the way`
    : variant === "paid"   ? `${amount} sent${payoutMethod ? ` via ${payoutMethod}` : ""}`
    :                        "Action needed";

  return (
    <EmailLayout preview={`${title} — ${amount}`}>
      <EmailHeader
        variant={isPositive ? "status" : "transactional"}
        title={title}
        subtitle={subtitle}
      />
      <EmailBody>
        <P>Hi {recipientName},</P>

        <div style={{ margin: "8px 0 16px" }}>
          {variant === "approved" && <Badge color="emerald">Approved</Badge>}
          {variant === "paid"     && <Badge color="emerald">Paid</Badge>}
          {variant === "rejected" && <Badge color="rose">Rejected</Badge>}
        </div>

        {variant === "approved" && (
          <>
            <P>
              We&apos;ve approved your payout request for <strong>{amount}</strong>. The money is on its way{payoutMethod ? ` via ${payoutMethod}` : ""} now.
            </P>
            <InfoCard accent="emerald">
              Typical timing: <strong>1-3 business days</strong> for Stripe / PayPal, up to a week for international bank transfers. You&apos;ll get a follow-up email the moment we mark it sent.
            </InfoCard>
          </>
        )}

        {variant === "paid" && (
          <>
            <P>
              We&apos;ve sent your payout of <strong>{amount}</strong>{payoutMethod ? ` via ${payoutMethod}` : ""}. The money should be in your account within the timing window for that method (typically 1-3 business days).
            </P>
            {payoutReference && (
              <InfoCard label="Payment reference" accent="emerald">
                <div style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
                  {payoutReference}
                </div>
                <div style={{ fontSize: 12, marginTop: 6, color: "#065f46" }}>
                  Use this to match the deposit against your records.
                </div>
              </InfoCard>
            )}
          </>
        )}

        {variant === "rejected" && (
          <>
            <P>
              We weren&apos;t able to process your payout request for <strong>{amount}</strong>.
            </P>
            {rejectionReason && (
              <InfoCard label="Reason" accent="amber">
                {rejectionReason}
              </InfoCard>
            )}
            <P>
              Your commission balance is unchanged — once the issue is resolved you can submit a new payout request from the dashboard.
            </P>
          </>
        )}

        {notes && variant !== "rejected" && (
          <InfoCard label="Note from the team" accent="slate">
            {notes}
          </InfoCard>
        )}

        <EmailButton href={dashboardUrl}>
          {variant === "rejected" ? "Update payout details" : "View payout history"}
        </EmailButton>

        <P size="sm" muted>
          Questions? Reply to this email and we&apos;ll get back to you.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}

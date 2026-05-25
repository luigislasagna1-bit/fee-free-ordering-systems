/**
 * Reseller application-status email.
 *
 * Fires at three lifecycle transitions:
 *
 *   variant="received" → "We got your application"
 *                        Emerald. Acknowledgement only — sent immediately
 *                        after /partners/apply succeeds. Sets expectation
 *                        on review timing (1–2 business days) so applicants
 *                        don't refresh /reseller obsessively waiting.
 *
 *   variant="approved" → "You're in — your partner program is active"
 *                        Emerald. Sent when superadmin approves at
 *                        /superadmin/resellers/[id]/approve. Includes the
 *                        referral code + dashboard link so the partner can
 *                        immediately start sharing.
 *
 *   variant="rejected" → "Your reseller application was declined"
 *                        Navy. Includes the rejection reason supplied by
 *                        the superadmin so the applicant knows whether
 *                        to reapply with different info.
 *
 * All three share this single component; the variant prop drives header
 * color, copy, and which optional fields render.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type ResellerApplicationStatusProps = {
  variant: "received" | "approved" | "rejected";
  /** Applicant display name. */
  recipientName: string;
  /** Optional — company / agency name from the application. */
  companyName?: string | null;
  /** Referral code, included on approval so they can start sharing. */
  referralCode?: string | null;
  /** Reason supplied by superadmin. Only used on `rejected`. */
  rejectionReason?: string | null;
  /** Link back to /reseller (approval) or /login (received/rejected). */
  dashboardUrl: string;
  /** Pre-formatted shareable referral URL: e.g. "https://feefreeordering.com/signup?ref=ABC123". */
  referralUrl?: string | null;
  imprint?: string;
};

export default function ResellerApplicationStatus(props: ResellerApplicationStatusProps) {
  const {
    variant, recipientName, companyName, referralCode, rejectionReason,
    dashboardUrl, referralUrl, imprint,
  } = props;

  const isPositive = variant !== "rejected";
  const title =
    variant === "received" ? "We got your application"
    : variant === "approved" ? "You're in — welcome to the partner program"
    :                          "Your reseller application was declined";
  const subtitle =
    variant === "received" ? "Reviewing it now"
    : variant === "approved" ? "Time to start earning"
    :                          "Details inside";

  return (
    <EmailLayout preview={`${title}${companyName ? ` — ${companyName}` : ""}`}>
      <EmailHeader
        variant={isPositive ? "status" : "transactional"}
        title={title}
        subtitle={subtitle}
      />
      <EmailBody>
        <P>Hi {recipientName},</P>

        <div style={{ margin: "8px 0 16px" }}>
          {variant === "received" && <Badge color="emerald">Received</Badge>}
          {variant === "approved" && <Badge color="emerald">Approved</Badge>}
          {variant === "rejected" && <Badge color="rose">Declined</Badge>}
        </div>

        {variant === "received" && (
          <>
            <P>
              Thanks for applying to the Fee Free Ordering partner program{companyName ? ` — ${companyName} looks great` : ""}. Your application is in the queue.
            </P>
            <InfoCard accent="emerald">
              We typically review applications within <strong>1–2 business days</strong>. You&apos;ll get another email the moment we make a decision.
            </InfoCard>
            <P>
              In the meantime, you can sign in any time to check your status.
            </P>
          </>
        )}

        {variant === "approved" && (
          <>
            <P>
              Your reseller account is <strong>active</strong>. You can start sharing your referral link right now — every restaurant that signs up through it earns you recurring monthly commission for as long as they stay on a paid plan.
            </P>
            {referralUrl && (
              <InfoCard label="Your referral link" accent="emerald">
                <div style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
                  {referralUrl}
                </div>
                {referralCode && (
                  <div style={{ fontSize: 12, marginTop: 6, color: "#065f46" }}>
                    Or share just the code: <strong>{referralCode}</strong>
                  </div>
                )}
              </InfoCard>
            )}
            <P size="sm" muted>
              Commission rate scales with active paying restaurants — 5% at 5+, 10% at 26+, 15% at 50+. Earnings hold for 7 days after each invoice paid (in case of refunds) and become available for payout once cleared. Minimum payout is $50.
            </P>
          </>
        )}

        {variant === "rejected" && (
          <>
            <P>
              We&apos;ve reviewed your application and weren&apos;t able to approve it at this time.
            </P>
            {rejectionReason && (
              <InfoCard label="Reason" accent="amber">
                {rejectionReason}
              </InfoCard>
            )}
            <P>
              If circumstances change or you have additional context we should consider, feel free to reply to this email — we read every response.
            </P>
          </>
        )}

        <EmailButton href={dashboardUrl}>
          {variant === "approved" ? "Open your dashboard"
            : variant === "received" ? "Check your status"
            : "Contact us"}
        </EmailButton>

        <P size="sm" muted>
          Questions? Reply to this email and we&apos;ll get back to you.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}

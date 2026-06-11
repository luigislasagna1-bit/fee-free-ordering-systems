/**
 * Autopilot marketing email — used by the second-order / reengagement
 * campaigns to bring customers back.
 *
 * The restaurant owner writes the subject + body in /admin/autopilot.
 * This template just dresses their copy in our visual system — emerald
 * header, info card highlighting an optional coupon code (when the
 * campaign has one linked), restaurant signature footer, and the RFC-
 * 8058 List-Unsubscribe header the sender attaches at send time.
 *
 * Body supports basic line breaks (whitespace: pre-line) but no HTML —
 * keeps the editor simple and XSS surface zero.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type AutopilotEmailProps = {
  customerName: string;
  restaurantName: string;
  subject: string;
  body: string;
  /** Optional discount coupon code to highlight in a card + amount. */
  couponCode?: string | null;
  couponLabel?: string | null;
  /** Click-through CTA. Goes to the restaurant's ordering page with the
   *  coupon pre-applied if there is one. */
  ctaUrl: string;
  ctaLabel?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function AutopilotEmail(props: AutopilotEmailProps) {
  const {
    restaurantName, subject, body, couponCode, couponLabel,
    ctaUrl, ctaLabel, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;

  return (
    <EmailLayout preview={subject}>
      <EmailHeader variant="status" title={subject} subtitle={restaurantName} />
      <EmailBody>
        {/* The greeting comes from the owner's body ("Hi {customer_name},"), which
            is token-substituted at send time — no separate greeting here, else it
            doubles up. Luigi 2026-06-10. */}
        <div style={{ whiteSpace: "pre-line" }}>
          <P>{body}</P>
        </div>

        {couponCode && (
          <InfoCard label="Your coupon" accent="emerald">
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.1em", color: "#065f46", marginBottom: 4 }}>
              {couponCode}
            </div>
            {couponLabel && (
              <div style={{ fontSize: 13, color: "#065f46" }}>{couponLabel}</div>
            )}
            <div style={{ fontSize: 12, color: "#047857", marginTop: 6 }}>
              We&apos;ve pre-applied it for you — just click the button below.
            </div>
          </InfoCard>
        )}

        <EmailButton href={ctaUrl}>{ctaLabel ?? "Order now"}</EmailButton>

        <P size="sm" muted>
          See you soon!
        </P>
      </EmailBody>
      <EmailFooter
        restaurantName={restaurantName}
        restaurantUrl={restaurantUrl}
        restaurantEmail={restaurantEmail}
        restaurantPhone={restaurantPhone}
        imprint={imprint}
      />
    </EmailLayout>
  );
}

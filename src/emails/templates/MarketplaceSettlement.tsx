/**
 * Marketplace monthly settlement summary email.
 *
 * Sent by src/lib/marketplace-settlement.ts at the end of every monthly
 * billing cycle. Two variants in one template:
 *
 *   status="invoiced" — happy path. Restaurant gets a stat-card breakdown
 *     of the month (orders / revenue / fees accrued / billed) plus a
 *     savings highlight (versus what UE/DoorDash would have charged at
 *     30%) and a lifetime-savings tally. CTA to the marketplace dashboard.
 *
 *   status="failed"  — Stripe couldn't bill the card (no customer ID, no
 *     default payment method, dispute hold, etc.). Same stat cards but
 *     with an amber "Action needed" header, the failure reason as an
 *     InfoCard, and a CTA to update the payment method.
 *
 * Replaces the inline-HTML approach the original sendMarketplaceSettlementEmail
 * had — that bypassed our React Email design system and rendered <strong>
 * tags as literal text after the day-of refactor.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import {
  EmailBody, P, EmailButton, StatCard, StatGrid, InfoCard, Badge,
} from "../components/EmailParts";

export type MarketplaceSettlementProps = {
  restaurantName: string;
  /** Pre-formatted "May 2026" or similar */
  period: string;
  status: "invoiced" | "failed";
  ordersInMonth: number;
  /** Restaurant's gross marketplace revenue this month — what customers paid. */
  revenueDollars: number;
  /** Sum of $3/order fees the restaurant accrued (pre-cap). */
  accruedDollars: number;
  /** What we're actually billing — min(accrued, cap). */
  invoicedDollars: number;
  /** The cap that may have kicked in ($249.99). Displayed as context. */
  capDollars: number;
  /** True when accrued >= cap — drives the "capped" badge. */
  capHit: boolean;
  /** Estimated what UE/DoorDash would have charged on the same revenue
   *  (30% commission benchmark). Used for the savings narrative. */
  ueEquivalentDollars: number;
  /** This month's savings vs the UE equivalent. */
  savingsThisMonthDollars: number;
  /** Running lifetime savings since the restaurant joined. */
  lifetimeSavingsDollars: number;
  /** Only for status="failed" — short string from Stripe. */
  failureReason?: string;
  /** Link to /admin/marketplace */
  dashboardUrl: string;
  /** Link to /admin/billing (update payment method) — used on failed variant. */
  billingUrl?: string;
  imprint?: string;
};

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MarketplaceSettlement(props: MarketplaceSettlementProps) {
  const {
    restaurantName, period, status, ordersInMonth, revenueDollars,
    accruedDollars, invoicedDollars, capDollars, capHit,
    ueEquivalentDollars, savingsThisMonthDollars, lifetimeSavingsDollars,
    failureReason, dashboardUrl, billingUrl, imprint,
  } = props;

  const succeeded = status === "invoiced";
  const headerTitle = succeeded
    ? `Your Marketplace bill — ${period}`
    : `Action needed on your ${period} Marketplace bill`;
  const headerSubtitle = succeeded
    ? `${restaurantName} · ${ordersInMonth} order${ordersInMonth === 1 ? "" : "s"}`
    : "We couldn't charge your card";

  return (
    <EmailLayout
      preview={succeeded
        ? `${restaurantName} · ${period} · ${fmt(invoicedDollars)} billed · ${fmt(savingsThisMonthDollars)} saved vs UberEats`
        : `${restaurantName} · ${period} bill failed — please update payment method`}
    >
      <EmailHeader variant="digest" title={headerTitle} subtitle={headerSubtitle} />
      <EmailBody>
        <div style={{ margin: "0 0 12px" }}>
          {succeeded ? (
            <Badge color="emerald">Settled</Badge>
          ) : (
            <Badge color="rose">Action needed</Badge>
          )}{" "}
          <Badge color="slate">{period}</Badge>{" "}
          {capHit && <Badge color="amber">Monthly cap reached</Badge>}
        </div>

        <P>
          Here&apos;s how {period} closed for <strong>{restaurantName}</strong> on the Fee Free Marketplace.
        </P>

        {/* Big stat grid — orders + revenue + accrued + billed */}
        <StatGrid>
          <StatCard label="Orders this month"     value={String(ordersInMonth)} />
          <StatCard label="Revenue (paid by customers)" value={fmt(revenueDollars)} />
          <StatCard label="Per-order fees accrued" value={fmt(accruedDollars)} />
          <StatCard
            label={succeeded ? "Billed to your card" : "Amount due"}
            value={fmt(invoicedDollars)}
            delta={capHit ? `Cap ${fmt(capDollars)}` : undefined}
          />
        </StatGrid>

        {capHit && succeeded && (
          <InfoCard accent="amber" label="Monthly cap reached">
            You hit the <strong>{fmt(capDollars)}</strong> monthly cap this period. Every additional marketplace order after that was <strong>$0 in fees</strong> — congrats on the volume.
          </InfoCard>
        )}

        {/* Savings highlight — the whole point */}
        {succeeded && (
          <InfoCard label="What you saved this month" accent="emerald">
            <div style={{ fontSize: 22, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>
              {fmt(savingsThisMonthDollars)} saved
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              UberEats / DoorDash would have charged an estimated <strong>{fmt(ueEquivalentDollars)}</strong> in commission on this month&apos;s {fmt(revenueDollars)} of revenue (30% benchmark). You paid <strong>{fmt(invoicedDollars)}</strong>.
            </div>
            <div style={{ fontSize: 12, color: "#065f46", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(16,185,129,0.2)" }}>
              <strong>Lifetime savings:</strong> {fmt(lifetimeSavingsDollars)} since you joined Fee Free.
            </div>
          </InfoCard>
        )}

        {/* Failed-variant payload */}
        {!succeeded && (
          <>
            <InfoCard label="Why this happened" accent="amber">
              {failureReason || "No default payment method on file."}
            </InfoCard>
            <P>
              Please update your billing method so we can settle this month&apos;s marketplace fees. Your listing stays active in the meantime, but if the bill isn&apos;t resolved we&apos;ll pause new marketplace orders until it is.
            </P>
          </>
        )}

        <EmailButton href={succeeded ? dashboardUrl : (billingUrl ?? dashboardUrl)}>
          {succeeded ? "View marketplace dashboard" : "Update payment method"}
        </EmailButton>

        {succeeded && (
          <P size="sm" muted>
            The invoice charges your card on file automatically — nothing for you to do. We&apos;ll email you again once it clears Stripe.
          </P>
        )}
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}

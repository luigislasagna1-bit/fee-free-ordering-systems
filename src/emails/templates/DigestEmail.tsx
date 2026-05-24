/**
 * Daily / Monthly insights digest.
 *
 * GloriaFood's "Online ordering daily insights" Thursday-style email is the
 * direct reference here:
 *   - Navy "Online ordering daily insights" header with the date
 *   - "Sales performance vs previous Thursday" intro line
 *   - 2x2 grid of stat cards: Sales / Orders / Avg order value / Reservations
 *     each with a delta % vs previous period
 *   - "You didn't miss any order. You didn't cancel any order." reassurance
 *   - Pickup / Delivery / On-premise breakdown row
 *   - Offline vs online payments
 *   - "View full report" CTA → admin analytics
 *
 * Single component, controlled by `period: "daily" | "monthly"`.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import {
  EmailBody, P, EmailButton, StatCard, StatGrid, InfoCard, Badge,
} from "../components/EmailParts";

export type DigestStat = {
  /** Display value already formatted, e.g. "$504.17" or "11" */
  value: string;
  /** % change vs prior period, e.g. "+64%". Omit for not-applicable stats. */
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
};

export type DigestEmailProps = {
  period: "daily" | "monthly";
  /** Pre-formatted date, e.g. "Thursday, May 21, 2026" or "May 2026" */
  periodLabel: string;
  /** Pre-formatted "vs previous X" string, e.g. "vs previous Thursday" */
  comparisonLabel: string;
  restaurantName: string;
  sales: DigestStat;
  orders: DigestStat;
  avgOrderValue: DigestStat;
  reservations?: DigestStat;
  /** Channel breakdown */
  pickup: { count: number; value: string };
  delivery: { count: number; value: string };
  onPremise: { count: number; value: string };
  /** Payment-method breakdown */
  offlinePayments?: { count: number; value: string };
  onlinePayments?: { count: number; value: string };
  /** True when no orders were missed/cancelled — drives the reassurance line. */
  noMissedOrders: boolean;
  noCanceledOrders: boolean;
  dashboardUrl: string;
  unsubscribeUrl?: string;
  imprint?: string;
};

export default function DigestEmail(props: DigestEmailProps) {
  const {
    period, periodLabel, comparisonLabel, restaurantName,
    sales, orders, avgOrderValue, reservations,
    pickup, delivery, onPremise, offlinePayments, onlinePayments,
    noMissedOrders, noCanceledOrders, dashboardUrl, unsubscribeUrl, imprint,
  } = props;
  const title = period === "daily" ? "Online ordering daily insights" : "Online ordering monthly insights";

  return (
    <EmailLayout preview={`${restaurantName} — ${period} insights for ${periodLabel}`}>
      <EmailHeader variant="digest" title={title} subtitle={periodLabel} />
      <EmailBody>
        <P>Hi there,</P>
        <P>Here is the sales report of the {period === "daily" ? "day" : "month"} for <strong>{restaurantName}</strong>.</P>

        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f172a" }}>
            Sales performance
          </span>
          <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 8 }}>
            ({comparisonLabel})
          </span>
        </div>

        <StatGrid>
          <StatCard label="Sales ($)"          value={sales.value}         delta={sales.delta}         deltaDirection={sales.deltaDirection} />
          <StatCard label="Orders"             value={orders.value}        delta={orders.delta}        deltaDirection={orders.deltaDirection} />
          <StatCard label="Avg. order value ($)" value={avgOrderValue.value} delta={avgOrderValue.delta} deltaDirection={avgOrderValue.deltaDirection} />
          {reservations && (
            <StatCard label="Table reservations" value={reservations.value} delta={reservations.delta} deltaDirection={reservations.deltaDirection} />
          )}
        </StatGrid>

        {(noMissedOrders || noCanceledOrders) && (
          <InfoCard accent="emerald">
            {noMissedOrders && <div>✓ You didn&apos;t miss any order.</div>}
            {noCanceledOrders && <div>✓ You didn&apos;t cancel any order.</div>}
          </InfoCard>
        )}

        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f172a" }}>
            Order channels
          </span>
        </div>
        <StatGrid>
          <StatCard label="Pickup"     value={`${pickup.count}`}    delta={pickup.value} />
          <StatCard label="Delivery"   value={`${delivery.count}`}  delta={delivery.value} />
          <StatCard label="On-premise" value={`${onPremise.count}`} delta={onPremise.value} />
        </StatGrid>

        {(offlinePayments || onlinePayments) && (
          <>
            <div style={{ marginTop: 20, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f172a" }}>
                Payments
              </span>
            </div>
            <StatGrid>
              {offlinePayments && (
                <StatCard label="Offline payments" value={`${offlinePayments.count}`} delta={offlinePayments.value} />
              )}
              {onlinePayments && (
                <StatCard label="Online payments" value={`${onlinePayments.count}`} delta={onlinePayments.value} />
              )}
            </StatGrid>
          </>
        )}

        <EmailButton href={dashboardUrl}>View full report</EmailButton>

        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="slate">{period === "daily" ? "Sent daily" : "Sent monthly"}</Badge>
        </div>
      </EmailBody>
      <EmailFooter imprint={imprint} unsubscribeUrl={unsubscribeUrl} />
    </EmailLayout>
  );
}

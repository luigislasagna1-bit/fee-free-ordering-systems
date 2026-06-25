/**
 * Daily / Monthly insights digest.
 *
 * GloriaFood's "Online ordering daily insights" email is the reference:
 *   - Header with the date
 *   - "Sales performance vs previous period" intro line
 *   - 2x2 grid of stat cards: Sales / Orders / Avg order value / Reservations
 *   - "You didn't miss / cancel any order" reassurance
 *   - SALES BREAKDOWN (subtotal / delivery fees / tips / other fees / tax / total)
 *   - Pickup / Delivery / On-premise breakdown row
 *   - Offline vs online payments
 *   - "View full report" CTA → admin analytics
 *
 * Single component, controlled by `period: "daily" | "monthly"`. ALL copy is
 * translated via the injected `t` (email.digest.* keys) and ALL money via
 * `formatCurrency(n, currency)` so the email renders in the restaurant's
 * language + currency (Fabrizio report: it was hardcoded English + USD).
 */
import { Section, Row, Column } from "@react-email/components";
import { EmailLayout, EmailHeader, EmailFooter, COLORS } from "../components/EmailLayout";
import {
  EmailBody, P, EmailButton, StatCard, StatGrid, InfoCard, Badge,
} from "../components/EmailParts";
import { formatCurrency } from "@/lib/utils";

export type DigestStat = {
  /** Display value already formatted, e.g. "504,17 €" or "11" */
  value: string;
  /** % change vs prior period, e.g. "+64%". Omit for not-applicable stats. */
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
};

type DigestTranslator = (key: string, vars?: Record<string, string | number>) => string;

export type DigestEmailProps = {
  period: "daily" | "monthly";
  /** Pre-formatted date, e.g. "Thursday, May 21, 2026" or "May 2026" */
  periodLabel: string;
  /** Pre-formatted "vs previous X" string, e.g. "vs previous Thursday" */
  comparisonLabel: string;
  restaurantName: string;
  /** Translator bound to the restaurant's language (email.digest.* keys). */
  t: DigestTranslator;
  /** ISO 4217 currency code for the restaurant (e.g. "eur"). */
  currency: string;
  sales: DigestStat;
  orders: DigestStat;
  avgOrderValue: DigestStat;
  reservations?: DigestStat;
  /** Sales breakdown — raw amounts; rendered via formatCurrency. Mirrors the
   *  in-app end-of-day report so the email matches what the owner sees. */
  breakdown?: { subTotals: number; deliveryFees: number; tips: number; otherFees: number; tax: number; total: number };
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

function SectionLabel({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div style={{ marginTop: 20, marginBottom: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f172a" }}>
        {children}
      </span>
      {note && <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 8 }}>({note})</span>}
    </div>
  );
}

export default function DigestEmail(props: DigestEmailProps) {
  const {
    period, periodLabel, comparisonLabel, restaurantName, t, currency,
    sales, orders, avgOrderValue, reservations, breakdown,
    pickup, delivery, onPremise, offlinePayments, onlinePayments,
    noMissedOrders, noCanceledOrders, dashboardUrl, unsubscribeUrl, imprint,
  } = props;
  const title = t(period === "daily" ? "email.digest.headlineDaily" : "email.digest.headlineMonthly");
  const money = (n: number) => formatCurrency(n, currency);

  const breakdownRow = (label: string, amount: number, bold = false) => (
    <Row>
      <Column style={{ fontSize: 14, color: bold ? COLORS.text : COLORS.muted, padding: "4px 0", fontWeight: bold ? 700 : 400 }}>{label}</Column>
      <Column style={{ fontSize: 14, textAlign: "right", color: bold ? COLORS.text : COLORS.muted, padding: "4px 0", fontWeight: bold ? 700 : 600 }}>{money(amount)}</Column>
    </Row>
  );

  return (
    <EmailLayout preview={`${restaurantName} — ${periodLabel}`}>
      <EmailHeader variant="digest" title={title} subtitle={periodLabel} />
      <EmailBody>
        <P>{t("email.digest.hi")}</P>
        <P>{t("email.digest.intro", { restaurant: restaurantName })}</P>

        <SectionLabel note={comparisonLabel}>{t("email.digest.salesPerformance")}</SectionLabel>
        <StatGrid>
          <StatCard label={t("email.digest.sales")}         value={sales.value}         delta={sales.delta}         deltaDirection={sales.deltaDirection} />
          <StatCard label={t("email.digest.orders")}        value={orders.value}        delta={orders.delta}        deltaDirection={orders.deltaDirection} />
          <StatCard label={t("email.digest.avgOrderValue")} value={avgOrderValue.value} delta={avgOrderValue.delta} deltaDirection={avgOrderValue.deltaDirection} />
          {reservations && (
            <StatCard label={t("email.digest.tableReservations")} value={reservations.value} delta={reservations.delta} deltaDirection={reservations.deltaDirection} />
          )}
        </StatGrid>

        {(noMissedOrders || noCanceledOrders) && (
          <InfoCard accent="emerald">
            {noMissedOrders && <div>✓ {t("email.digest.noMissedOrder")}</div>}
            {noCanceledOrders && <div>✓ {t("email.digest.noCanceledOrder")}</div>}
          </InfoCard>
        )}

        {breakdown && (
          <>
            <SectionLabel>{t("email.digest.salesBreakdown")}</SectionLabel>
            <Section style={{ marginTop: 4 }}>
              {breakdownRow(t("email.digest.subTotals"), breakdown.subTotals)}
              {breakdownRow(t("email.digest.deliveryFees"), breakdown.deliveryFees)}
              {breakdownRow(t("email.digest.tips"), breakdown.tips)}
              {breakdownRow(t("email.digest.otherFees"), breakdown.otherFees)}
              {breakdownRow(t("email.digest.tax"), breakdown.tax)}
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6 }}>
                {breakdownRow(t("email.digest.total"), breakdown.total, true)}
              </div>
            </Section>
          </>
        )}

        <SectionLabel>{t("email.digest.channels")}</SectionLabel>
        <StatGrid>
          <StatCard label={t("email.digest.pickup")}   value={`${pickup.count}`}    delta={pickup.value} />
          <StatCard label={t("email.digest.delivery")} value={`${delivery.count}`}  delta={delivery.value} />
          <StatCard label={t("email.digest.dineIn")}   value={`${onPremise.count}`} delta={onPremise.value} />
        </StatGrid>

        {(offlinePayments || onlinePayments) && (
          <>
            <SectionLabel>{t("email.digest.payments")}</SectionLabel>
            <StatGrid>
              {offlinePayments && (
                <StatCard label={t("email.digest.offlinePayments")} value={`${offlinePayments.count}`} delta={offlinePayments.value} />
              )}
              {onlinePayments && (
                <StatCard label={t("email.digest.onlinePayments")} value={`${onlinePayments.count}`} delta={onlinePayments.value} />
              )}
            </StatGrid>
          </>
        )}

        <EmailButton href={dashboardUrl}>{t("email.digest.viewFullReport")}</EmailButton>

        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="slate">{t(period === "daily" ? "email.digest.sentDaily" : "email.digest.sentMonthly")}</Badge>
        </div>
      </EmailBody>
      <EmailFooter imprint={imprint} unsubscribeUrl={unsubscribeUrl} />
    </EmailLayout>
  );
}

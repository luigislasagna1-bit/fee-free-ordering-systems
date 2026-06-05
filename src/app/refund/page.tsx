import { cookies } from "next/headers";
import { LegalPageShell } from "@/components/layout/LegalPageShell";

/**
 * Refund Policy page.
 *
 * v1 template that accurately reflects how refunds actually flow on
 * the Fee Free platform:
 *
 *   - Order refunds: restaurant decides + issues via Stripe Connect.
 *     We are NOT the seller of the food; restaurants are. We facilitate.
 *   - Subscription/add-on refunds: pro-rated; first-14-days full refund.
 *   - Marketplace per-order fees: auto-refunded to restaurant on
 *     order cancel/refund (already wired up — see Order webhook).
 *   - Chargebacks last resort.
 *
 * Should be cross-referenced in Terms of Service (it already is — Section
 * 6 + Section 9). Should be lawyer-reviewed pre-prod.
 */
export const metadata = {
  title: "Refund Policy — Fee Free Ordering",
  description: "How refunds work for orders, add-on subscriptions, and marketplace fees.",
};

export default async function RefundPolicyPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  return (
    <LegalPageShell title="Refund Policy" lastUpdated="May 23, 2026" locale={locale}>
      <p>
        This policy explains how refunds work on Fee Free Ordering Systems. There are three kinds of refunds — <strong>customer food orders</strong>, <strong>restaurant add-on subscriptions</strong>, and <strong>marketplace per-order fees</strong>. Each works differently. Find the one that applies to you below.
      </p>

      <h2>1. Customer food orders</h2>
      <p><strong>Short version:</strong> contact the restaurant. They issue the refund directly.</p>
      <p>When you place an order through Fee Free, you contract directly with the restaurant — Fee Free is the technology in between, not the seller of the food (see <a href="/terms">Terms §9</a>). That means:</p>
      <ul>
        <li>The restaurant decides whether to refund you, fully or partly.</li>
        <li>The refund — when issued — comes from the restaurant&rsquo;s Stripe account using the same payment method you used. We facilitate the technical refund; the restaurant authorizes it.</li>
        <li>Typical timeline once the restaurant approves: <strong>5–10 business days</strong> for the money to land back on your card.</li>
      </ul>

      <h3>How to request a refund</h3>
      <ol>
        <li>Open your order confirmation email and use the restaurant&rsquo;s contact info to reach out directly. Phone is usually fastest for an urgent issue (cold food, wrong items, missed delivery).</li>
        <li>If you can&rsquo;t reach the restaurant within a reasonable time, email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> with your order number and we&rsquo;ll relay the request.</li>
        <li>If the restaurant declines and you believe the decline is unreasonable, you may dispute the charge with your card issuer (chargeback). Please try the restaurant and us first — chargebacks are a heavy tool and harm the restaurant even when they end up in your favor.</li>
      </ol>

      <h3>Common reasons restaurants refund</h3>
      <ul>
        <li>Order placed but the restaurant was closed / couldn&rsquo;t accept</li>
        <li>Order rejected by kitchen (out of an item, too busy, technical issue)</li>
        <li>Delivery failed (driver couldn&rsquo;t locate, lost order, food spilled)</li>
        <li>Food quality issue (cold, wrong item, missing item)</li>
      </ul>

      <h3>Auto-refunds on rejected orders</h3>
      <p>If a restaurant rejects an order or fails to accept it within their configured timeout, our platform automatically issues a refund of the captured amount through Stripe. You don&rsquo;t need to ask — the money will return to your card within 5–10 business days.</p>

      <h2>2. Restaurant add-on subscriptions</h2>
      <p>If you&rsquo;re a Restaurant Owner who subscribed to a paid add-on (Online Payments, Hosted Website, Multi-Location, Custom Domain, etc.) and want a refund:</p>

      <h3>First 14 days</h3>
      <p>Full refund, no questions asked. Cancel from /admin/billing/add-ons or email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> within 14 days of your first charge on a given add-on.</p>

      <h3>After 14 days</h3>
      <p>Add-on subscriptions are billed monthly in advance. You can cancel any active add-on at any time. The add-on stays active until the end of the current billing period; we don&rsquo;t pro-rate refunds on already-billed months by default. If you have an exceptional situation, email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> — we&rsquo;ll work with you.</p>

      <h3>Down-grades</h3>
      <p>If you downgrade or remove an add-on, the change takes effect at the end of the current billing period. No partial-month refund is automatic, but again — email us if there&rsquo;s a fairness issue.</p>

      <h2>3. Marketplace per-order fees</h2>
      <p>Restaurants on the marketplace pay up to $3 per marketplace order (or a $199.99/month unlimited plan, whichever they chose).</p>
      <ul>
        <li><strong>If the order is cancelled or refunded</strong> (by the restaurant, automatically by the platform, or via chargeback), the platform automatically reverses the marketplace per-order fee. The restaurant is not charged for orders that didn&rsquo;t complete.</li>
        <li>The reversal appears as a credit on the restaurant&rsquo;s next monthly marketplace invoice (or as a direct Stripe credit, depending on when the cancellation happens).</li>
        <li>Monthly cap ($249.99) is enforced after refunds — if your billed-and-not-refunded marketplace orders for the month sum below the cap, you pay that lower amount. If they sum above, you pay $249.99 max.</li>
      </ul>

      <h2>4. What we cannot refund</h2>
      <ul>
        <li><strong>Stripe processing fees</strong> on completed orders — those go to Stripe and aren&rsquo;t refundable on a successful charge that you later reverse. Stripe&rsquo;s fee policy controls this; we don&rsquo;t set it.</li>
        <li><strong>Third-party services</strong> the restaurant subscribed to outside Fee Free (e.g. their own PrintNode subscription, their own custom domain registrar, their own ShipDay account).</li>
        <li><strong>Time-of-the-essence claims</strong> for events that happened more than 60 days ago — we may still help but our practical ability to reverse charges is limited.</li>
      </ul>

      <h2>5. Chargebacks</h2>
      <p>A chargeback (filed with your bank or card issuer) is your right under consumer protection law, and we don&rsquo;t prevent you from exercising it. But please try resolving with the restaurant and with us first — chargebacks impose a $15 fee on the restaurant by Stripe even when the chargeback ultimately favors you, and that fee can&rsquo;t be reversed.</p>

      <h2>6. Disputes</h2>
      <p>If you and the restaurant can&rsquo;t reach an outcome, email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a>. Include your order number, what happened, what you&rsquo;ve already tried, and the resolution you&rsquo;re looking for. We&rsquo;ll mediate between you and the restaurant.</p>

      <h2>7. Contact</h2>
      <p>Refund questions: <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a><br />
      Billing questions (subscriptions, marketplace fees): <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a></p>
    </LegalPageShell>
  );
}

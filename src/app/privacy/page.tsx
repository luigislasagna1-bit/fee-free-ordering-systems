import { cookies } from "next/headers";
import { LegalPageShell } from "@/components/layout/LegalPageShell";

/**
 * Privacy Policy page.
 *
 * v1 template covering the essentials a Canadian SaaS-with-payments
 * platform needs: what we collect, why, who we share with, retention,
 * user rights (PIPEDA-style), cookies, contact. A real Canadian
 * privacy lawyer should review this before we promote it as
 * production-grade. For soft launch it satisfies Stripe / Apple /
 * Google's "must have a privacy policy" checks and gives users a
 * meaningful read of what we do with their data.
 *
 * Pages this references (all wired in PublicFooter):
 *   - /terms     Terms of Service
 *   - /refund    Refund Policy
 */
export const metadata = {
  title: "Privacy Policy — Fee Free Ordering",
  description: "How Fee Free Ordering Systems collects, uses, and protects your data.",
};

export default async function PrivacyPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="May 23, 2026" locale={locale}>
      <p>
        Fee Free Ordering Systems (&ldquo;<strong>Fee Free</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>&rdquo;) runs the platform at <strong>feefreeordering.com</strong> and the public marketplace at <strong>feefreefood.com</strong>. This policy explains what personal information we collect, why we collect it, who we share it with, and the choices you have. It applies to restaurant owners, restaurant staff, and customers placing orders.
      </p>

      <h2>1. The short version</h2>
      <ul>
        <li>We collect the minimum needed to make the platform work — restaurant + staff accounts, customer orders, payment routing through Stripe.</li>
        <li>We don&rsquo;t sell your data. Ever.</li>
        <li>We share data only with the third parties needed to deliver the service: Stripe (payments), Resend (transactional email), PrintNode (printer bridge — until our native app replaces it), ShipDay (optional driver dispatch), Google Maps (delivery zones), Sentry (error monitoring).</li>
        <li>You can request a copy of your data or ask us to delete it at any time by emailing <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a>.</li>
      </ul>

      <h2>2. Information we collect</h2>

      <h3>From restaurant owners + staff</h3>
      <ul>
        <li>Name, email, phone number, password (hashed, never stored in plain text)</li>
        <li>Restaurant business information: name, address, cuisine, opening hours, menu content, banner + logo images you upload</li>
        <li>Payment-routing identifiers from Stripe Connect (your connected Stripe account ID — we never see your bank details directly; those live with Stripe)</li>
        <li>Add-on subscription billing information processed by Stripe</li>
        <li>Usage telemetry needed to operate the service: which admin pages were loaded, which features were used, errors encountered (via Sentry)</li>
      </ul>

      <h3>From customers placing orders</h3>
      <ul>
        <li>Name, email, phone number (provided at checkout)</li>
        <li>Delivery address when ordering delivery</li>
        <li>Order history (items, prices, timestamps, tips, the restaurant ordered from)</li>
        <li>Payment information is processed directly by Stripe — we receive a token and the last four digits of the card; full card numbers never touch our servers</li>
        <li>Account credentials if you create a Fee Free customer account (email + hashed password)</li>
      </ul>

      <h3>Automatically</h3>
      <ul>
        <li>Standard server logs: IP address, browser/device type, pages visited, referring URL, timestamps. Used for security and debugging.</li>
        <li>Cookies (see Section 7 below)</li>
        <li>Error / crash reports through Sentry, scrubbed of personal data where possible</li>
      </ul>

      <h2>3. How we use your information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide the service — accept orders, route payments, send order notifications, surface restaurants on the marketplace</li>
        <li>Maintain restaurant + customer accounts and authenticate logins</li>
        <li>Process payments through Stripe and route earnings to the correct restaurant&rsquo;s connected Stripe account</li>
        <li>Send transactional emails (order confirmations, password resets, monthly billing summaries, weekly performance digests). You can opt out of digest emails from the relevant admin page; you cannot opt out of order-critical emails like confirmations and receipts because they are part of the service.</li>
        <li>Operate the marketplace at feefreefood.com — list restaurants who have opted in, surface them to nearby customers</li>
        <li>Detect, prevent, and respond to fraud, abuse, and security incidents</li>
        <li>Comply with legal obligations, respond to lawful requests, enforce our Terms of Service</li>
        <li>Improve the product — analyze aggregate, de-identified usage patterns to decide what to build next. We do not target individual users with ads.</li>
      </ul>

      <h2>4. Who we share information with</h2>
      <p>We share personal information only with the third-party service providers we need to run the platform. Each one receives the minimum data required for its function.</p>
      <ul>
        <li><strong>Stripe</strong> — payment processing, Stripe Connect for restaurant payouts. Subject to Stripe&rsquo;s own <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</li>
        <li><strong>Resend</strong> — transactional + marketing email delivery</li>
        <li><strong>PrintNode</strong> — kitchen printer bridge for restaurants who opt to print receipts. (Will be discontinued once our native Kitchen Order App ships.) Restaurants create their own PrintNode account; we never see their PrintNode credentials.</li>
        <li><strong>ShipDay</strong> — optional third-party driver-pool integration for restaurants who use it</li>
        <li><strong>Google Maps Platform</strong> — geocoding addresses and rendering delivery-zone maps</li>
        <li><strong>Vercel</strong> — hosting our application and database edge routing</li>
        <li><strong>Neon</strong> — managed PostgreSQL database</li>
        <li><strong>Sentry</strong> — error monitoring</li>
        <li><strong>Restaurants themselves</strong> — when a customer places an order at a restaurant, the restaurant receives that customer&rsquo;s name, contact info, delivery address (if applicable), and order details so it can fulfill the order. This is the core point of the service.</li>
      </ul>
      <p>We do not sell personal information to data brokers or advertisers. We do not share customer order details across restaurants. We may share data when legally required (subpoena, court order) or to protect the rights, property, or safety of Fee Free, our users, or the public.</p>

      <h2>5. Data retention</h2>
      <ul>
        <li>Active account data: kept as long as the account is active.</li>
        <li>Order records: retained for at least 7 years to satisfy Canadian tax and bookkeeping rules.</li>
        <li>Closed accounts: personal information is deleted or anonymized within 90 days of account closure, except where retention is required by law (tax records, fraud investigations).</li>
        <li>Server logs: typically retained for 30 days unless flagged for an active incident.</li>
        <li>Backups: retained for 30 days on a rolling cycle; deletion requests are honored on the live database immediately and propagate through backups within that window.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>Under Canadian privacy law (PIPEDA) and similar laws in your jurisdiction, you have the right to:</p>
      <ul>
        <li><strong>Access</strong> — request a copy of the personal information we hold about you</li>
        <li><strong>Correction</strong> — ask us to fix inaccurate information</li>
        <li><strong>Deletion</strong> — ask us to delete your account and associated personal information, subject to retention requirements above</li>
        <li><strong>Portability</strong> — receive your data in a machine-readable format</li>
        <li><strong>Withdraw consent</strong> — for any processing that relies on your consent (e.g. marketing emails)</li>
        <li><strong>Complain</strong> — to the Office of the Privacy Commissioner of Canada or your local data protection authority</li>
      </ul>
      <p>To exercise any of these rights, email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> from the email on your account. We respond within 30 days.</p>

      <h2>7. Cookies + tracking</h2>
      <p>We use a small number of cookies, all functional:</p>
      <ul>
        <li><code>fee-free-locale</code> — remembers your language preference</li>
        <li><code>next-auth.session-token</code> — keeps you signed in</li>
        <li><code>feefree_ref</code> — attributes signups to the reseller who referred you, if any</li>
      </ul>
      <p>We do not use third-party advertising cookies. We do not run Google Analytics, Facebook Pixel, or similar tracking on the customer-facing ordering pages.</p>

      <h2>8. Children</h2>
      <p>The platform is intended for adults aged 18+. We do not knowingly collect personal information from anyone under 16. If you believe a child has provided us information, email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> and we&rsquo;ll delete it.</p>

      <h2>9. International transfers</h2>
      <p>Our servers and our service providers may be located outside Canada (primarily the United States and the European Union). Your data may be processed in those jurisdictions. We rely on standard contractual clauses or equivalent safeguards where applicable.</p>

      <h2>10. Security</h2>
      <p>We use industry-standard security practices: TLS encryption in transit, hashed passwords (bcrypt), encrypted storage of third-party API credentials, role-based access control for our team, and continuous monitoring for unauthorized access. No system is perfectly secure; we encourage you to use a strong, unique password and to email us immediately at <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> if you suspect your account has been compromised.</p>

      <h2>11. Changes to this policy</h2>
      <p>We may update this Privacy Policy from time to time. If we make a material change, we&rsquo;ll notify account holders by email and post a notice on this page. Continuing to use the service after a change means you accept the updated policy.</p>

      <h2>12. Contact</h2>
      <p>Questions, concerns, or data requests? Email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a>. We&rsquo;re a small team and we answer every message.</p>
    </LegalPageShell>
  );
}

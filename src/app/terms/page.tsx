import { cookies } from "next/headers";
import { LegalPageShell } from "@/components/layout/LegalPageShell";

/**
 * Terms of Service page.
 *
 * v1 template. Covers the essentials a SaaS-with-payments platform
 * needs to communicate before taking real money: account terms,
 * separate roles for restaurant owners vs customers, payment +
 * Stripe Connect terms, marketplace fees, acceptable use, liability
 * limits, termination, governing law. Should be reviewed by a
 * Canadian lawyer before relying on it as legally binding. For soft
 * launch this satisfies the "must have ToS" baseline + gives users a
 * clear read of the rules.
 */
export const metadata = {
  title: "Terms of Service — Fee Free Ordering",
  description: "The rules that govern your use of the Fee Free Ordering platform.",
};

export default async function TermsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  return (
    <LegalPageShell title="Terms of Service" lastUpdated="May 23, 2026" locale={locale}>
      <p>
        These Terms of Service (the &ldquo;<strong>Terms</strong>&rdquo;) govern your use of Fee Free Ordering Systems (&ldquo;<strong>Fee Free</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>&rdquo;) — including the platform at <strong>feefreeordering.com</strong>, the public marketplace at <strong>feefreefood.com</strong>, every restaurant&rsquo;s ordering page hosted by us, our Kitchen Order App, and any future apps we publish. By creating an account or placing an order, you agree to these Terms.
      </p>

      <h2>1. Who we are</h2>
      <p>Fee Free Ordering Systems is a Canadian software platform operated from Ontario, Canada. We provide independent restaurants with the tools they need to take orders online without paying 30% commissions to large food-delivery aggregators. We also operate a public marketplace where customers can discover those restaurants and order from them.</p>

      <h2>2. Who these Terms apply to</h2>
      <p>Different users have different relationships with Fee Free:</p>
      <ul>
        <li><strong>Restaurant Owners</strong> — sign up at /signup, run a restaurant on our platform, optionally subscribe to paid add-ons, optionally list on the marketplace. Sections 4, 5, 6, and 7 apply specifically to you.</li>
        <li><strong>Restaurant Staff</strong> — added by a Restaurant Owner to operate the Kitchen Order App or admin panel. Section 8 applies.</li>
        <li><strong>Customers</strong> — place orders through a restaurant&rsquo;s ordering page, the marketplace, or one of our native apps. Section 9 applies.</li>
        <li><strong>Resellers / Partners</strong> — refer restaurants to Fee Free in exchange for commission. Section 10 applies; the full Reseller Agreement also applies.</li>
      </ul>

      <h2>3. Eligibility</h2>
      <ul>
        <li>You must be at least 18 years old to create an account or place an order.</li>
        <li>To be a Restaurant Owner, you must operate a real, legal restaurant business with the right to serve and sell food in your jurisdiction.</li>
        <li>You must provide accurate, current information when you sign up and keep it updated.</li>
        <li>You&rsquo;re responsible for everything that happens under your account — keep your password safe. Notify us at <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> immediately if you suspect unauthorized access.</li>
      </ul>

      <h2>4. The Fee Free service for restaurants</h2>
      <p>The core platform — admin panel, ordering widget, hosted website, Kitchen Order App, customer database, opening-hours editor, menu editor, basic promotions — is free to use forever. There is no per-order fee on direct orders placed through your own ordering page or hosted site, regardless of order volume.</p>
      <p>Paid add-ons are optional. You only pay for the ones you turn on. Add-on pricing is shown on /pricing and inside /admin/billing/add-ons; we may change pricing on 30 days&rsquo; notice for active subscribers. The current paid add-ons include:</p>
      <ul>
        <li><strong>Online Payments</strong> — accept credit cards via Stripe Connect</li>
        <li><strong>Hosted Website</strong> — auto-generated marketing site at your subdomain</li>
        <li><strong>Multi-Location</strong> — operate multiple branches under one brand</li>
        <li><strong>Custom Domain</strong> — connect your own .com to your ordering page</li>
        <li><strong>Advanced Promotions</strong> — abandoned-cart, loyalty, autopilot campaigns</li>
        <li>Other add-ons listed in /admin/billing/add-ons. Some are marked &ldquo;Coming Soon&rdquo; — those are not yet available for subscription.</li>
      </ul>

      <h2>5. Marketplace listings</h2>
      <p>Restaurant Owners may opt in to list their restaurant on our public marketplace at feefreefood.com. Marketplace listings are subject to additional terms:</p>
      <ul>
        <li>Marketplace orders incur a per-order fee of up to <strong>$3.00 CAD per order</strong>, billed monthly, capped at <strong>$249.99 CAD per restaurant per month</strong>. Or you can choose a flat <strong>$199.99 CAD per month</strong> for unlimited marketplace orders — whichever is cheaper for your volume.</li>
        <li>Marketplace customers must use online payment; cash-only restaurants cannot be listed on the marketplace.</li>
        <li>We reserve the right to remove or suspend any marketplace listing that violates these Terms, our acceptable-use policy, or applicable law.</li>
        <li>Customers acquired through the marketplace can be re-targeted by you through your own customer database after the order completes — they become your customer too.</li>
      </ul>

      <h2>6. Payments + Stripe Connect</h2>
      <p>Restaurants who enable the Online Payments add-on accept credit cards through Stripe Connect. By doing so:</p>
      <ul>
        <li>You agree to Stripe&rsquo;s <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noopener noreferrer">Connected Account Agreement</a> and <a href="https://stripe.com/services-agreement" target="_blank" rel="noopener noreferrer">Services Agreement</a>.</li>
        <li>Customer payments are charged directly on your connected Stripe account using a direct-charge + manual-capture flow. Funds land in your account, not ours.</li>
        <li>Stripe&rsquo;s standard processing fees (typically 2.9% + $0.30 per successful charge) are deducted by Stripe and paid to Stripe; we receive none of those fees.</li>
        <li>Refunds you issue come from your own balance, the same as the original charge. We&rsquo;re not a party to refund disputes — see our Refund Policy.</li>
        <li>You&rsquo;re solely responsible for the legality of your menu items, pricing, taxes, allergens, and food safety in your jurisdiction.</li>
      </ul>

      <h2>7. Restaurant content + intellectual property</h2>
      <p>You retain ownership of everything you upload to Fee Free — menu, prices, descriptions, photos, logos, banners, custom website copy, customer database entries you create. You grant us a non-exclusive license to host, display, and reformat that content as needed to deliver the service (e.g. resize images for thumbnails, translate menu strings via your enabled languages, surface your restaurant on the marketplace if you opt in).</p>
      <p>We retain ownership of the platform itself — the software, design, branding, marketing copy, and any aggregated, anonymized analytics derived from how the platform is used.</p>

      <h2>8. Restaurant staff accounts</h2>
      <p>If you&rsquo;re a Restaurant Staff user added by a Restaurant Owner, you may use the Kitchen Order App or admin panel only to perform work for that restaurant. You may not export customer data, modify menu content beyond your assigned permissions, or take any action outside the scope your Owner has granted. Your access ends when the Restaurant Owner removes you or when their account is closed.</p>

      <h2>9. Customer orders</h2>
      <p>When you place an order through Fee Free:</p>
      <ul>
        <li>You enter a contract for the food directly with the <strong>restaurant</strong>. Fee Free is the technology between you and them — we&rsquo;re not the seller of the food, we don&rsquo;t cook it, and we don&rsquo;t deliver it.</li>
        <li>The restaurant is responsible for fulfilling the order, the food itself (taste, temperature, allergens, freshness), and any delivery they perform with their own staff. If a third-party driver handles delivery via ShipDay, additional terms apply.</li>
        <li>Refunds and order disputes go through the restaurant — see our Refund Policy.</li>
        <li>Marketplace orders carry the same customer terms; you&rsquo;re still ordering from the restaurant, not from us.</li>
      </ul>

      <h2>10. Resellers / Partners</h2>
      <p>If you participate in the partner / reseller program, you may refer restaurants to Fee Free using your referral code or invite link. You earn commission on paid add-on subscriptions for restaurants you refer, per the Reseller Agreement you accept when you apply. Highlights:</p>
      <ul>
        <li>Commissions accrue monthly and pay out once you cross the minimum payout threshold.</li>
        <li>Self-referrals are prohibited (you can&rsquo;t earn commission on your own restaurant).</li>
        <li>We may pause or end the program with reasonable notice. Earned commissions are honored.</li>
      </ul>

      <h2>11. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the platform for any illegal purpose or in violation of any applicable law (food safety, tax, consumer protection, sanctions, etc.)</li>
        <li>Scrape, crawl, or otherwise extract data from the platform without our written permission</li>
        <li>Interfere with the operation of the platform, attempt to gain unauthorized access, or probe for vulnerabilities (responsible disclosure to <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> is welcome)</li>
        <li>Resell or reverse-engineer the platform</li>
        <li>Use the marketplace for menus or content that&rsquo;s deceptive, hateful, sexually explicit, or otherwise inappropriate for a public food directory</li>
        <li>Send spam through our notification or email systems</li>
      </ul>

      <h2>12. Disclaimers + limitation of liability</h2>
      <p>The platform is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the maximum extent allowed by law, we disclaim all warranties — express, implied, or statutory — including merchantability, fitness for a particular purpose, and non-infringement. We don&rsquo;t warrant that the service will be uninterrupted, error-free, or free of harmful components.</p>
      <p>To the maximum extent allowed by law, neither party is liable for indirect, incidental, consequential, special, or punitive damages, even if advised of the possibility. Our total aggregate liability to any user in any 12-month period is limited to the greater of (a) the fees you paid us in that period, or (b) $100 CAD. Nothing here limits liability for fraud, gross negligence, or anything else that cannot be limited by law.</p>

      <h2>13. Indemnification</h2>
      <p>You agree to indemnify and hold Fee Free harmless from any claim, loss, or expense (including reasonable legal fees) arising from your use of the service, your content, your violation of these Terms, or — for Restaurant Owners — claims by your customers about food, refunds, deliveries, or anything else for which you are the responsible seller of the meal.</p>

      <h2>14. Termination</h2>
      <p>You can close your account at any time from /admin/billing or by emailing <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a>. We may suspend or terminate your account if you breach these Terms, abuse the service, or fail to pay add-on fees. Termination doesn&rsquo;t relieve you of obligations accrued before termination (e.g. open invoices, customer orders in flight). Sections that should logically survive (payments, IP, liability, governing law) survive termination.</p>

      <h2>15. Changes to the service or these Terms</h2>
      <p>We&rsquo;re a young product and we will keep changing it. We may add, remove, or modify features. Pricing changes affecting active paid subscribers get 30 days&rsquo; notice. Material changes to these Terms get email notice + 30 days&rsquo; notice on this page; continuing to use the service after the effective date is your acceptance.</p>

      <h2>16. Governing law + disputes</h2>
      <p>These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable there, without regard to conflict-of-laws rules. The courts located in the Greater Toronto Area have exclusive jurisdiction over any dispute, subject to your right to bring small-claims actions in your home jurisdiction where allowed by law.</p>
      <p>Before filing a formal dispute, please email <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a> — we resolve almost everything informally.</p>

      <h2>17. Contact</h2>
      <p>General questions: <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a><br />
      Legal notices: <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a><br />
      Security disclosures: <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a></p>
    </LegalPageShell>
  );
}

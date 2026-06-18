import { cookies } from "next/headers";
import { LegalPageShell } from "@/components/layout/LegalPageShell";

/**
 * Account & data deletion page.
 *
 * Required by Google Play's Data Safety form ("Delete account URL") and Apple:
 * a public page that prominently describes how a user requests deletion of their
 * account + associated data, and what is kept and for how long. Retention figures
 * here MUST stay in sync with the Privacy Policy (/privacy §5). English-only, same
 * as the other legal pages (privacy/terms/refund).
 */
export const metadata = {
  title: "Delete Your Account — Fee Free Ordering",
  description: "How to request deletion of your Fee Free Ordering account and associated data.",
};

export default async function AccountDeletionPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  return (
    <LegalPageShell title="Delete Your Account & Data" lastUpdated="June 18, 2026" locale={locale}>
      <p>
        This page explains how to request deletion of your <strong>Fee Free Ordering</strong> account — including
        the <strong>Fee Free Order App</strong> (our Kitchen Order App) — and the personal data associated with it.
        It applies to restaurant owners, restaurant staff, and customers who hold a Fee Free account.
      </p>

      <h2>How to request deletion</h2>
      <p>
        Email <a href="mailto:support@feefreeordering.com?subject=Delete%20my%20account">support@feefreeordering.com</a> from
        the email address on your account, with the subject line <strong>&ldquo;Delete my account&rdquo;</strong>. So we can
        verify and locate the right account, please include:
      </p>
      <ul>
        <li>The email address on your account</li>
        <li>Your restaurant name (if you are a restaurant owner or staff member)</li>
      </ul>
      <p>
        We confirm every request by replying to that same email address before anything is removed, so no one else can
        delete your account on your behalf. You do not need an active subscription, and there is no charge, to request
        deletion.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your login credentials (email and hashed password)</li>
        <li>Your profile and contact details (name, email, phone)</li>
        <li>For restaurants: your restaurant profile, menu content, uploaded images, staff logins, settings, and connected-service identifiers</li>
        <li>For customers: your saved profile and its association with your order history</li>
      </ul>

      <h2>What we keep, and for how long</h2>
      <p>
        Some records must be retained to meet legal, tax, and fraud-prevention obligations. After these periods they are
        deleted or fully anonymized:
      </p>
      <ul>
        <li><strong>Order and transaction records</strong> are retained for at least <strong>7 years</strong> to satisfy Canadian tax and bookkeeping rules, then anonymized.</li>
        <li>Records tied to an open fraud or security investigation are kept until it is resolved.</li>
      </ul>

      <h2>Timeline</h2>
      <p>
        Confirmed requests are completed within <strong>90 days</strong> (usually much sooner). Deletions are applied to
        the live database immediately and propagate through our 30-day rolling backups within that window.
      </p>

      <h2>Questions</h2>
      <p>
        For anything about this process or the data we hold, email{" "}
        <a href="mailto:support@feefreeordering.com">support@feefreeordering.com</a>. See our{" "}
        <a href="/privacy">Privacy Policy</a> for full detail on how we handle data.
      </p>
    </LegalPageShell>
  );
}

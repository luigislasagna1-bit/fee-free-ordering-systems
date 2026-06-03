"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shared chrome for the three legal pages — Privacy Policy, Terms of
 * Service, and Refund Policy. Keeps the visual structure consistent and
 * means content updates only touch the body, not the page frame.
 *
 * NOT a lawyer-reviewed product. The actual content of each page is a
 * solid v1 template covering the essentials, but Luigi should run all
 * three by a Canadian SaaS lawyer post-soft-launch before he treats
 * them as legally binding. They're good enough for soft-launch UAT
 * and to satisfy Stripe / Apple / Google's "must have these" checks.
 */
export function LegalPageShell({
  title,
  lastUpdated,
  locale,
  children,
}: {
  /** Page title (\"Privacy Policy\", \"Terms of Service\", \"Refund Policy\"). */
  title: string;
  /** Display date shown in the header — last meaningful revision. */
  lastUpdated: string;
  /** Locale forwarded to PublicNav for the language switcher. */
  locale: string;
  /** Page body — semantic HTML structured with h2/p/ul/etc. */
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.legalPageShell");
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        {/* Page header strip */}
        <div className="bg-gradient-to-br from-emerald-50 to-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition mb-4"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("backToHome")}
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">
                  {title}
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                  {t("lastUpdated", { date: lastUpdated ?? "" })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Cross-link bar for the other legal pages — makes navigation easy
            without forcing the user back to the footer. */}
        <nav className="border-b border-gray-100 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap gap-2 text-sm">
            <LegalNavLink href="/privacy" active={title === "Privacy Policy"}>{t("navPrivacy")}</LegalNavLink>
            <LegalNavLink href="/terms" active={title === "Terms of Service"}>{t("navTerms")}</LegalNavLink>
            <LegalNavLink href="/refund" active={title === "Refund Policy"}>{t("navRefunds")}</LegalNavLink>
          </div>
        </nav>

        {/* Body — the actual legal copy. Manually styled (no @tailwindcss/
            typography in this project) but with the same vertical rhythm
            you'd get from prose-classes: h2s have generous top margin,
            paragraphs space cleanly, lists indent properly. */}
        <article className="max-w-3xl mx-auto px-4 py-10 sm:py-14 text-gray-700 leading-relaxed [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2:first-child]:mt-0 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1.5 [&_a]:text-emerald-700 [&_a]:underline hover:[&_a]:text-emerald-800 [&_strong]:text-gray-900">
          {children}
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}

function LegalNavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
        active
          ? "bg-emerald-600 text-white"
          : "bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200"
      }`}
    >
      {children}
    </Link>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

// metadata stays English — static-metadata i18n deferred (same as /marketplace)
export const metadata = {
  title: "Choose a new password — Fee Free Marketplace",
  description: "Set a new password for your Fee Free Marketplace account.",
};

/**
 * Customer-side "set a new password" page.
 *
 * Token is read on the client from the URL ?token=… param — we don't
 * server-side validate it here (the API does at submit time). The page
 * just renders the form and hands the token to it.
 */
export default async function CustomerResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const hasToken = typeof token === "string" && token.length > 0;

  const t = await getTranslations("marketplaceAccount.auth");
  const tResetPage = await getTranslations("customer.resetPage");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">{t("resetTitle")}</h1>
      <p className="text-sm text-gray-600 mt-1">
        {t("resetSubtitle")}
      </p>

      {hasToken ? (
        <ResetPasswordForm token={token!} />
      ) : (
        <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {tResetPage("missingTokenPrefix")}{" "}
          <Link href="/account/forgot-password" className="font-semibold underline">
            {tResetPage("forgotPasswordLink")}
          </Link>
          .
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentCustomer } from "@/lib/customer-session";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// metadata stays English — static-metadata i18n deferred (same as /marketplace)
export const metadata = {
  title: "Reset your password — Fee Free Marketplace",
  description: "Send yourself a password reset link.",
};

export default async function CustomerForgotPasswordPage() {
  // Already signed in? You don't need the reset flow — bounce to account.
  const existing = await getCurrentCustomer();
  if (existing) redirect("/account");

  const t = await getTranslations("marketplaceAccount.auth");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">{t("forgotTitle")}</h1>
      <p className="text-sm text-gray-600 mt-1">
        {t("forgotSubtitle")}
      </p>
      <ForgotPasswordForm />
    </div>
  );
}

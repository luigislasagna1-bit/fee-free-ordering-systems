import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentCustomer } from "@/lib/customer-session";
import { SignupForm } from "./SignupForm";

/**
 * Customer signup. Already-signed-in customers bounce to /account.
 * Server-rendered shell + a small client component for the form
 * (form needs onSubmit / state / fetch / redirect — must be client).
 */
// metadata stays English — static-metadata i18n deferred (same as /marketplace)
export const metadata = {
  title: "Sign up — Fee Free Marketplace",
  description: "Create a marketplace account to track orders and reorder faster.",
};

export default async function CustomerSignupPage() {
  const existing = await getCurrentCustomer();
  if (existing) redirect("/account");

  const t = await getTranslations("marketplaceAccount.auth");
  const tAuth = await getTranslations("auth");
  const tSignupPage = await getTranslations("customer.signupPage");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">{tSignupPage("heading")}</h1>
      <p className="text-sm text-gray-600 mt-1">
        {t("signupSubtitle")}
      </p>
      <SignupForm />
      <p className="mt-6 text-sm text-gray-600">
        {tAuth("alreadyHaveAccount")}{" "}
        <Link href="/account/login" className="text-emerald-600 font-semibold hover:underline">
          {tAuth("signIn")}
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentCustomer } from "@/lib/customer-session";
import { LoginForm } from "./LoginForm";

// metadata stays English — static-metadata i18n deferred (same as /marketplace)
export const metadata = {
  title: "Sign in — Fee Free Marketplace",
  description: "Sign in to your Fee Free Marketplace account.",
};

export default async function CustomerLoginPage() {
  const existing = await getCurrentCustomer();
  if (existing) redirect("/account");

  const t = await getTranslations("marketplaceAccount.auth");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">{t("loginTitle")}</h1>
      <p className="text-sm text-gray-600 mt-1">{t("loginSubtitle")}</p>
      <LoginForm />
      <p className="mt-6 text-sm text-gray-600">
        {t("newHere")}{" "}
        <Link href="/account/signup" className="text-emerald-600 font-semibold hover:underline">
          {t("createAnAccount")}
        </Link>
      </p>
    </div>
  );
}

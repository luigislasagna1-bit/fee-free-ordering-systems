import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-session";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = {
  title: "Reset your password — Fee Free Marketplace",
  description: "Send yourself a password reset link.",
};

export default async function CustomerForgotPasswordPage() {
  // Already signed in? You don't need the reset flow — bounce to account.
  const existing = await getCurrentCustomer();
  if (existing) redirect("/account");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
      <p className="text-sm text-gray-600 mt-1">
        Enter the email on your account. We&apos;ll send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}

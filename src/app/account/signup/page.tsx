import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-session";
import { SignupForm } from "./SignupForm";

/**
 * Customer signup. Already-signed-in customers bounce to /account.
 * Server-rendered shell + a small client component for the form
 * (form needs onSubmit / state / fetch / redirect — must be client).
 */
export const metadata = {
  title: "Sign up — Fee Free Marketplace",
  description: "Create a marketplace account to track orders and reorder faster.",
};

export default async function CustomerSignupPage() {
  const existing = await getCurrentCustomer();
  if (existing) redirect("/account");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
      <p className="text-sm text-gray-600 mt-1">
        Order from any restaurant on the Fee Free Marketplace with one account.
      </p>
      <SignupForm />
      <p className="mt-6 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/account/login" className="text-orange-600 font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

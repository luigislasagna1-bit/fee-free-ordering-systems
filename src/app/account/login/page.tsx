import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-session";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in — Fee Free Marketplace",
  description: "Sign in to your Fee Free Marketplace account.",
};

export default async function CustomerLoginPage() {
  const existing = await getCurrentCustomer();
  if (existing) redirect("/account");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
      <p className="text-sm text-gray-600 mt-1">Sign in to track your orders and reorder faster.</p>
      <LoginForm />
      <p className="mt-6 text-sm text-gray-600">
        New here?{" "}
        <Link href="/account/signup" className="text-emerald-600 font-semibold hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

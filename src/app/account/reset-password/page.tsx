import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
      <p className="text-sm text-gray-600 mt-1">
        Pick something you&apos;ll remember. After you save, you&apos;ll sign in with the new password.
      </p>

      {hasToken ? (
        <ResetPasswordForm token={token!} />
      ) : (
        <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          This reset link is missing its token. Request a new one from the{" "}
          <Link href="/account/forgot-password" className="font-semibold underline">
            forgot password
          </Link>{" "}
          page.
        </div>
      )}
    </div>
  );
}

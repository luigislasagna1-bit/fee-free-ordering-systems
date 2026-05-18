import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Landing page for the email-verification flow.
 *
 *   /verify-email?token=xxx   → the GET API route consumes this, then
 *                               redirects here with ?status=ok or ?status=invalid
 *   /verify-email?status=ok   → green success card
 *   /verify-email?status=invalid → friendly error card with login link
 *   /verify-email             → fallback "check your email" copy
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>;
}) {
  const params = await searchParams;
  const status = params.status;
  // Forward stray ?token= visits to the API route, which is the only writer.
  // This catches old email links that pointed straight at /verify-email instead
  // of /api/auth/verify-email (early versions of the register/resend handlers
  // built the wrong URL — fixed in those handlers, but in-flight emails still
  // work thanks to this hop).
  if (params.token && !status) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(params.token)}`);
  }

  if (status === "ok") {
    return (
      <Frame>
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
        <h1 className="text-3xl font-bold text-gray-900 mt-4">Email verified</h1>
        <p className="text-gray-600 mt-2">
          Your email is now confirmed. You can finish setup and publish your
          restaurant.
        </p>
        <Link
          href="/admin"
          className="inline-block mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition"
        >
          Go to admin
        </Link>
      </Frame>
    );
  }

  if (status === "invalid") {
    return (
      <Frame>
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
        <h1 className="text-3xl font-bold text-gray-900 mt-4">
          Link expired or invalid
        </h1>
        <p className="text-gray-600 mt-2">
          This verification link has already been used or doesn&apos;t match an
          account. Log in and request a new one from your admin dashboard.
        </p>
        <Link
          href="/login"
          className="inline-block mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition"
        >
          Log in
        </Link>
      </Frame>
    );
  }

  // Default — neutral copy, e.g. when the user reaches /verify-email directly.
  return (
    <Frame>
      <h1 className="text-3xl font-bold text-gray-900">Check your email</h1>
      <p className="text-gray-600 mt-2">
        We sent you a verification link. Click it from your inbox to confirm
        your email address.
      </p>
      <p className="text-sm text-gray-500 mt-4">
        Didn&apos;t get the email? Check your spam folder, or log in and click
        &quot;Resend verification&quot; from the admin banner.
      </p>
      <Link
        href="/login"
        className="inline-block mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition"
      >
        Log in
      </Link>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {children}
      </div>
    </main>
  );
}

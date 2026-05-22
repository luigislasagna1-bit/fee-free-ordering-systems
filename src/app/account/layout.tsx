/**
 * Layout wrapper for the customer-facing account section
 * (/account, /account/login, /account/signup, /account/orders).
 *
 * Keeps the page chrome minimal and on-brand with the marketplace.
 * Auth-gated pages (e.g. /account itself) check via getCurrentCustomer()
 * and redirect to /account/login when not signed in.
 */
import Link from "next/link";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-orange-600">
            ← Fee Free Marketplace
          </Link>
          <Link href="/account" className="text-xs font-medium text-gray-500 hover:text-gray-900">
            My account
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

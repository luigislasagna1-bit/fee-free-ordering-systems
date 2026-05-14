import Link from "next/link";
import { ChefHat } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <Link href="/" className="flex items-center gap-2 text-white font-bold text-lg mb-3">
              <ChefHat className="w-6 h-6 text-orange-400" />
              Fee Free Ordering
            </Link>
            <p className="text-sm text-gray-400">Online ordering for restaurants. No commissions, no middlemen.</p>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Product</div>
            <div className="space-y-2 text-sm">
              <Link href="/features" className="block hover:text-white transition">Features</Link>
              <Link href="/pricing" className="block hover:text-white transition">Pricing</Link>
              <Link href="/demo" className="block hover:text-white transition">Demo</Link>
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Support</div>
            <div className="space-y-2 text-sm">
              <Link href="/faq" className="block hover:text-white transition">FAQ</Link>
              <a href="mailto:support@feefreeordering.com" className="block hover:text-white transition">Contact</a>
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Account</div>
            <div className="space-y-2 text-sm">
              <Link href="/login" className="block hover:text-white transition">Log in</Link>
              <Link href="/signup" className="block hover:text-white transition">Start free trial</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-700 pt-6 text-sm text-gray-500 text-center">
          © {new Date().getFullYear()} Fee Free Ordering Systems. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

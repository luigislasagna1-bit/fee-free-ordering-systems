import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { ArrowRight, ShoppingCart, ChefHat, BarChart3 } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <main className="flex-1">
        <section className="py-20 px-4 text-center bg-gradient-to-br from-orange-50 to-red-50">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">See it in action</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Explore our live demo restaurant — Pizza Palace. Try ordering, managing the kitchen, and viewing the admin panel.
          </p>
        </section>

        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
            <div className="bg-white border-2 border-orange-100 rounded-2xl p-8 text-center hover:border-orange-400 hover:shadow-lg transition group">
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mb-5 mx-auto group-hover:bg-orange-200 transition">
                <ShoppingCart className="w-8 h-8 text-orange-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Customer Ordering</h2>
              <p className="text-gray-600 mb-6">Browse the menu, add items to cart, choose pickup or delivery, and place an order.</p>
              <Link
                href="/order/demo-pizza-palace"
                className="inline-flex items-center gap-2 bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition"
              >
                Open Ordering Page <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-white border-2 border-blue-100 rounded-2xl p-8 text-center hover:border-blue-400 hover:shadow-lg transition group">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-5 mx-auto group-hover:bg-blue-200 transition">
                <ChefHat className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Kitchen Display</h2>
              <p className="text-gray-600 mb-6">See live orders, accept or reject, set prep times, and mark orders ready.</p>
              <Link
                href="/kitchen"
                className="inline-flex items-center gap-2 bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-600 transition"
              >
                Open Kitchen App <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-gray-400 mt-3">Login: kitchen@pizzapalace.com / kitchen123</p>
            </div>

            <div className="bg-white border-2 border-green-100 rounded-2xl p-8 text-center hover:border-green-400 hover:shadow-lg transition group">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-5 mx-auto group-hover:bg-green-200 transition">
                <BarChart3 className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Restaurant Admin</h2>
              <p className="text-gray-600 mb-6">Manage your menu, view orders, see reports, edit hours, and configure everything.</p>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 bg-green-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-green-600 transition"
              >
                Open Admin Panel <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-gray-400 mt-3">Login: owner@pizzapalace.com / restaurant123</p>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-gray-50 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Like what you see?</h2>
          <p className="text-gray-600 mb-6">Set up your own restaurant in minutes. Free for 7 days.</p>
          <Link href="/signup" className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-600 transition inline-block">
            Start Free Trial
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

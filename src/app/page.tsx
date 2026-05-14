import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { CheckCircle, Zap, Shield, Star, ArrowRight, ChefHat, Smartphone, BarChart3, Bell } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-500 to-red-600 text-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" /> No per-order fees. Ever.
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Online Ordering for<br />
            <span className="text-yellow-300">Your Restaurant</span>
          </h1>
          <p className="text-xl text-orange-100 mb-10 max-w-2xl mx-auto">
            Accept pickup and delivery orders directly on your website. Keep 100% of every order — no commissions, no middlemen.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-white text-orange-600 font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-50 transition flex items-center justify-center gap-2"
            >
              Start Free 7-Day Trial <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/demo"
              className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-white/10 transition"
            >
              See Live Demo
            </Link>
          </div>
          <p className="text-orange-200 mt-4 text-sm">No credit card required • 7-day free trial • Cancel anytime</p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center px-4">
          {[
            { value: "0%", label: "Commission fees" },
            { value: "$0", label: "Setup cost" },
            { value: "100%", label: "Orders yours to keep" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-4xl font-bold text-orange-500">{stat.value}</div>
              <div className="text-gray-600 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4" id="features">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900">Everything your restaurant needs</h2>
            <p className="text-gray-500 mt-3 text-lg">Built for modern restaurants of every size</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: ChefHat, title: "Kitchen Display", desc: "Real-time order management with sound alerts and status tracking" },
              { icon: Smartphone, title: "Mobile-Friendly", desc: "Customers can order from any device — phone, tablet, or desktop" },
              { icon: BarChart3, title: "Reports & Analytics", desc: "Sales data, top items, customer trends, and revenue reports" },
              { icon: Bell, title: "Instant Notifications", desc: "New orders alert immediately with continuous sound until accepted" },
              { icon: Shield, title: "Secure Payments", desc: "Stripe-powered payments go directly to your bank account" },
              { icon: Star, title: "Coupons & Promos", desc: "Run promotions, discount codes, and loyalty programs" },
            ].map((feat) => (
              <div key={feat.title} className="p-6 rounded-2xl border border-gray-100 hover:border-orange-200 hover:shadow-md transition">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                  <feat.icon className="w-6 h-6 text-orange-500" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{feat.title}</h3>
                <p className="text-gray-500">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Simple, flat-rate pricing</h2>
          <p className="text-gray-500 text-lg mb-10">From $49.99/month. No hidden fees. No per-order commissions.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Starter", price: "$49.99", highlight: false, features: ["Ordering widget", "Menu management", "Order dashboard", "Basic reports"] },
              { name: "Growth", price: "$149.99", highlight: true, features: ["Everything in Starter", "Branded website", "Advanced promotions", "QR stickers"] },
              { name: "Pro", price: "$299.99", highlight: false, features: ["Everything in Growth", "Mobile app", "Multi-location", "Dedicated support"] },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`p-6 rounded-2xl border-2 ${plan.highlight ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white"}`}
              >
                <div className="font-bold text-gray-900 text-xl mb-1">{plan.name}</div>
                <div className="text-3xl font-bold text-orange-500 mb-1">{plan.price}</div>
                <div className="text-sm text-gray-500 mb-4">/month</div>
                <ul className="space-y-2 text-left">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 block w-full py-3 rounded-xl font-semibold text-center transition ${plan.highlight ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="text-orange-500 font-medium mt-6 inline-block hover:underline">
            View full pricing details →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center">
        <h2 className="text-4xl font-bold mb-4">Ready to grow your restaurant?</h2>
        <p className="text-orange-100 text-lg mb-8">Join hundreds of restaurants saving thousands on delivery fees every month.</p>
        <Link
          href="/signup"
          className="bg-white text-orange-600 font-bold px-10 py-4 rounded-xl text-lg hover:bg-orange-50 transition inline-flex items-center gap-2"
        >
          Start Your Free Trial <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}

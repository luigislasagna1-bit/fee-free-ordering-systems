import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { CheckCircle, X } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: 49.99,
    tagline: "Get online fast",
    highlight: false,
    features: [
      { text: "Online ordering widget for your website", included: true },
      { text: "Unlimited menu items", included: true },
      { text: "Order dashboard", included: true },
      { text: "Customer list", included: true },
      { text: "Basic sales reports", included: true },
      { text: "Pickup & delivery support", included: true },
      { text: "Coupon codes", included: true },
      { text: "Email support", included: true },
      { text: "Advanced promotions", included: false },
      { text: "Sales-optimized website", included: false },
      { text: "Branded mobile app", included: false },
    ],
  },
  {
    name: "Growth",
    price: 149.99,
    tagline: "Best for growing restaurants",
    highlight: true,
    features: [
      { text: "Everything in Starter", included: true },
      { text: "Advanced promotions & BOGO deals", included: true },
      { text: "Sales-optimized restaurant website", included: true },
      { text: "Automatic email marketing", included: true },
      { text: "QR code conversion stickers", included: true },
      { text: "Advanced receipt editor", included: true },
      { text: "Customer re-engagement tools", included: true },
      { text: "Priority support", included: true },
      { text: "Branded mobile app", included: false },
      { text: "Multi-location management", included: false },
    ],
  },
  {
    name: "Pro",
    price: 299.99,
    tagline: "High-volume restaurants",
    highlight: false,
    features: [
      { text: "Everything in Growth", included: true },
      { text: "Branded mobile app (iOS & Android)", included: true },
      { text: "Multi-location management", included: true },
      { text: "Advanced analytics dashboard", included: true },
      { text: "Custom integrations", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "24/7 phone support", included: true },
    ],
  },
  {
    name: "Enterprise",
    price: 399.99,
    tagline: "Chains & franchises",
    highlight: false,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Unlimited locations", included: true },
      { text: "White-label solution", included: true },
      { text: "Custom development", included: true },
      { text: "SLA guarantee", included: true },
      { text: "On-site training", included: true },
      { text: "Custom contract", included: true },
    ],
  },
];

const addons = [
  { name: "Advanced Promotions", price: 19.99, desc: "BOGO, tiered discounts, combo deals" },
  { name: "Branded Mobile App", price: 49.99, desc: "Your restaurant's own iOS & Android app" },
  { name: "Sales-Optimized Website", price: 29.99, desc: "Professional restaurant website that converts" },
  { name: "Automatic Marketing", price: 24.99, desc: "Automated email & SMS campaigns" },
  { name: "QR Sticker Kit", price: 14.99, desc: "25 custom branded QR conversion stickers" },
  { name: "Advanced Receipt Editor", price: 9.99, desc: "Custom receipt templates with full branding" },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <main className="flex-1">
        <section className="py-20 px-4 text-center bg-gray-50">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h1>
          <p className="text-xl text-gray-600 max-w-xl mx-auto">
            One flat monthly fee. Zero per-order commissions. Keep every dollar your customers pay.
          </p>
        </section>

        <section className="py-16 px-4">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border-2 p-6 flex flex-col ${plan.highlight ? "border-orange-500 bg-orange-50 relative" : "border-gray-200 bg-white"}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <div className="text-xl font-bold text-gray-900">{plan.name}</div>
                <div className="text-sm text-gray-500 mb-3">{plan.tagline}</div>
                <div className="text-4xl font-bold text-orange-500">${plan.price}</div>
                <div className="text-sm text-gray-500 mb-6">/month</div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={f.included ? "text-gray-700" : "text-gray-400"}>{f.text}</span>
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
        </section>

        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-2">Available Add-ons</h2>
            <p className="text-gray-500 text-center mb-10">Supercharge any plan with optional add-ons</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {addons.map((addon) => (
                <div key={addon.name} className="bg-white p-5 rounded-xl border border-gray-200">
                  <div className="font-bold text-gray-900 mb-1">{addon.name}</div>
                  <div className="text-sm text-gray-500 mb-3">{addon.desc}</div>
                  <div className="text-orange-500 font-bold">+${addon.price}/mo</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Start with a 7-day free trial</h2>
          <p className="text-gray-600 mb-6">No credit card required. Full access to all Starter features.</p>
          <Link href="/signup" className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-600 transition">
            Get Started Free
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

const faqs = [
  {
    q: "How does Fee Free Ordering work?",
    a: "We give your restaurant an online ordering page where customers can browse your menu and place orders. Orders appear instantly on your dashboard and kitchen display. You keep 100% of the order total — we only charge a flat monthly subscription fee.",
  },
  {
    q: "Do you take a commission from my orders?",
    a: "Never. Unlike third-party delivery apps that take 15–30% per order, we charge a simple flat monthly fee. Every dollar your customers pay goes to you.",
  },
  {
    q: "How long does setup take?",
    a: "Most restaurants are up and running in under 30 minutes. You create your account, add your menu, and share your ordering link. No technical skills required.",
  },
  {
    q: "Can I use my own domain name?",
    a: "Yes! On Growth and higher plans, we can set up your ordering page on your own domain (e.g., order.yourrestaurant.com). On Starter, you get a link like feefreeordering.com/order/your-restaurant.",
  },
  {
    q: "How do payments work?",
    a: "We use Stripe to process card payments. Payments go directly to your Stripe account — typically within 2 business days. You can also accept cash on pickup.",
  },
  {
    q: "Does it work for delivery too?",
    a: "Yes! You can accept both pickup and delivery orders. You set your delivery zones, fees, and minimum order amounts. We don't handle delivery drivers — you use your own staff or third-party delivery services.",
  },
  {
    q: "What's the kitchen display system?",
    a: "The Kitchen Display System (KDS) is a web app you can open on a tablet or monitor in your kitchen. New orders appear with a sound alert and continue alerting until your staff acknowledges them. Staff can accept, reject, set prep times, and update order status in real-time.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no contracts or cancellation fees. You can cancel your subscription at any time from your admin panel.",
  },
  {
    q: "What about the 7-day free trial?",
    a: "Your trial gives you full access to all Starter plan features for 7 days, no credit card required. After the trial, you choose a plan to continue — or simply stop using it with no charge.",
  },
  {
    q: "Do you support multiple locations?",
    a: "Multi-location management is available on Pro and Enterprise plans. Each location gets its own menu, ordering page, and order dashboard.",
  },
];

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 py-5">
      <button
        className="w-full flex justify-between items-center text-left font-semibold text-gray-900 text-lg"
        onClick={() => setOpen(!open)}
      >
        {q}
        {open ? <ChevronUp className="w-5 h-5 text-orange-500 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </button>
      {open && <p className="mt-3 text-gray-600 leading-relaxed">{a}</p>}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <main className="flex-1">
        <section className="py-20 px-4 text-center bg-gray-50">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h1>
          <p className="text-xl text-gray-600">Everything you need to know about Fee Free Ordering</p>
        </section>
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            {faqs.map((faq) => (
              <FAQ key={faq.q} {...faq} />
            ))}
          </div>
          <div className="text-center mt-12">
            <p className="text-gray-600 mb-4">Still have questions?</p>
            <a
              href="mailto:support@feefreeordering.com"
              className="text-orange-500 font-semibold hover:underline"
            >
              Contact our support team →
            </a>
          </div>
        </section>
        <section className="py-16 px-4 bg-orange-500 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to try it yourself?</h2>
          <Link href="/signup" className="bg-white text-orange-600 font-bold px-8 py-3 rounded-xl text-lg hover:bg-orange-50 transition inline-block">
            Start 7-Day Free Trial
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

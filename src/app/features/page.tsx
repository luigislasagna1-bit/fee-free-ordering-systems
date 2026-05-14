import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { CheckCircle, ChefHat, Smartphone, BarChart3, Bell, Shield, Star, QrCode, Printer, Globe } from "lucide-react";

const features = [
  {
    category: "Online Ordering",
    items: [
      { icon: Globe, title: "Your Own Ordering Page", desc: "Every restaurant gets a branded ordering page instantly. Share the link anywhere." },
      { icon: Smartphone, title: "Mobile-First Design", desc: "Works perfectly on phones, tablets, and desktops — no app download needed." },
      { icon: QrCode, title: "QR Code Ordering", desc: "Print QR stickers for tables, flyers, and storefronts. Customers scan and order." },
    ],
  },
  {
    category: "Kitchen & Operations",
    items: [
      { icon: ChefHat, title: "Kitchen Display App", desc: "Dedicated screen for your kitchen. New orders pop up with sound alerts until acknowledged." },
      { icon: Bell, title: "Real-Time Updates", desc: "Order status updates instantly for both kitchen staff and customers via live tracking." },
      { icon: Printer, title: "Receipt Printing", desc: "Print customer and kitchen receipts from any browser. Thermal printer support coming." },
    ],
  },
  {
    category: "Growth & Marketing",
    items: [
      { icon: Star, title: "Coupons & Promotions", desc: "Create discount codes, percentage off, free items, and buy-one-get-one deals." },
      { icon: BarChart3, title: "Analytics & Reports", desc: "See your top sellers, busiest hours, average order value, and revenue trends." },
      { icon: Shield, title: "Customer Database", desc: "Build your own customer list. Email marketing and re-engagement tools available." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-orange-50 to-red-50 py-20 px-4 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Everything you need to take orders online</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Fee Free Ordering gives you a complete online ordering system — no technical knowledge required.
          </p>
          <Link href="/signup" className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-600 transition">
            Start 7-Day Free Trial
          </Link>
        </section>

        {features.map((section) => (
          <section key={section.category} className="py-16 px-4 even:bg-gray-50">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">{section.category}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {section.items.map((item) => (
                  <div key={item.title} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                      <item.icon className="w-6 h-6 text-orange-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="py-16 px-4 bg-orange-500 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-orange-100 mb-6">Set up your online ordering in minutes — no tech skills needed.</p>
          <Link href="/signup" className="bg-white text-orange-600 font-bold px-8 py-3 rounded-xl text-lg hover:bg-orange-50 transition">
            Start Free Trial
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

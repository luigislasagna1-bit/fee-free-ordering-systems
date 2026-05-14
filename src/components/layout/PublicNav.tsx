"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X, ChefHat } from "lucide-react";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-orange-500">
          <ChefHat className="w-7 h-7" />
          Fee Free Ordering
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {[
            ["Features", "/features"],
            ["Pricing", "/pricing"],
            ["FAQ", "/faq"],
            ["Demo", "/demo"],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="text-gray-600 hover:text-orange-500 font-medium transition">
              {label}
            </Link>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-gray-700 font-medium hover:text-orange-500 transition">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-orange-500 text-white font-semibold px-5 py-2 rounded-lg hover:bg-orange-600 transition"
          >
            Start Free Trial
          </Link>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
          {[["Features", "/features"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["Demo", "/demo"]].map(([l, h]) => (
            <Link key={h} href={h} className="block text-gray-700 font-medium py-1" onClick={() => setOpen(false)}>
              {l}
            </Link>
          ))}
          <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
            <Link href="/login" className="block text-gray-700 font-medium py-1">Log in</Link>
            <Link href="/signup" className="block bg-orange-500 text-white font-semibold px-5 py-2 rounded-lg text-center">
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

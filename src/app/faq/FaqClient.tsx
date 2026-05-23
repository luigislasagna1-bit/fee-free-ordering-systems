"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

function FAQRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 py-5">
      <button
        className="w-full flex justify-between items-center text-left font-semibold text-gray-900 text-lg"
        onClick={() => setOpen(!open)}
      >
        {q}
        {open ? <ChevronUp className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </button>
      {open && <p className="mt-3 text-gray-600 leading-relaxed">{a}</p>}
    </div>
  );
}

export function FaqClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.faq");
  const tNav = useTranslations("marketing.nav");
  // The FAQ array lives under the same namespace.
  const items = (t.raw("items") as { q: string; a: string }[]) ?? [];
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        <section className="py-20 px-4 text-center bg-gray-50">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">{t("title")}</h1>
          <p className="text-xl text-gray-600">{t("subtitle")}</p>
        </section>
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            {items.map((it) => (
              <FAQRow key={it.q} q={it.q} a={it.a} />
            ))}
          </div>
        </section>
        <section className="py-16 px-4 bg-emerald-500 text-white text-center">
          <Link href="/signup" className="bg-white text-emerald-600 font-bold px-8 py-3 rounded-xl text-lg hover:bg-emerald-50 transition inline-block">
            {tNav("startTrial")}
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

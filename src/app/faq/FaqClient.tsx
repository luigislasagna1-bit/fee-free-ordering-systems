"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { CTASection } from "@/components/marketing/sections";

function FAQRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        className="w-full flex justify-between items-center gap-4 text-left font-semibold text-gray-900 text-base md:text-lg py-5 hover:text-emerald-700 transition"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-emerald-500" : "text-gray-400"}`} />
      </button>
      {open && <p className="pb-5 -mt-1 text-gray-600 leading-relaxed">{a}</p>}
    </div>
  );
}

export function FaqClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.faq");
  const tNav = useTranslations("marketing.nav");
  const h = useTranslations("marketing.home.v2");
  const items = (t.raw("items") as { q: string; a: string }[]) ?? [];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-white" style={{ background: "radial-gradient(80% 80% at 50% 0%, #ecfdf5 0%, rgba(236,253,245,0) 60%), #ffffff" }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.05]">{t("title")}</h1>
            <p className="mt-5 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">{t("subtitle")}</p>
          </div>
        </section>

        {/* Accordion */}
        <section className="px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-3xl mx-auto rounded-3xl border border-gray-200/80 bg-white p-6 md:p-8 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]">
            {items.map((it) => (
              <FAQRow key={it.q} q={it.q} a={it.a} />
            ))}
          </div>
        </section>

        {/* CTA */}
        <CTASection
          title={h("finalCta.title")}
          body={h("finalCta.body")}
          primary={{ href: "/signup", label: tNav("startTrial") }}
          secondary={{ href: "/pricing", label: tNav("pricing") }}
        />
      </main>
      <PublicFooter />
    </div>
  );
}

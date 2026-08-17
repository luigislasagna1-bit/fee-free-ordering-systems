import { getTranslations } from "next-intl/server";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, Bot, ChefHat, Check, CheckCircle2, Clock, Equal, Flag, FlaskConical, Globe, Hash, HelpCircle,
  LayoutDashboard, Layers, ListOrdered, ListTree, MapPin, MessageCircleQuestion, MessageSquareQuote, Phone,
  PhoneCall, PhoneForwarded, PhoneOff, Pizza, Printer, Settings, ShieldCheck, Sparkles, TrendingUp, UserCheck,
  Users, Utensils,
} from "lucide-react";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import {
  MarketingSection, SectionHeading, SectionEyebrow, PrimaryButton, SecondaryButton, StatTrustStrip,
  IconFeatureGrid, NumberedSteps, CTASection, type IconFeature,
} from "@/components/marketing/sections";
import { resolveLocale } from "@/lib/i18n-server";
import { getSessionUser } from "@/lib/session";
import { marketingMetadata } from "@/lib/seo";
import { safeJsonLd } from "@/lib/safe-json-ld";
import { LiveCallDemo } from "./LiveCallDemo";
import { KitchenTicketMockup } from "./KitchenTicketMockup";

export const metadata = marketingMetadata({
  title: "Nabil AI — AI Phone Ordering for Pizzerias, by Former Pizzeria Owners | Fee Free Ordering",
  description:
    "Nabil AI answers your pizzeria's phone and takes the order — half-and-half pizzas, toppings by name, combos, delivery zones — straight into your kitchen through the same checkout as your website. Recordings, transcripts, a timeline for every call. US$0.60 per call-minute, US$249.99/month minimum.",
  path: "/nabil-ai",
});

/* Structural defs — icons live here; every visible word comes from t(). */
const HANDLES: { icon: LucideIcon; key: string }[] = [
  { icon: Pizza, key: "halfHalf" },
  { icon: Layers, key: "combos" },
  { icon: MapPin, key: "delivery" },
  { icon: Sparkles, key: "upsells" },
  { icon: MessageCircleQuestion, key: "faq" },
  { icon: UserCheck, key: "returning" },
  { icon: PhoneForwarded, key: "transfer" },
  { icon: Hash, key: "numbers" },
  { icon: Clock, key: "hours" },
];

const ACCURACY: { icon: LucideIcon; key: string }[] = [
  { icon: ListOrdered, key: "cart" },
  { icon: HelpCircle, key: "asks" },
  { icon: MessageSquareQuote, key: "readback" },
  { icon: Equal, key: "alarm" },
  { icon: ListTree, key: "timeline" },
  { icon: FlaskConical, key: "tests" },
];

const DASHBOARD: { icon: LucideIcon; key: string }[] = [
  { icon: LayoutDashboard, key: "overview" },
  { icon: PhoneCall, key: "calls" },
  { icon: ListTree, key: "detail" },
  { icon: Flag, key: "report" },
  { icon: Settings, key: "settings" },
  { icon: TrendingUp, key: "roi" },
];

const STORY_POINTS: { icon: LucideIcon; key: string }[] = [
  { icon: ChefHat, key: "point1" },
  { icon: ShieldCheck, key: "point2" },
  { icon: Pizza, key: "point3" },
];

const MISSED_STATS: { icon: LucideIcon; key: string }[] = [
  { icon: PhoneOff, key: "stat1" },
  { icon: TrendingUp, key: "stat2" },
  { icon: Users, key: "stat3" },
];

const HANDOFF_CARDS: { key: string; icon: LucideIcon; tone: "emerald" | "amber" | "amber" }[] = [
  { key: "order", icon: Bot, tone: "emerald" },
  { key: "allergy", icon: PhoneForwarded, tone: "amber" },
  { key: "catering", icon: PhoneForwarded, tone: "amber" },
];

const FAQ_COUNT = 10;

export default async function NabilAiPage() {
  const locale = await resolveLocale();
  const t = await getTranslations("marketing.nabil");

  const user = await getSessionUser().catch(() => null);
  const startHref = user?.restaurantId ? "/admin/billing/add-ons" : "/signup?addon=phone_ordering";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  const faqs = Array.from({ length: FAQ_COUNT }, (_, i) => ({ q: t(`faq.q${i + 1}`), a: t(`faq.a${i + 1}`) }));

  const demoNumber = process.env.NEXT_PUBLIC_NABIL_DEMO_NUMBER || null;

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nabil AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${baseUrl}/nabil-ai`,
    description:
      "AI phone ordering agent for pizzerias by Fee Free Ordering: takes half-and-half pizza orders, combos and delivery orders by phone and places them through the restaurant's own online-ordering checkout. Recordings, transcripts and a per-call timeline.",
    offers: {
      "@type": "Offer",
      price: "249.99",
      priceCurrency: "USD",
      description: "US$0.60 per call-minute, US$249.99 per month minimum (whichever is higher). One-time 7-day free demo for restaurants already on a paid Fee Free add-on.",
    },
    provider: { "@type": "Organization", name: "Fee Free Ordering", url: baseUrl },
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  const handles: IconFeature[] = HANDLES.map((h) => ({ icon: h.icon, title: t(`handles.${h.key}.title`), body: t(`handles.${h.key}.body`) }));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqPage) }}
      />

      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden bg-white"
          style={{ background: "radial-gradient(65% 75% at 14% 28%, #ecfdf5 0%, rgba(236,253,245,0) 58%), #ffffff" }}
        >
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div>
              <SectionEyebrow icon={Phone}>{t("hero.eyebrow")} · Nabil AI</SectionEyebrow>
              <h1 className="mt-5 text-4xl md:text-5xl lg:text-[3.3rem] font-extrabold text-gray-900 leading-[1.05] tracking-tight">
                {t.rich("hero.title", { accent: (c) => <span className="text-emerald-600">{c}</span> })}
              </h1>
              <p className="mt-5 text-lg text-gray-700 leading-relaxed max-w-xl">{t("hero.subtitle")}</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <PrimaryButton href={startHref}>{t("hero.ctaStart")}<ArrowRight className="w-4 h-4" /></PrimaryButton>
                <SecondaryButton href="#how-it-works">{t("hero.ctaSecondary")}</SecondaryButton>
              </div>
              <StatTrustStrip className="mt-7" items={[t("hero.trust1"), t("hero.trust2"), t("hero.trust3"), t("hero.trust4")]} />
            </div>

            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-8 -z-10"
                style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0) 70%)" }}
              />
              <div className="rounded-3xl border border-gray-200/80 bg-white p-5 sm:p-6 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-4">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  {t("hero.sampleLabel")}
                </div>
                <div className="space-y-3">
                  <Bubble who="caller" label={t("hero.sampleCaller")}>{t("hero.sample1")}</Bubble>
                  <Bubble who="nabil" label="Nabil">{t("hero.sample2")}</Bubble>
                  <Bubble who="caller" label={t("hero.sampleCaller")}>{t("hero.sample3")}</Bubble>
                  <Bubble who="nabil" label="Nabil">{t("hero.sample4")}</Bubble>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── BUILT BY PIZZERIA OWNERS ─────────────────────────────────── */}
        <MarketingSection tone="emeraldTint">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <SectionHeading eyebrow={t("story.eyebrow")} icon={ChefHat} title={t("story.title")} />
              <p className="mt-6 text-lg text-gray-600 leading-relaxed">{t("story.body1")}</p>
              <p className="mt-4 text-lg text-gray-600 leading-relaxed">{t("story.body2")}</p>
            </div>
            <div className="grid gap-4">
              {STORY_POINTS.map((p) => (
                <div key={p.key} className="flex items-center gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]">
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0">
                    <p.icon className="w-5 h-5" />
                  </span>
                  <span className="font-bold text-gray-900">{t(`story.${p.key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </MarketingSection>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
        <MarketingSection tone="light" id="how-it-works">
          <div className="mb-12">
            <SectionHeading center eyebrow={t("how.eyebrow")} title={t("how.title")} />
          </div>
          <NumberedSteps
            steps={[
              { title: t("how.step1.title"), body: t("how.step1.body"), icon: PhoneForwarded },
              { title: t("how.step2.title"), body: t("how.step2.body"), icon: Bot },
              { title: t("how.step3.title"), body: t("how.step3.body"), icon: Printer },
            ]}
          />
        </MarketingSection>

        {/* ── WHY THE PHONE IS YOUR MOST-MISSED CHANNEL (NEW) ─────────── */}
        <MarketingSection tone="gray">
          <div className="mb-12">
            <SectionHeading center eyebrow={t("missedCalls.eyebrow")} icon={PhoneOff} title={t("missedCalls.title")} subtitle={t("missedCalls.subtitle")} />
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {MISSED_STATS.map((s) => (
              <div key={s.key} className="rounded-2xl border border-gray-200/80 bg-white p-6 text-center shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)]">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 text-red-500 ring-1 ring-red-100 mb-4">
                  <s.icon className="w-6 h-6" />
                </span>
                <div className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">{t(`missedCalls.${s.key}.value`)}</div>
                <p className="mt-1 text-sm text-gray-600">{t(`missedCalls.${s.key}.label`)}</p>
              </div>
            ))}
          </div>
        </MarketingSection>

        {/* ── INTERACTIVE LIVE CALL DEMO (replaces broken screenshots) ─── */}
        <MarketingSection tone="light" id="demo">
          <LiveCallDemo
            heading={t("demo.heading")}
            subheading={t("demo.subheading")}
            playLabel={t("demo.play")}
            replayLabel={t("demo.replay")}
            pauseLabel={t("demo.pause")}
            liveLabel={t("demo.live")}
            orderHeading={t("demo.orderHeading")}
          />
        </MarketingSection>

        {/* ── FROM VOICE TO THE KITCHEN (NEW) ─────────────────────────── */}
        <MarketingSection tone="emeraldTint">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <SectionHeading eyebrow={t("voiceToKitchen.eyebrow")} icon={Utensils} title={t("voiceToKitchen.title")} />
              <p className="mt-6 text-lg text-gray-600 leading-relaxed">{t("voiceToKitchen.body1")}</p>
              <p className="mt-4 text-lg text-gray-600 leading-relaxed">{t("voiceToKitchen.body2")}</p>
              <ul className="mt-6 space-y-3">
                {["bullet1", "bullet2", "bullet3"].map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <span className="text-gray-700">{t(`voiceToKitchen.${b}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <KitchenTicketMockup phoneOrderLabel={t("voiceToKitchen.phoneOrderLabel")} />
          </div>
        </MarketingSection>

        {/* ── HANDOFF BOUNDARIES (NEW) ────────────────────────────────── */}
        <MarketingSection tone="light">
          <div className="mb-12">
            <SectionHeading center eyebrow={t("handoff.eyebrow")} icon={PhoneForwarded} title={t("handoff.title")} subtitle={t("handoff.subtitle")} />
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {HANDOFF_CARDS.map((c) => {
              const isAI = c.tone === "emerald";
              return (
                <div key={c.key} className={`rounded-2xl border p-6 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)] ${isAI ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200/80 bg-white"}`}>
                  <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${isAI ? "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-600 ring-1 ring-amber-100"}`}>
                    <c.icon className="w-5 h-5" />
                  </span>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isAI ? "text-emerald-600" : "text-amber-600"}`}>
                    {t(`handoff.${c.key}.badge`)}
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5">{t(`handoff.${c.key}.title`)}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{t(`handoff.${c.key}.body`)}</p>
                </div>
              );
            })}
          </div>
        </MarketingSection>

        {/* ── WHAT IT HANDLES ──────────────────────────────────────────── */}
        <MarketingSection tone="gray">
          <div className="mb-12">
            <SectionHeading center eyebrow={t("handles.eyebrow")} title={t("handles.title")} subtitle={t("handles.subtitle")} />
          </div>
          <IconFeatureGrid items={handles} />
        </MarketingSection>

        {/* ── WHY IT'S ACCURATE ────────────────────────────────────────── */}
        <MarketingSection tone="light">
          <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
            <div className="lg:col-span-2">
              <SectionHeading eyebrow={t("accuracy.eyebrow")} icon={ShieldCheck} title={t("accuracy.title")} subtitle={t("accuracy.body")} />
            </div>
            <div className="lg:col-span-3 grid sm:grid-cols-2 gap-5">
              {ACCURACY.map((a) => (
                <div key={a.key} className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 mb-3">
                    <a.icon className="w-5 h-5" />
                  </span>
                  <div className="font-bold text-gray-900 text-sm leading-tight">{t(`accuracy.${a.key}.title`)}</div>
                  <p className="text-sm text-gray-600 leading-relaxed mt-1">{t(`accuracy.${a.key}.body`)}</p>
                </div>
              ))}
            </div>
          </div>
        </MarketingSection>

        {/* ── THE DASHBOARD ────────────────────────────────────────────── */}
        <MarketingSection tone="emeraldTint" id="dashboard">
          <div className="mb-12">
            <SectionHeading center eyebrow={t("dashboard.eyebrow")} icon={LayoutDashboard} title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-7 max-w-5xl mx-auto">
            {DASHBOARD.map((d) => (
              <div key={d.key} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0 shadow-sm">
                  <d.icon className="w-5 h-5" />
                </span>
                <div>
                  <div className="font-bold text-gray-900 text-sm leading-tight">{t(`dashboard.${d.key}.title`)}</div>
                  <p className="text-sm text-gray-600 leading-relaxed mt-0.5">{t(`dashboard.${d.key}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </MarketingSection>

        {/* ── SAME SYSTEM AS YOUR WEBSITE ──────────────────────────────── */}
        <MarketingSection tone="light">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="mb-4"><SectionEyebrow>{t("same.eyebrow")}</SectionEyebrow></div>
              <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-gray-900 mb-4 leading-[1.1] tracking-tight">{t("same.title")}</h2>
              <p className="text-lg text-gray-600 mb-7 leading-relaxed">{t("same.body")}</p>
              <ul className="space-y-3.5">
                {["bullet1", "bullet2", "bullet3", "bullet4"].map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <span className="text-gray-700">{t(`same.${b}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <KitchenTicketMockup phoneOrderLabel={t("voiceToKitchen.phoneOrderLabel")} />
          </div>
        </MarketingSection>

        {/* ── LANGUAGES (slim band) ────────────────────────────────────── */}
        <section className="bg-emerald-50/40 border-y border-emerald-100/70">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 flex flex-col md:flex-row items-start md:items-center gap-6">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0 shadow-sm">
              <Globe className="w-7 h-7" />
            </span>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                {t("languages.eyebrow")}
              </div>
              <h2 className="mt-3 text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight">{t("languages.title")}</h2>
              <p className="mt-2 text-gray-600 leading-relaxed max-w-3xl">{t("languages.body")}</p>
            </div>
          </div>
        </section>

        {/* ── TRY IT LIVE (only renders when demo number is configured) ── */}
        {demoNumber && (
          <section className="bg-gradient-to-r from-emerald-500 to-emerald-600">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white mb-5">
                <Phone className="w-3.5 h-3.5" />
                {t("tryLive.eyebrow")}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-3">{t("tryLive.title")}</h2>
              <p className="text-emerald-50 text-lg mb-6 max-w-xl mx-auto">{t("tryLive.body")}</p>
              <a
                href={`tel:${demoNumber}`}
                className="inline-flex items-center gap-3 bg-white text-emerald-700 font-bold px-8 py-4 rounded-2xl text-xl hover:bg-emerald-50 transition duration-200 shadow-lg"
              >
                <Phone className="w-5 h-5" />
                {demoNumber}
              </a>
              <p className="mt-4 text-emerald-100 text-sm">{t("tryLive.note")}</p>
            </div>
          </section>
        )}

        {/* ── PRICING ──────────────────────────────────────────────────── */}
        <MarketingSection tone="light" id="pricing" width="narrow">
          <div className="mb-10">
            <SectionHeading center eyebrow={t("pricing.eyebrow")} title={t("pricing.title")} />
          </div>
          <div className="max-w-3xl mx-auto rounded-3xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-8 md:p-10 shadow-[0_24px_60px_-24px_rgba(16,185,129,0.30)]">
            <div className="grid sm:grid-cols-2 gap-6 items-end">
              <div>
                <div className="text-5xl md:text-6xl font-extrabold text-emerald-600 tracking-tight">{t("pricing.perMinute")}</div>
                <div className="text-gray-600 mt-1 font-medium">{t("pricing.perMinuteLabel")}</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">{t("pricing.minimum")}</div>
                <div className="text-gray-600 mt-1 font-medium">{t("pricing.minimumLabel")}</div>
              </div>
            </div>
            <p className="mt-6 text-gray-700 leading-relaxed">{t("pricing.rule")}</p>
            <div className="mt-4 rounded-xl bg-white border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800 flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{t("pricing.demo")}</span>
            </div>
            <ul className="mt-6 grid sm:grid-cols-2 gap-2.5 text-gray-800">
              {["include1", "include2", "include3", "include4", "include5"].map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{t(`pricing.${k}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <PrimaryButton href={startHref}>{t("pricing.cta")}<ArrowRight className="w-4 h-4" /></PrimaryButton>
            </div>
            <p className="mt-4 text-xs text-gray-500">{t("pricing.note")}</p>
          </div>
        </MarketingSection>

        {/* ── FAQ (FAQPage JSON-LD above) ──────────────────────────────── */}
        <MarketingSection tone="gray" width="narrow">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10 tracking-tight">{t("faq.title")}</h2>
            <div className="space-y-3">
              {faqs.map((f, i) => (
                <details key={f.q} className="group rounded-xl bg-white border border-gray-200 p-5 open:shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]" open={i === 0}>
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-4 font-bold text-gray-900">
                    <span>{f.q}</span>
                    <span className="mt-1 flex-shrink-0 text-emerald-600 transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm text-gray-700 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </MarketingSection>

        {/* ── FINAL CTA ────────────────────────────────────────────────── */}
        <CTASection
          title={t("finalCta.title")}
          body={t("finalCta.body")}
          primary={{ href: startHref, label: t("finalCta.primary") }}
          secondary={{ href: "/pricing", label: t("finalCta.secondary") }}
        />

      </main>
      <PublicFooter />
    </div>
  );
}

function Bubble({ who, label, children }: { who: "caller" | "nabil"; label: string; children: React.ReactNode }) {
  const caller = who === "caller";
  return (
    <div className={`flex ${caller ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          caller ? "bg-gray-100 text-gray-800 rounded-bl-sm" : "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100 rounded-br-sm"
        }`}
      >
        <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${caller ? "text-gray-400" : "text-emerald-600"}`}>{label}</div>
        {children}
      </div>
    </div>
  );
}

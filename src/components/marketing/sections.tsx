import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Reusable marketing section primitives — the LIGHT, high-end design system.
 *
 * The exact existing palette is baked in (emerald-500 #10b981 + gray/slate
 * neutrals; amber/orange only as soft mockup backgrounds). The "premium" feel
 * comes from craft, NOT colour: generous whitespace, soft layered shadows,
 * clean device/browser frames, refined type hierarchy, subtle hover lift.
 * No animation library — Tailwind `transition` only. Presentational +
 * isomorphic (no hooks), so they work in server or client pages.
 *
 * Shared shadow tokens (kept consistent so the whole site reads as one hand):
 *   FRAME  → screenshots/devices: soft, layered, low-opacity
 *   CARD   → feature cards: lighter, lifts slightly on hover
 *   CTA    → primary button: brand-tinted emerald glow
 */
const SHADOW_FRAME =
  "shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]";
const SHADOW_CARD = "shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)]";
const SHADOW_CARD_HOVER = "hover:shadow-[0_16px_40px_-16px_rgba(16,24,40,0.18)]";
const SHADOW_CTA =
  "shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)] hover:shadow-[0_14px_30px_-10px_rgba(16,185,129,0.6)]";

type Tone = "light" | "emeraldTint" | "gray" | "dark" | "emeraldBanner";
const TONE_BG: Record<Tone, string> = {
  light: "bg-white",
  emeraldTint: "bg-emerald-50/40",
  gray: "bg-gray-50",
  dark: "bg-gray-900 text-white",
  emeraldBanner: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white",
};

export function MarketingSection({
  tone = "light", width = "default", className = "", children, id,
}: {
  tone?: Tone;
  width?: "default" | "narrow";
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const max = width === "narrow" ? "max-w-5xl" : "max-w-6xl";
  return (
    <section id={id} className={`${TONE_BG[tone]} ${className}`}>
      <div className={`${max} mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32`}>{children}</div>
    </section>
  );
}

export function SectionEyebrow({
  icon: Icon, children, dark = false,
}: { icon?: LucideIcon; children: ReactNode; dark?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide ${
        dark
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
      }`}
    >
      {Icon ? <Icon className="w-3.5 h-3.5" /> : <span className={`w-1.5 h-1.5 rounded-full ${dark ? "bg-emerald-400" : "bg-emerald-500"}`} />}
      {children}
    </div>
  );
}

/**
 * Shared section intro — eyebrow → title → subtitle with identical rhythm
 * everywhere. Use `center` for centered section headers, omit for left-aligned.
 */
export function SectionHeading({
  eyebrow, title, subtitle, center = false, icon, dark = false, className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  center?: boolean;
  icon?: LucideIcon;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={`${center ? "text-center max-w-2xl mx-auto" : "max-w-2xl"} ${className}`}>
      {eyebrow ? (
        <div className={center ? "flex justify-center mb-5" : "mb-5"}>
          <SectionEyebrow icon={icon} dark={dark}>{eyebrow}</SectionEyebrow>
        </div>
      ) : null}
      <h2 className={`text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.08] ${dark ? "text-white" : "text-gray-900"}`}>
        {title}
      </h2>
      {subtitle ? (
        <p className={`mt-4 text-lg leading-relaxed ${dark ? "text-gray-300" : "text-gray-600"}`}>{subtitle}</p>
      ) : null}
    </div>
  );
}

/** Canonical primary CTA — the ONLY emerald button style on the marketing site. */
export function PrimaryButton({
  href, children, className = "",
}: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition duration-200 hover:-translate-y-0.5 ${SHADOW_CTA} ${className}`}
    >
      {children}
    </Link>
  );
}

/** Canonical secondary (outline) CTA — calm + premium. */
export function SecondaryButton({
  href, children, className = "",
}: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base border border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 transition duration-200 ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * Frames a real product screenshot. `variant`: browser (chrome bar), phone
 * (device bezel), or raw (rounded card). Renders a graceful labelled placeholder
 * until the real screenshot `src` is dropped into /public/marketing/screenshots.
 * `glow` adds a soft emerald halo behind the frame (hero use only).
 */
export function ScreenshotFrame({
  src, alt, variant = "browser", url, glow = false, className = "",
}: {
  src?: string;
  alt: string;
  variant?: "browser" | "phone" | "raw";
  url?: string;
  glow?: boolean;
  className?: string;
}) {
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
  ) : (
    <div className="aspect-[16/10] w-full bg-gradient-to-br from-emerald-50 via-white to-amber-50/60 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-100 text-emerald-500">
        <Check className="w-5 h-5" />
      </span>
      <span className="text-emerald-500/80 text-sm font-medium">{alt}</span>
    </div>
  );

  let frame: ReactNode;
  if (variant === "phone") {
    frame = (
      <div className={`relative mx-auto max-w-[270px] rounded-[2.4rem] border-[8px] border-gray-800 bg-gray-800 ${SHADOW_FRAME} ${className}`}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-800 rounded-b-2xl z-10" />
        <div className="overflow-hidden rounded-[1.7rem] bg-white">{img}</div>
      </div>
    );
  } else if (variant === "raw") {
    frame = <div className={`rounded-2xl overflow-hidden border border-gray-200/80 bg-white ${SHADOW_FRAME} ${className}`}>{img}</div>;
  } else {
    frame = (
      <div className={`rounded-2xl border border-gray-200/80 bg-white overflow-hidden ${SHADOW_FRAME} ${className}`}>
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-50 border-b border-gray-100">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          {url ? (
            <div className="ml-2 flex-1 max-w-[60%]">
              <div className="rounded-md bg-white border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-400 truncate">{url}</div>
            </div>
          ) : null}
        </div>
        {img}
      </div>
    );
  }

  if (glow) {
    return (
      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-10 -z-10"
          style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0) 70%)" }}
        />
        {frame}
      </div>
    );
  }
  return frame;
}

/** Inline "no credit card · 0% commission · …" trust line. */
export function StatTrustStrip({
  items, dark = false, className = "",
}: { items: string[]; dark?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-sm ${dark ? "text-gray-300" : "text-gray-500"} ${className}`}>
      {items.map((it) => (
        <div key={it} className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          {it}
        </div>
      ))}
    </div>
  );
}

/** Alternating image + copy row. `reverse` flips the image to the other side. */
export function AltFeatureRow({
  eyebrow, title, body, bullets = [], cta, image, reverse = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  bullets?: string[];
  cta?: { href: string; label: string };
  image: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
      <div className={reverse ? "lg:order-2" : ""}>
        {eyebrow ? (
          <div className="mb-4"><SectionEyebrow>{eyebrow}</SectionEyebrow></div>
        ) : null}
        <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-gray-900 mb-4 leading-[1.1] tracking-tight">{title}</h2>
        {body ? <p className="text-lg text-gray-600 mb-7 leading-relaxed">{body}</p> : null}
        {bullets.length ? (
          <ul className="space-y-3.5 mb-8">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
                <span className="text-gray-700">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {cta ? (
          <PrimaryButton href={cta.href} className="!px-6 !py-3">
            {cta.label}
            <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
        ) : null}
      </div>
      <div className={reverse ? "lg:order-1" : ""}>{image}</div>
    </div>
  );
}

export type IconFeature = { icon: LucideIcon; title: string; body: string; comingSoon?: boolean; tag?: string };

/** Compact icon + title + 1-line body grid (free-vs-soon aware). */
export function IconFeatureGrid({ items, cols = 3, soonLabel = "Soon" }: { items: IconFeature[]; cols?: 2 | 3; soonLabel?: string }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid ${grid} gap-5`}>
      {items.map((f) => (
        <div
          key={f.title}
          className={`rounded-2xl border border-gray-200/80 bg-white p-6 transition duration-200 hover:-translate-y-0.5 ${SHADOW_CARD} ${SHADOW_CARD_HOVER}`}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.comingSoon ? "bg-gray-100 text-gray-400" : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"}`}>
            <f.icon className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="font-bold text-gray-900">{f.title}</h3>
            {f.comingSoon ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{soonLabel}</span>
            ) : f.tag ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full ring-1 ring-emerald-100">{f.tag}</span>
            ) : null}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Numbered 1-2-3 "how it works" cards. */
export function NumberedSteps({ steps }: { steps: { title: string; body: string; icon?: LucideIcon }[] }) {
  return (
    <div className="grid md:grid-cols-3 gap-5">
      {steps.map((s, i) => (
        <div key={s.title} className={`rounded-2xl border border-gray-200/80 bg-white p-6 ${SHADOW_CARD}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white font-extrabold flex items-center justify-center text-lg">{i + 1}</div>
            {s.icon ? <s.icon className="w-5 h-5 text-emerald-500" /> : null}
          </div>
          <h3 className="font-bold text-gray-900 text-base mb-2">{s.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Grayscale text lockups for the "works with" credibility strip. */
export function LogoStrip({ logos, label }: { logos: string[]; label?: string }) {
  return (
    <div className="border-y border-gray-100 py-8">
      {label ? <div className="text-center text-xs font-bold uppercase tracking-wider text-gray-400 mb-5">{label}</div> : null}
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {logos.map((l) => (
          <span key={l} className="text-sm font-semibold text-gray-400 tracking-tight opacity-70 hover:opacity-100 transition">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Final emerald CTA banner. */
export function CTASection({
  title, body, primary, secondary,
}: {
  title: ReactNode;
  body?: ReactNode;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <MarketingSection tone="emeraldBanner">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-[1.08] tracking-tight">{title}</h2>
        {body ? <p className="text-emerald-50 text-lg mb-9">{body}</p> : null}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primary.href}
            className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-8 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition duration-200 hover:-translate-y-0.5 shadow-lg"
          >
            {primary.label}
            <ArrowRight className="w-4 h-4" />
          </Link>
          {secondary ? (
            <Link
              href={secondary.href}
              className="inline-flex items-center justify-center gap-2 text-white font-bold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition border border-white/40"
            >
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </MarketingSection>
  );
}

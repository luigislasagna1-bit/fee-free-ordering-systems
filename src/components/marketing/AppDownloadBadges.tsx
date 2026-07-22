"use client";
import { useTranslations } from "next-intl";
import { APP_LINKS } from "@/lib/app-links";

/**
 * App Store + Google Play download badges, availability-driven (2026-07-22).
 *
 * Store URLs come from src/lib/app-links.ts (the single switch): a badge is a
 * live link iff its URL is non-null, else it renders with a "Soon" pill —
 * PER BADGE, so the live Kitchen Play listing links while iOS still shows
 * Soon. Flipping a link live in app-links.ts activates every consumer with
 * zero prop changes (the old all-or-nothing `comingSoon` prop is gone).
 *
 * `app` picks which app's links to show (default: the Kitchen Order App);
 * `iosUrl`/`androidUrl` remain as explicit overrides. `onDark` restyles the
 * badge frame for dark backgrounds (PublicFooter). Self-contained styled
 * badges (Apple + Google Play marks inline). "App Store" / "Google Play"
 * are brand names → never translated; the prefix lines + "Soon" pill
 * translate via marketing.home.v2.*.
 */
type Props = {
  /** Which app's store links to render. Default: kitchen. */
  app?: keyof typeof APP_LINKS;
  /** Explicit overrides — default to APP_LINKS[app]. */
  iosUrl?: string | null;
  androidUrl?: string | null;
  /** Dark-background variant (e.g. the gray-900 footer). */
  onDark?: boolean;
  className?: string;
};

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-3.16 2.58-4.68 2.7-4.75-1.47-2.15-3.76-2.45-4.57-2.48-1.95-.2-3.8 1.15-4.78 1.15-.98 0-2.5-1.12-4.11-1.09-2.12.03-4.07 1.23-5.16 3.13-2.2 3.82-.56 9.48 1.58 12.58 1.05 1.52 2.3 3.23 3.94 3.17 1.58-.06 2.18-1.02 4.09-1.02 1.91 0 2.45 1.02 4.12.99 1.7-.03 2.78-1.55 3.82-3.08 1.2-1.77 1.7-3.48 1.72-3.57-.04-.02-3.3-1.27-3.33-5.02zM14.13 4.7c.87-1.05 1.46-2.51 1.3-3.97-1.25.05-2.77.83-3.67 1.88-.81.93-1.51 2.42-1.32 3.85 1.39.11 2.82-.71 3.69-1.76z" />
    </svg>
  );
}
function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
      <path d="M3.6 2.1c-.3.2-.5.6-.5 1.1v17.6c0 .5.2.9.5 1.1l.1.1L13 12.6v-.2L3.7 2l-.1.1z" fill="#00D9FF" />
      <path d="M16.3 15.9 13 12.6v-.2l3.3-3.3.1.1 3.9 2.2c1.1.6 1.1 1.6 0 2.3l-3.9 2.2-.1.1z" fill="#FFCE00" />
      <path d="M16.4 15.8 13 12.5 3.6 21.9c.4.4 1 .4 1.7.1l11.1-6.2" fill="#FF3A44" />
      <path d="M16.4 9.2 5.3 3C4.6 2.6 4 2.7 3.6 3.1l9.4 9.4 3.4-3.3z" fill="#00F076" />
    </svg>
  );
}

function Badge({
  href,
  soonLabel,
  mark,
  line1,
  line2,
  onDark,
}: {
  href: string | null;
  soonLabel: string;
  mark: React.ReactNode;
  line1: string;
  line2: string;
  onDark: boolean;
}) {
  const inner = (
    <span
      className={`inline-flex items-center gap-2.5 rounded-xl bg-gray-900 text-white px-4 py-2.5 border shadow-sm hover:bg-gray-800 transition ${
        onDark ? "border-gray-700" : "border-gray-900"
      }`}
    >
      {mark}
      <span className="text-left leading-tight">
        <span className="block text-[10px] text-gray-300">{line1}</span>
        <span className="block text-base font-semibold -mt-0.5">{line2}</span>
      </span>
    </span>
  );
  if (!href) {
    return (
      <span className="relative inline-block opacity-90">
        {inner}
        <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shadow">{soonLabel}</span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}

export function AppDownloadBadges({ app = "kitchen", iosUrl, androidUrl, onDark = false, className = "" }: Props) {
  const t = useTranslations("marketing.home.v2");
  const soonLabel = t("soon");
  const ios = iosUrl !== undefined ? iosUrl : APP_LINKS[app].ios;
  const android = androidUrl !== undefined ? androidUrl : APP_LINKS[app].play;
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <Badge href={ios} soonLabel={soonLabel} mark={<AppleMark />} line1={t("appBadges.iosLine1")} line2="App Store" onDark={onDark} />
      <Badge href={android} soonLabel={soonLabel} mark={<PlayMark />} line1={t("appBadges.androidLine1")} line2="Google Play" onDark={onDark} />
    </div>
  );
}

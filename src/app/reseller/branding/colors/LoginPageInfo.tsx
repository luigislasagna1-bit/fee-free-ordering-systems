import Link from "next/link";
import { AppDownloadBadges } from "@/components/marketing/AppDownloadBadges";

/**
 * Shown on the "Login page" nav item for FREE reseller partners (no active
 * Branded subscription). Before, this page redirected them to the Branding
 * overview, so they saw nothing about how their restaurants actually log in
 * (Luigi note, 2026-06-24). Now it explains:
 *   - the free, unbranded neutral login (restaurantownerlogin.com) they can
 *     hand to their clients today,
 *   - the standard feefreeordering.com/login fallback,
 *   - the upgrade path to a fully branded login page (their logo/colors/domain),
 *   - where to download the Kitchen Order App.
 *
 * Reseller pages are English-only by convention (not t()-wrapped), so the copy
 * is inline. Pure server component — no client hooks.
 */
export function LoginPageInfo({ neutralHost, appUrl }: { neutralHost: string; appUrl: string }) {
  const neutralUrl = `https://${neutralHost}`;
  const feefreeLogin = `${appUrl.replace(/\/$/, "")}/login`;
  const feefreeLoginLabel = feefreeLogin.replace(/^https?:\/\//, "");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 mb-3">
          Login page
        </span>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Where your restaurants sign in</h1>
        <p className="text-gray-500">
          Give your clients a link to log in and manage their orders. On the Free plan they use our clean,
          unbranded page — upgrade to put your own brand on it.
        </p>
      </div>

      {/* Free — the neutral unbranded login */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 mb-5">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-2">
          <CheckIcon /> INCLUDED FREE
        </span>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Your unbranded login page</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your restaurants sign in at a neutral page with <strong>no &ldquo;Fee Free Ordering&rdquo; branding</strong>{" "}
          anywhere — it simply says &ldquo;Restaurant Login&rdquo;. Share this link with your clients:
        </p>
        <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3">
          <span className="font-mono text-sm text-gray-900 font-semibold flex-1 truncate min-w-0">{neutralHost}</span>
          <a href={neutralUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
            Open ↗
          </a>
        </div>
        <p className="text-xs text-gray-500">
          Prefer the standard page? Your clients can also log in at{" "}
          <a href={feefreeLogin} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700">{feefreeLoginLabel}</a>.
        </p>
      </div>

      {/* Upgrade — branded login */}
      <div className="rounded-2xl border-2 border-gray-900 bg-white p-5 mb-5 relative">
        <span className="absolute -top-3 right-4 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
          Upgrade
        </span>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Want your own branded login page?</h2>
        <p className="text-sm text-gray-600 mb-3">
          Upgrade to <strong>Branded</strong> and your clients log in on a page with <strong>your logo, your colors,
          and your title</strong> — on your own custom domain (your-brand.com). You design it right here once it&rsquo;s unlocked.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li className="flex items-center gap-2"><CheckIcon /> Your logo + brand colors</li>
          <li className="flex items-center gap-2"><CheckIcon /> Your own custom page title</li>
          <li className="flex items-center gap-2"><CheckIcon /> Your own domain (your-brand.com)</li>
          <li className="flex items-center gap-2"><CheckIcon /> Zero Fee Free Ordering branding</li>
        </ul>
        <Link href="/reseller/branding" className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm rounded-lg px-5 py-2.5 transition">
          See Branded — $19.99/mo →
        </Link>
      </div>

      {/* App downloads — shared availability-driven badges (app-links.ts):
          Play links live (launched 2026-07-22), iOS shows "Soon" until Apple
          approves. Replaced the old duplicated inline AppBadge fork. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Kitchen Order App</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your restaurants&rsquo; staff install the Kitchen Order App to accept orders, hear the new-order alarm,
          and print receipts over WiFi. Point them here to download:
        </p>
        <AppDownloadBadges />
        <p className="text-xs text-gray-400 mt-3">
          Live on Google Play now — the iOS version is coming to the App Store. iPad kitchens can use the web app at /kitchen meanwhile.
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
    </svg>
  );
}


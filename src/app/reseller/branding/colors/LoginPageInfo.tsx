import Link from "next/link";

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

      {/* App downloads */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Kitchen Order App</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your restaurants&rsquo; staff install the Kitchen Order App to accept orders, hear the new-order alarm,
          and print receipts over WiFi. Point them here to download:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AppBadge mark="apple" line1="Download on the" line2="App Store" />
          <AppBadge mark="play" line1="Get it on" line2="Google Play" />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Coming soon to the App Store + Google Play — currently in test release. Ask us for early access for your restaurants.
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

/** Coming-soon (non-linking) store badge — apps aren't on the public stores yet. */
function AppBadge({ mark, line1, line2 }: { mark: "apple" | "play"; line1: string; line2: string }) {
  return (
    <span className="relative inline-block opacity-90">
      <span className="inline-flex items-center gap-2.5 rounded-xl bg-gray-900 text-white px-4 py-2.5 border border-gray-900 shadow-sm">
        {mark === "apple" ? <AppleMark /> : <PlayMark />}
        <span className="text-left leading-tight">
          <span className="block text-[10px] text-gray-300">{line1}</span>
          <span className="block text-base font-semibold -mt-0.5">{line2}</span>
        </span>
      </span>
      <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shadow">Soon</span>
    </span>
  );
}

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

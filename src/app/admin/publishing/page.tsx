import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishState } from "@/lib/publishing";
import { listKitchenDevices, FRESHNESS_MS } from "@/lib/kitchen-devices";
import { hasFeature } from "@/lib/entitlements";
import { Globe, Code2, Smartphone, CheckCircle2, AlertCircle, Lock, Tablet } from "lucide-react";
import { PublishToggleClient } from "./PublishToggleClient";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { APP_LINKS } from "@/lib/app-links";
import { AppDownloadBadges } from "@/components/marketing/AppDownloadBadges";
import { setupStepLabel } from "@/lib/setup-step-i18n";
import { SendAppLinkForm } from "./SendAppLinkForm";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import prisma from "@/lib/db";

/** Post-publish deployment checklist. `href: null` = nothing to click (the
 *  action happens on the device itself); "STOREFRONT" resolves to the
 *  restaurant's own most-branded order URL at render time. Keys live under
 *  admin.publishingPage so they translate with the rest of the page. */
const GO_LIVE_STEPS: { key: string; href: string | null }[] = [
  { key: "goLiveStepInstall", href: null },
  { key: "goLiveStepSignIn", href: "/kitchen" },
  { key: "goLiveStepNotifications", href: "/admin/notifications" },
  { key: "goLiveStepPrinting", href: "/admin/receipts" },
  { key: "goLiveStepTestOrder", href: "STOREFRONT" },
  { key: "goLiveStepShare", href: "/admin/website" },
];

export default async function PublishingHubPage() {
  const t = await getTranslations("admin.publishingPage");
  // Localized setup-step labels (2026-07-22 retrofit) — English fallback.
  const tSteps = await getTranslations("admin.setupSteps");
  const user = await getSessionUser();
  // See add-ons/page.tsx for the rationale on this two-step. Superadmins
  // hit /login → re-auth → bounce here → loop. Sending them to /superadmin
  // breaks the cycle.
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [state, devices, hasHostedSite, restaurant] = await Promise.all([
    getPublishState(user.restaurantId),
    listKitchenDevices(user.restaurantId),
    hasFeature(user.restaurantId, "hosted_marketing_page"),
    // Prefill the "send me the link" form with the owner's own contact, and
    // resolve the storefront URL for the go-live checklist's "place a test
    // order" step (branded domain → subdomain → platform apex).
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { phone: true, email: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true },
    }),
  ]);
  const progress = state.progress;
  const isPublished = !!state.publishedAt;
  const publishReady = !!progress?.publishReady;
  const liveDevices = devices.filter((d) => d.isLive);
  const hostedUrl = hasHostedSite ? `/site/${user.restaurantSlug ?? ""}` : null;
  // QR per live store — the owner reads this page on desktop while the PHONE
  // or TABLET needs the app; scanning beats typing. Both stores have been live
  // since 2026-08-15, so an owner on an iPhone is no longer handed an
  // Android-only code. Server-side SVG via the existing `qrcode` dep (same
  // opts as smart-links QR), no client JS. Availability-driven: each QR
  // disappears if app-links.ts ever nulls that listing.
  const [iosQrSvg, playQrSvg] = await Promise.all([
    APP_LINKS.kitchen.ios
      ? QRCode.toString(APP_LINKS.kitchen.ios, { type: "svg", margin: 1, width: 132, errorCorrectionLevel: "M" })
      : null,
    APP_LINKS.kitchen.play
      ? QRCode.toString(APP_LINKS.kitchen.play, { type: "svg", margin: 1, width: 132, errorCorrectionLevel: "M" })
      : null,
  ]);
  // "Place a test order" target — the restaurant's own storefront on its
  // most-branded domain. Falls back to the platform path when no branded
  // host is configured yet.
  const storefrontUrl = restaurant
    ? restaurantOrderUrl({
        slug: restaurant.slug,
        subdomain: restaurant.subdomain,
        customDomain: restaurant.customDomain,
        customDomainStatus: restaurant.customDomainStatus,
      })
    : "/admin/website";
  const storeQrs = [
    { key: "ios", label: "App Store", svg: iosQrSvg },
    { key: "play", label: "Google Play", svg: playQrSvg },
  ].filter((q) => q.svg);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t.rich("pageDescription", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      {/* Status card */}
      <div
        className={`rounded-xl border p-5 flex items-start gap-4 ${
          isPublished
            ? "bg-green-50 border-green-200"
            : publishReady
            ? "bg-emerald-50 border-emerald-200"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        {isPublished ? (
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle
            className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
              publishReady ? "text-emerald-600" : "text-gray-500"
            }`}
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900">
            {isPublished
              ? t("statusPublished")
              : publishReady
              ? t("statusReadyToPublish")
              : t("statusFinishSetup")}
          </h2>
          <p className="text-sm text-gray-700 mt-1">
            {isPublished
              ? t("statusPublishedDetail", { date: state.publishedAt!.toLocaleDateString() })
              : publishReady
              ? t("statusReadyDetail")
              : t("statusStepsRemaining", { count: progress?.requiredStepsRemaining.length ?? 0 })}
          </p>
          {!publishReady && progress && progress.requiredStepsRemaining.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {progress.requiredStepsRemaining.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link href={s.href} className="text-emerald-700 hover:underline">
                    &rarr; {setupStepLabel(tSteps, s)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <PublishToggleClient
          isPublished={isPublished}
          publishReady={publishReady}
        />
      </div>

      {/* Go-live checklist (2026-08-15) — the "you're published, now what?"
          gap. Publishing flips a flag; it does NOT put the app in the owner's
          hand, and an owner whose order device isn't set up is exactly how a
          paid order gets missed. Shown only once published, so it reads as a
          deployment checklist rather than more setup homework. Every step
          links to the screen that actually does it; nothing here duplicates
          the required-steps list above (that one gates publishing, this one
          starts service). */}
      {isPublished && (
        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            {t("goLiveTitle")}
          </h2>
          <p className="text-sm text-gray-600 mt-1">{t("goLiveBody")}</p>
          <ol className="mt-4 space-y-2.5">
            {GO_LIVE_STEPS.map((step, i) => (
              <li key={step.key} className="flex items-start gap-3 text-sm">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-gray-700 leading-relaxed">
                  {step.href ? (
                    <Link
                      href={step.href === "STOREFRONT" ? storefrontUrl : step.href}
                      {...(step.href === "STOREFRONT" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-emerald-700 font-medium hover:underline"
                    >
                      {t(step.key)}
                    </Link>
                  ) : (
                    t(step.key)
                  )}
                </span>
              </li>
            ))}
          </ol>
          {/* Both store badges again, at the moment the owner is actually
              about to start service — this is the highest-intent placement
              in the whole product. */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2.5">{t("goLiveInstallPrompt")}</p>
            <AppDownloadBadges />
          </div>
        </div>
      )}

      {/* Order-taking devices */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Tablet className="w-5 h-5 text-gray-500" />
              {t("orderTakingAppTitle")}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {liveDevices.length > 0 ? (
                <>
                  <span className="text-green-700 font-medium">
                    {t("devicesConnected", { count: liveDevices.length })}
                  </span>{" "}
                  &middot; {t("presenceRefreshes")}
                </>
              ) : devices.length > 0 ? (
                <>
                  {t("noDevicesOnline", { mins: Math.round((Date.now() - devices[0].lastSeenAt.getTime()) / 60_000) })}
                </>
              ) : (
                <>
                  {t.rich("noDeviceRegistered", { code: (chunks) => <code>{chunks}</code> })}
                </>
              )}
            </p>
          </div>
          <Link
            href="/kitchen"
            className="text-sm font-medium text-emerald-600 hover:underline whitespace-nowrap"
          >
            {t("openKitchen")}
          </Link>
        </div>
        {/* Install hub — the Fee Free Order App is on Google Play (2026-07-22)
            AND the App Store (2026-08-15). Availability-driven: the whole
            block hides if app-links.ts ever nulls both URLs, and each QR /
            badge tracks its own listing. This is the target of the
            "Order-taking app connected" setup step. "App Store" / "Google
            Play" are brand names → never translated. */}
        {(APP_LINKS.kitchen.ios || APP_LINKS.kitchen.play) && (
          <div className="mt-4 rounded-lg bg-emerald-50/60 border border-emerald-100 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm">{t("getAppTitle")}</h3>
                <p className="text-xs text-gray-600 mt-0.5">{t("getAppBody")}</p>
                <div className="mt-3"><AppDownloadBadges /></div>
              </div>
              {storeQrs.length > 0 && (
                <div className="flex-shrink-0">
                  <div className="flex gap-3">
                    {storeQrs.map((q) => (
                      <div key={q.key} className="text-center">
                        <div
                          className="inline-block rounded-lg bg-white border border-gray-200 p-2 [&_svg]:block"
                          dangerouslySetInnerHTML={{ __html: q.svg! }}
                        />
                        <p className="text-[11px] font-semibold text-gray-700 mt-1">{q.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 text-center max-w-[300px]">{t("getAppScanHint")}</p>
                </div>
              )}
            </div>
            {/* Send the download link to the owner's own phone/email so they can
                install on the order-taking device without hunting the store. */}
            <SendAppLinkForm defaultEmail={user.email ?? restaurant?.email ?? ""} defaultPhone={restaurant?.phone ?? ""} />
          </div>
        )}
        {devices.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
            {devices.slice(0, 5).map((d) => {
              const mins = Math.max(0, Math.round((Date.now() - d.lastSeenAt.getTime()) / 60_000));
              const fresh = d.lastSeenAt.getTime() >= Date.now() - FRESHNESS_MS;
              return (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        fresh ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <span className="font-medium text-gray-800 truncate">
                      {d.label || (d.userAgent ? d.userAgent.slice(0, 40) : d.deviceHash.slice(0, 8))}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {fresh ? t("deviceOnline") : t("deviceLastSeen", { mins })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Legacy Website — FREE */}
        <Link
          href="/admin/publishing/legacy-website"
          className="group rounded-xl border border-gray-200 bg-white p-5 hover:border-emerald-300 hover:shadow-md transition"
        >
          <div className="flex items-start justify-between">
            <Code2 className="w-8 h-8 text-emerald-500" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {t("badgeFree")}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mt-3">{t("legacyWidgetTitle")}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t("legacyWidgetDescription")}
          </p>
          <div className="mt-3 text-sm text-emerald-600 font-medium group-hover:underline">
            {t("getInstallCode")}
          </div>
        </Link>

        {/* Hosted Website */}
        {hasHostedSite && hostedUrl ? (
          <Link
            href={hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-gray-200 bg-white p-5 hover:border-emerald-300 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <Globe className="w-8 h-8 text-emerald-500" />
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                {t("badgeActive")}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 mt-3">{t("salesOptimizedTitle")}</h3>
            <p className="text-sm text-gray-600 mt-1">
              {t("hostedSiteLive")}
            </p>
            <div className="mt-3 text-sm text-emerald-600 font-medium group-hover:underline">
              {t("viewSite")}
            </div>
          </Link>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <Globe className="w-8 h-8 text-gray-400" />
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                <Lock className="w-3 h-3" /> {t("badgeAddon")}
              </span>
            </div>
            <h3 className="font-semibold text-gray-700 mt-3">{t("salesOptimizedTitle")}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {t.rich("hostedSiteLockedDescription", { code: (chunks) => <code className="text-xs">{chunks}</code> })}
            </p>
            <Link
              href="/admin/billing/add-ons"
              className="mt-3 inline-block text-sm text-gray-600 font-medium hover:underline"
            >
              {t("upgradeToUnlock")}
            </Link>
          </div>
        )}

        {/* Branded Mobile App — LOCKED */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start justify-between">
            <Smartphone className="w-8 h-8 text-gray-400" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
              <Lock className="w-3 h-3" /> {t("badgeAddon")}
            </span>
          </div>
          <h3 className="font-semibold text-gray-700 mt-3">{t("brandedAppTitle")}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {t("brandedAppDescription")}
          </p>
          <Link
            href="/admin/billing/add-ons"
            className="mt-3 inline-block text-sm text-gray-600 font-medium hover:underline"
          >
            {t("upgradeToUnlock")}
          </Link>
        </div>
      </div>
    </div>
  );
}

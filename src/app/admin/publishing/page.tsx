import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishState } from "@/lib/publishing";
import { listKitchenDevices, FRESHNESS_MS } from "@/lib/kitchen-devices";
import { Globe, Code2, Smartphone, CheckCircle2, AlertCircle, Lock, Tablet } from "lucide-react";
import { PublishToggleClient } from "./PublishToggleClient";

export default async function PublishingHubPage() {
  const user = await getSessionUser();
  if (!user?.restaurantId) redirect("/login");

  const [state, devices] = await Promise.all([
    getPublishState(user.restaurantId),
    listKitchenDevices(user.restaurantId),
  ]);
  const progress = state.progress;
  const isPublished = !!state.publishedAt;
  const publishReady = !!progress?.publishReady;
  const liveDevices = devices.filter((d) => d.isLive);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Publishing</h1>
        <p className="text-sm text-gray-600 mt-1">
          Choose how customers can place orders. Every restaurant starts with the free
          Legacy Website widget — paid surfaces unlock as you subscribe to add-ons.
        </p>
      </div>

      {/* Status card */}
      <div
        className={`rounded-xl border p-5 flex items-start gap-4 ${
          isPublished
            ? "bg-green-50 border-green-200"
            : publishReady
            ? "bg-orange-50 border-orange-200"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        {isPublished ? (
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle
            className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
              publishReady ? "text-orange-600" : "text-gray-500"
            }`}
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900">
            {isPublished
              ? "Your restaurant is published"
              : publishReady
              ? "You're ready to publish"
              : "Finish setup before publishing"}
          </h2>
          <p className="text-sm text-gray-700 mt-1">
            {isPublished
              ? `Published ${state.publishedAt!.toLocaleDateString()}. Customers can now order via the widget snippet below.`
              : publishReady
              ? "Click Publish to make your ordering widget live."
              : `${progress?.requiredStepsRemaining.length ?? 0} required step${
                  progress?.requiredStepsRemaining.length === 1 ? "" : "s"
                } remaining.`}
          </p>
          {!publishReady && progress && progress.requiredStepsRemaining.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {progress.requiredStepsRemaining.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link href={s.href} className="text-orange-700 hover:underline">
                    &rarr; {s.label}
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

      {/* Order-taking devices */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Tablet className="w-5 h-5 text-gray-500" />
              Order-taking app
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {liveDevices.length > 0 ? (
                <>
                  <span className="text-green-700 font-medium">
                    {liveDevices.length} device{liveDevices.length === 1 ? "" : "s"} connected
                  </span>{" "}
                  &middot; presence refreshes every minute
                </>
              ) : devices.length > 0 ? (
                <>
                  No devices online right now. Last seen{" "}
                  {Math.round((Date.now() - devices[0].lastSeenAt.getTime()) / 60_000)} min ago.
                </>
              ) : (
                <>
                  No kitchen device has checked in yet. Open <code>/kitchen</code> on a tablet
                  to register it.
                </>
              )}
            </p>
          </div>
          <Link
            href="/kitchen"
            className="text-sm font-medium text-orange-600 hover:underline whitespace-nowrap"
          >
            Open Kitchen &rarr;
          </Link>
        </div>
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
                    {fresh ? "online" : `${mins} min ago`}
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
          className="group rounded-xl border border-gray-200 bg-white p-5 hover:border-orange-300 hover:shadow-md transition"
        >
          <div className="flex items-start justify-between">
            <Code2 className="w-8 h-8 text-orange-500" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              Free
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mt-3">Legacy Website widget</h3>
          <p className="text-sm text-gray-600 mt-1">
            Paste a snippet into your existing website and start taking online orders.
          </p>
          <div className="mt-3 text-sm text-orange-600 font-medium group-hover:underline">
            Get install code &rarr;
          </div>
        </Link>

        {/* Hosted Website — LOCKED */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <Globe className="w-8 h-8 text-gray-400" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Add-on
            </span>
          </div>
          <h3 className="font-semibold text-gray-700 mt-3">Sales Optimized Website</h3>
          <p className="text-sm text-gray-500 mt-1">
            We'll host a marketing page at <code className="text-xs">your-slug.feefreeordering.com</code>.
          </p>
          <Link
            href="/admin/billing/add-ons"
            className="mt-3 inline-block text-sm text-gray-600 font-medium hover:underline"
          >
            Upgrade to unlock &rarr;
          </Link>
        </div>

        {/* Branded Mobile App — LOCKED */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start justify-between">
            <Smartphone className="w-8 h-8 text-gray-400" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Add-on
            </span>
          </div>
          <h3 className="font-semibold text-gray-700 mt-3">Branded Mobile App</h3>
          <p className="text-sm text-gray-500 mt-1">
            Submit your own app to iOS &amp; Android app stores with your branding.
          </p>
          <Link
            href="/admin/billing/add-ons"
            className="mt-3 inline-block text-sm text-gray-600 font-medium hover:underline"
          >
            Upgrade to unlock &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

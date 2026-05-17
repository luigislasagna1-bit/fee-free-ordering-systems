import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishState } from "@/lib/publishing";
import { Globe, Code2, Smartphone, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { PublishToggleClient } from "./PublishToggleClient";

export default async function PublishingHubPage() {
  const user = await getSessionUser();
  if (!user?.restaurantId) redirect("/login");

  const state = await getPublishState(user.restaurantId);
  const progress = state.progress;
  const isPublished = !!state.publishedAt;
  const publishReady = !!progress?.publishReady;

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

import { Image as ImageIcon, Clock } from "lucide-react";

/**
 * /reseller/branding/logo
 *
 * Phase 2 — logo upload UI. Schema is ready (ResellerProfile.brandLogoUrl)
 * but the image-upload pipeline + the surfaces that display the logo
 * (branded login page, white-labeled receipts, email headers) aren't
 * wired yet. We render a clear "coming next" page so the section still
 * makes sense in the sidebar without misleading anyone into trying it.
 */
export default function ResellerLogoPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <ImageIcon className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Logo</h1>
        <p className="text-sm text-gray-500">
          Upload your logo to white-label the platform for your restaurants.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-amber-900 mb-1">Coming soon</h2>
            <p className="text-xs text-amber-900 leading-relaxed mb-2">
              Logo upload + display is a Phase 2 white-label feature. The data layer is ready
              (we&apos;ll store your logo URL on your reseller profile); the surfaces that show
              it — your branded login page, white-labeled receipts, email headers — go live
              alongside the paid white-label add-on.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              In the meantime, you can already set your <strong>imprint</strong> (one-line
              contact footer that appears on receipts + emails for every restaurant you bring
              on). That works today.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

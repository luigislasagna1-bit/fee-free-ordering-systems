import { Globe, Clock } from "lucide-react";

/**
 * /reseller/branding/generic-domain
 *
 * Phase 2 — generic-domain config. Lets the reseller pick a free
 * Fee-Free-owned subdomain (e.g. partner.feefreeordering.com) where
 * their restaurants can land for a partner-branded login experience.
 *
 * Distinct from custom-domain (which uses a domain the reseller owns
 * outright and is the paid tier of the white-label add-on).
 */
export default function ResellerGenericDomainPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Globe className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Generic domain</h1>
        <p className="text-sm text-gray-500">
          A free Fee-Free-hosted partner subdomain for your branded login experience.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-amber-900 mb-1">Coming soon</h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              Generic partner subdomains (e.g. <code className="bg-white/70 px-1 rounded">your-name.feefreeordering.com</code>)
              are a Phase 2 white-label feature. When live, your restaurants will be able to log
              in at your partner-branded URL with your logo + imprint. No DNS configuration
              needed on your end — we handle the wildcard certificate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

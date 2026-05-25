import { Link2, Clock, DollarSign } from "lucide-react";

/**
 * /reseller/branding/custom-domain
 *
 * Phase 2 — custom-domain config (PAID add-on). The reseller points
 * their own domain (DNS CNAME → vercel) at our platform, and we serve
 * the platform under their brand. Requires DNS verification, TLS cert
 * provisioning, and a Stripe subscription on the reseller's account.
 */
export default function ResellerCustomDomainPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Link2 className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Custom domain</h1>
        <p className="text-sm text-gray-500">
          Serve the platform under your own domain (e.g. <code className="bg-gray-100 px-1 rounded">order.yourbrand.com</code>) for a true
          white-label experience.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-bold text-amber-900">Coming soon — paid add-on</h2>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                <DollarSign className="w-2.5 h-2.5" /> Paid
              </span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed mb-2">
              The full white-label add-on includes a custom domain you own (DNS-pointed
              at our infrastructure), TLS provisioning, and full brand isolation — your
              restaurants never see &ldquo;feefreeordering.com&rdquo; anywhere. Pricing will be
              announced when this launches.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              Want early access? Email{" "}
              <a href="mailto:partners@feefreeordering.com" className="font-bold underline">
                partners@feefreeordering.com
              </a>{" "}
              and we&apos;ll add you to the beta list.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

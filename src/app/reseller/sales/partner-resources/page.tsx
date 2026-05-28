import { FileText, Calculator, BarChart3, Briefcase, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * /reseller/sales/partner-resources
 *
 * Resources for the RESELLER's own use during pitching — pitch deck,
 * comparison sheet, ROI calculator, etc. Distinct from
 * /reseller/sales/restaurant-resources which is what the reseller
 * sends TO their prospects.
 *
 * Phase 1: assets are described + placeholder links. As we create
 * actual PDFs / linkable assets, swap the placeholder hrefs to the
 * real URLs. Keeping the page live with descriptions (vs. waiting to
 * launch until every PDF exists) lets resellers see what's coming
 * and start asking us for specific assets they need.
 */
export default function ResellerPartnerResourcesPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Briefcase className="w-3.5 h-3.5" /> For your sales
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Partner Resources</h1>
        <p className="text-sm text-gray-500">
          Materials to use during your own pitch conversations with prospective restaurants.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Resource
          icon={<FileText className="w-5 h-5" />}
          title="Pitch one-pager"
          status="coming-soon"
          body="Single-page PDF you can email or hand a restaurant after a meeting. Explains Fee Free in plain language, shows the 25-30% vs 0% commission delta, and includes a QR code linking to your referral signup URL."
        />
        <Resource
          icon={<BarChart3 className="w-5 h-5" />}
          title="Comparison sheet: Fee Free vs the field"
          status="coming-soon"
          body="Side-by-side comparison with UberEats, DoorDash, GloriaFood, ChowNow. Commission rates, per-order fees, monthly costs, what's included, what's extra. Great for the rational buyer."
        />
        <Resource
          icon={<Calculator className="w-5 h-5" />}
          title="ROI calculator"
          status="coming-soon"
          body="Plug in a restaurant's monthly UberEats/DoorDash spend and see the annual savings of switching to Fee Free. Most restaurants are shocked when they see their own number."
        />
        <Resource
          icon={<FileText className="w-5 h-5" />}
          title="Email templates"
          status="coming-soon"
          body="Cold outreach, follow-up after a meeting, post-signup check-in. Lift the subject lines + body, swap the restaurant name + your name, send."
        />
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-2">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Need something we don&apos;t have yet?</h2>
        <p className="text-xs text-gray-600 leading-relaxed mb-3">
          We&apos;re building these out based on what partners actually use. If you&apos;d find a specific
          asset useful — a video, a slide deck, a one-pager focused on a particular angle — email us and
          we&apos;ll prioritize it.
        </p>
        <a
          href="mailto:partners@feefreeordering.com?subject=Partner%20resource%20request"
          className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-bold hover:underline"
        >
          partners@feefreeordering.com <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed">
        Looking for materials to send <strong>to</strong> the restaurants you&apos;re pitching? See{" "}
        <Link href="/reseller/sales/restaurant-resources" className="text-emerald-700 font-semibold hover:underline">
          Restaurant Resources
        </Link>
        .
      </div>
    </div>
  );
}

function Resource({
  icon, title, body, status,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  status: "ready" | "coming-soon";
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">{icon}</div>
        <h3 className="text-sm font-bold text-gray-900 flex-1">{title}</h3>
        {status === "coming-soon" && (
          <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
            Soon
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

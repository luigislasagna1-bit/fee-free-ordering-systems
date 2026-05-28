import { Video, FileText, MessageCircle, HelpCircle, Send, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * /reseller/sales/restaurant-resources
 *
 * Resources the reseller sends TO prospective restaurants — public-facing
 * collateral that helps the restaurant evaluate Fee Free without the
 * reseller having to explain everything live. Distinct from Partner
 * Resources which is the reseller's own internal toolkit.
 *
 * Phase 1: linkable to public URLs (marketing pages we already have) +
 * placeholders for the assets we still need to build.
 */
export default function ResellerRestaurantResourcesPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Send className="w-3.5 h-3.5" /> For prospects
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Restaurant Resources</h1>
        <p className="text-sm text-gray-500">
          Materials to send to restaurants you&apos;re pitching. Most are public links you can drop
          into an email or text.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Resource
          icon={<FileText className="w-5 h-5" />}
          title="Public partner program page"
          status="ready"
          body="If a restaurant is curious about the program itself (4-tier commission, how it works, FAQ), send them straight here. Open in a new tab to preview."
          href="/partners"
        />
        <Resource
          icon={<FileText className="w-5 h-5" />}
          title="Pricing page"
          status="ready"
          body="Subscription plan + add-on prices, transparent. Restaurants can see exactly what they'd pay — no quote-needed friction."
          href="/pricing"
        />
        <Resource
          icon={<Video className="w-5 h-5" />}
          title="2-minute demo video"
          status="coming-soon"
          body="Short walkthrough of the customer ordering flow + restaurant kitchen display. Drops the &ldquo;is it real?&rdquo; objection in 2 minutes."
        />
        <Resource
          icon={<MessageCircle className="w-5 h-5" />}
          title="Customer testimonials sheet"
          status="coming-soon"
          body="Quotes + first-name + city from real restaurants currently using Fee Free. Powerful for the &ldquo;does this actually work?&rdquo; conversation."
        />
        <Resource
          icon={<HelpCircle className="w-5 h-5" />}
          title="FAQ for restaurant owners"
          status="coming-soon"
          body="The 12 questions restaurants ask most often. Hours of saved back-and-forth — just send the link."
        />
        <Resource
          icon={<Send className="w-5 h-5" />}
          title="Your referral signup link"
          status="ready"
          body="The simplest send: your unique /signup?ref=CODE URL. Restaurants sign up through it and you get auto-attributed. Copy from your Profile & Referral page."
          href="/reseller/profile"
        />
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-2">
        <h2 className="text-sm font-bold text-emerald-900 mb-1">Quick-send email template</h2>
        <p className="text-xs text-emerald-900 mb-3 leading-relaxed">
          Lift this verbatim. Replace [Restaurant Name] and [your name]. Subject line:{" "}
          <em>Quick question about your UberEats fees</em>.
        </p>
        <pre className="text-[11px] text-emerald-900 bg-white/70 rounded p-3 whitespace-pre-wrap leading-relaxed font-mono">
{`Hi [Restaurant Name] team,

Quick question — how much do you spend on UberEats and DoorDash a month?

Most restaurants don't realize they're losing 25-30% commission on every
order. I help restaurants switch to a no-commission platform that lets
them keep the full ticket: Fee Free Ordering.

It's free to start (100 orders/month included on the FREE plan, forever). Add paid services like Online Payments only if/when you want them.

If you're curious: [your referral link]
Or reply to this and I'll set up a 10-minute walkthrough.

— [your name]`}
        </pre>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed mt-4">
        Looking for materials for YOUR own sales conversations? See{" "}
        <Link href="/reseller/sales/partner-resources" className="text-emerald-700 font-semibold hover:underline">
          Partner Resources
        </Link>
        .
      </div>
    </div>
  );
}

function Resource({
  icon, title, body, status, href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  status: "ready" | "coming-soon";
  href?: string;
}) {
  const card = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-emerald-300 transition h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">{icon}</div>
        <h3 className="text-sm font-bold text-gray-900 flex-1">{title}</h3>
        {status === "ready" ? (
          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
            Soon
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
  if (status === "ready" && href) {
    return (
      <a href={href} target={href.startsWith("/reseller") ? undefined : "_blank"} rel="noopener noreferrer" className="block">
        {card}
      </a>
    );
  }
  return card;
}

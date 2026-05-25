import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { Tag, Image as ImageIcon, Link2, Globe, CheckCircle2, Sparkles } from "lucide-react";
import { SubscribeButton } from "./SubscribeButton";

/**
 * /reseller/branding (index)
 *
 * White-label overview + tier selection. Shows the reseller's current
 * subscription state and the two purchase tiers. Branding sub-pages
 * (Imprint, Logo, Generic domain, Custom domain) are accessed from the
 * sidebar — this overview is the landing surface that also serves as
 * the upsell entry point.
 *
 * If active subscription: green banner + "Manage in Stripe" + links to
 * the actual editor pages.
 * If inactive: tier comparison cards + Subscribe CTAs.
 */
export default async function ResellerBrandingPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const sp = await searchParams;

  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      whiteLabelTier: true,
      whiteLabelStatus: true,
      whiteLabelCurrentPeriodEnd: true,
      whiteLabelCancelAtPeriodEnd: true,
      imprint: true,
      brandLogoUrl: true,
    },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  const isActive = profile.whiteLabelStatus === "active";
  const tier = profile.whiteLabelTier;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" /> White-label add-on
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Branding</h1>
        <p className="text-sm text-gray-500">
          Put your brand on the platform: your imprint on every customer email, your logo above
          it, and (with Full) your own domain.
        </p>
      </div>

      {sp.subscribed === "1" && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <div className="font-bold mb-0.5">You&apos;re subscribed.</div>
            <div className="text-xs">
              Your branding is live on outgoing emails. Configure the details in the sidebar:{" "}
              <Link href="/reseller/branding/imprint" className="font-bold underline">Imprint</Link>
              {" · "}
              <Link href="/reseller/branding/logo" className="font-bold underline">Logo</Link>
              {tier === "full" && (
                <>
                  {" · "}
                  <Link href="/reseller/branding/custom-domain" className="font-bold underline">Custom domain</Link>
                </>
              )}
              .
            </div>
          </div>
        </div>
      )}

      {/* Active subscription state */}
      {isActive && tier && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider mb-2">
                <CheckCircle2 className="w-3 h-3" /> Active
              </div>
              <h2 className="text-lg font-bold text-gray-900">
                White-Label {tier === "full" ? "Full" : "Basic"} — ${tier === "full" ? "29" : "9.99"}/mo
              </h2>
              {profile.whiteLabelCurrentPeriodEnd && (
                <p className="text-xs text-gray-500 mt-1">
                  {profile.whiteLabelCancelAtPeriodEnd
                    ? `Ends ${profile.whiteLabelCurrentPeriodEnd.toLocaleDateString()}`
                    : `Renews ${profile.whiteLabelCurrentPeriodEnd.toLocaleDateString()}`}
                </p>
              )}
            </div>
            {tier === "basic" && (
              <SubscribeButton tier="full" label="Upgrade to Full ($29/mo)" />
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FeatureLink
              icon={<Tag className="w-4 h-4" />}
              title="Imprint"
              status={profile.imprint ? "configured" : "not-configured"}
              href="/reseller/branding/imprint"
            />
            <FeatureLink
              icon={<ImageIcon className="w-4 h-4" />}
              title="Logo"
              status={profile.brandLogoUrl ? "configured" : "not-configured"}
              href="/reseller/branding/logo"
            />
            <FeatureLink
              icon={<Globe className="w-4 h-4" />}
              title="Generic domain"
              status="coming-soon"
              href="/reseller/branding/generic-domain"
            />
            <FeatureLink
              icon={<Link2 className="w-4 h-4" />}
              title="Custom domain"
              status={tier === "full" ? "coming-soon" : "locked"}
              href="/reseller/branding/custom-domain"
              lockedHint={tier !== "full" ? "Requires Full tier" : undefined}
            />
          </div>
        </div>
      )}

      {/* Inactive — tier comparison */}
      {!isActive && (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <TierCard
              tier="basic"
              price="$9.99"
              tagline="Email-only branding"
              features={[
                { label: "Custom imprint on customer emails", included: true },
                { label: "Your logo above the imprint", included: true },
                { label: "Custom domain (your-brand.com)", included: false },
                { label: "Branded login page", included: false },
              ]}
            />
            <TierCard
              tier="full"
              price="$29"
              tagline="Full white-label"
              highlight
              features={[
                { label: "Custom imprint on customer emails", included: true },
                { label: "Your logo above the imprint", included: true },
                { label: "Custom domain (your-brand.com)", included: true },
                { label: "Branded login page", included: true },
              ]}
            />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Charged monthly. No trial — cancel anytime from your Stripe receipt or by contacting
            support. The custom-domain piece of Full is still in active development; subscribing
            today gets you the email-side branding immediately + custom domain the moment it
            ships.
          </p>
        </>
      )}
    </div>
  );
}

function TierCard({
  tier, price, tagline, features, highlight,
}: {
  tier: "basic" | "full";
  price: string;
  tagline: string;
  features: { label: string; included: boolean }[];
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-2xl border-2 border-emerald-500 shadow-md bg-white p-6 relative"
          : "rounded-2xl border border-gray-200 bg-white p-6"
      }
    >
      {highlight && (
        <div className="absolute -top-3 right-4 bg-emerald-500 text-white text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full">
          Recommended
        </div>
      )}
      <div className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">
        White-Label {tier === "full" ? "Full" : "Basic"}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl font-extrabold text-gray-900">{price}</span>
        <span className="text-sm text-gray-500">/month</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">{tagline}</p>
      <ul className="space-y-1.5 mb-5">
        {features.map((f) => (
          <li
            key={f.label}
            className={`text-xs flex items-start gap-2 ${f.included ? "text-gray-800" : "text-gray-400 line-through"}`}
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${f.included ? "text-emerald-500" : "text-gray-300"}`}
            />
            {f.label}
          </li>
        ))}
      </ul>
      <SubscribeButton tier={tier} label={`Subscribe — ${price}/mo`} />
    </div>
  );
}

function FeatureLink({
  icon, title, status, href, lockedHint,
}: {
  icon: React.ReactNode;
  title: string;
  status: "configured" | "not-configured" | "coming-soon" | "locked";
  href: string;
  lockedHint?: string;
}) {
  const styles: Record<string, string> = {
    configured: "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
    "not-configured": "border-gray-200 bg-gray-50 hover:border-emerald-300",
    "coming-soon": "border-amber-200 bg-amber-50",
    locked: "border-gray-200 bg-gray-100 opacity-70 cursor-not-allowed",
  };
  const card = (
    <div className={`rounded-lg border p-3 ${styles[status]} transition`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-gray-700">{icon}</span>
        <span className="text-xs font-bold text-gray-900">{title}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wider font-bold">
        {status === "configured" && <span className="text-emerald-700">Configured</span>}
        {status === "not-configured" && <span className="text-gray-500">Not set</span>}
        {status === "coming-soon" && <span className="text-amber-700">Coming soon</span>}
        {status === "locked" && <span className="text-gray-500">{lockedHint ?? "Locked"}</span>}
      </div>
    </div>
  );
  if (status === "locked") return card;
  return (
    <Link href={href} className="block">
      {card}
    </Link>
  );
}

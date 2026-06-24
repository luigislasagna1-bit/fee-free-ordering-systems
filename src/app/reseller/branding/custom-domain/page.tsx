import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { Link2, Info } from "lucide-react";
import { CustomDomainClient } from "./CustomDomainClient";

/**
 * /reseller/branding/custom-domain
 *
 * Server shell — loads the reseller's current domain state + tier
 * status and hands it to the client component for interactivity.
 *
 * Auth: must be a reseller view with an approved profile. Anything
 * else redirects back to the holding page (consistent with the rest
 * of /reseller/**).
 *
 * Tier gate: the UI itself handles the "upgrade to Branded ($19.99/mo)"
 * affordance when whiteLabelTier !== "full". We don't redirect — the
 * page renders + shows an in-context upgrade CTA so the reseller
 * understands what they're paying for.
 */
export default async function ResellerCustomDomainPage() {
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
      customDomain: true,
      customDomainStatus: true,
      customDomainAddedAt: true,
      customDomainError: true,
    },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Link2 className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Custom domain</h1>
        <p className="text-sm text-gray-500">
          Point your own domain at the platform login + reseller landing pages so
          your restaurants log in with your brand instead of ours.
        </p>
      </div>

      <CustomDomainClient
        initial={{
          domain: profile.customDomain,
          status: profile.customDomainStatus,
          addedAt: profile.customDomainAddedAt,
          error: profile.customDomainError,
          tier: profile.whiteLabelTier as "basic" | "full" | null,
          active: profile.whiteLabelStatus === "active",
        }}
      />

      <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-2 text-xs text-gray-600">
          <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900 mb-1">How custom domains work here</p>
            <ul className="list-disc pl-4 space-y-1 leading-relaxed">
              <li>
                Pick a subdomain you control (e.g. <code className="bg-gray-100 px-1 rounded">login.yourbrand.com</code>).
                We strongly recommend a subdomain over your apex — it keeps your main marketing
                site untouched and DNS is simpler.
              </li>
              <li>
                After you click <strong>Connect</strong> we register the domain with our hosting
                provider and show you the DNS records to add at your registrar (GoDaddy /
                Namecheap / Cloudflare / etc).
              </li>
              <li>
                Once DNS propagates we issue a free SSL certificate automatically (Let&apos;s Encrypt
                via Vercel). The whole process is usually under 30 minutes; sometimes faster.
              </li>
              <li>
                When verified, your branded login page goes live on your domain. Your imprint
                + logo continue to flow onto restaurant emails. You can disconnect anytime and
                we&apos;ll free the domain.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

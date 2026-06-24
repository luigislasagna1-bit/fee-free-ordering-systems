import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { Globe, Info } from "lucide-react";
import { GenericDomainClient } from "./GenericDomainClient";

/**
 * /reseller/branding/generic-domain
 *
 * Free Fee-Free-hosted subdomain (e.g. acme.feefreeordering.com).
 * Available on BOTH white-label tiers (Basic AND Full) — no DNS required.
 *
 * Distinct from /custom-domain which requires the Full tier and a domain
 * the reseller owns + DNS-configures themselves.
 *
 * The wildcard cert + DNS record is set on the platform domain in Vercel
 * one time; from that point any slug a reseller claims here goes live
 * within ~60s (LRU TTL on the proxy).
 */
export default async function ResellerGenericDomainPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      whiteLabelStatus: true,
      whiteLabelTier: true,
      genericSubdomain: true,
    },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  const platformDomain = process.env.PLATFORM_DOMAIN || "feefreeordering.com";
  const active = profile.whiteLabelStatus === "active";

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Globe className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Generic subdomain</h1>
        <p className="text-sm text-gray-500">
          A free Fee-Free-hosted subdomain for your branded login experience. No DNS
          configuration needed — pick a slug and it goes live immediately.
        </p>
      </div>

      <GenericDomainClient
        initial={{
          subdomain: profile.genericSubdomain,
          platformDomain,
          tier: profile.whiteLabelTier as "basic" | "full" | null,
          active,
        }}
      />

      <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-2 text-xs text-gray-600">
          <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900 mb-1">How generic subdomains work here</p>
            <ul className="list-disc pl-4 space-y-1 leading-relaxed">
              <li>
                Pick a short slug — 3–63 characters, lowercase letters, numbers, and
                hyphens. Your branded login lives at{" "}
                <code className="bg-gray-100 px-1 rounded">your-slug.{platformDomain}</code>.
              </li>
              <li>
                No DNS to configure on your end — we host the wildcard certificate. Goes
                live within ~60 seconds of saving.
              </li>
              <li>
                Reserved words (<code className="bg-gray-100 px-1 rounded">www</code>,{" "}
                <code className="bg-gray-100 px-1 rounded">app</code>,{" "}
                <code className="bg-gray-100 px-1 rounded">api</code>, etc.) are blocked.
                Slugs are unique across the platform — first claimed, first served.
              </li>
              <li>
                Your imprint + logo flow onto the login page automatically. When your
                white-label subscription lapses, the URL stops resolving until you
                resubscribe (the claim is preserved — no need to re-pick the slug).
              </li>
              <li>
                Want your own domain instead (e.g.{" "}
                <code className="bg-gray-100 px-1 rounded">login.yourbrand.com</code>)?
                Upgrade to the Branded plan and use{" "}
                <a href="/reseller/branding/custom-domain" className="text-emerald-600 font-semibold underline">
                  Custom domain
                </a>{" "}
                instead.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { getAddOnBillingState } from "@/lib/dunning";
import { getDomainProvider, type DnsRecord } from "@/lib/domains/provider";
import { AddOnBillingNotice } from "@/components/admin/AddOnBillingNotice";
import { DomainClient } from "./DomainClient";

export default async function DomainPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId ?? "";

  const [r, hasCustomDomain, billingState] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        slug: true,
        subdomain: true,
        customDomain: true,
        customDomainStatus: true,
        customDomainAddedAt: true,
        customDomainError: true,
        pendingCustomDomain: true,
        previousCustomDomain: true,
      },
    }),
    // Paid feature gate — custom_domain_routing is the slug granted by
    // the $9.99/mo Custom Domain add-on. Restaurants without it can
    // still SEE the page but the connect form is replaced with an
    // upgrade CTA (cleaner than hiding the page entirely, since the
    // page also explains what the add-on does).
    hasFeature(restaurantId, "custom_domain_routing"),
    // Dunning state for the Custom Domain add-on — drives the grace /
    // downgraded notice so the owner knows exactly why their domain is now
    // forwarding to the free link (Luigi 2026-06-15).
    getAddOnBillingState(restaurantId, "custom_domain"),
  ]);

  if (!r) return null;

  // DNS records for whichever domain still needs registrar work — the
  // pending switch target, or the live domain when it isn't verified yet.
  // Computed SERVER-SIDE (mirrors GET /api/admin/domain) so the records
  // table survives page reloads instead of living only in post-connect
  // client state (the 2026-07-30 incident's "I was never told which
  // records" gap).
  let dnsRecords: DnsRecord[] | null = null;
  const needsSetup = r.pendingCustomDomain
    ? r.pendingCustomDomain
    : r.customDomain && r.customDomainStatus !== "verified"
      ? r.customDomain
      : null;
  if (needsSetup) {
    try {
      dnsRecords = await getDomainProvider().getDomainSetup(needsSetup);
    } catch (e: any) {
      console.warn("[domain page] getDomainSetup failed:", e?.message);
    }
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <AddOnBillingNotice state={billingState} addOnSlug="custom_domain" />
      </div>
      <DomainClient
      initial={{
        slug: r.slug,
        subdomain: r.subdomain ?? r.slug,
        customDomain: r.customDomain,
        customDomainStatus: r.customDomainStatus,
        pendingCustomDomain: r.pendingCustomDomain,
        previousCustomDomain: r.previousCustomDomain,
      }}
      initialDnsRecords={dnsRecords}
      platformDomain={process.env.PLATFORM_DOMAIN || "localtest.me"}
      providerIsDevStub={(process.env.DOMAIN_PROVIDER || "local").toLowerCase() === "local"}
      hasCustomDomainAddOn={hasCustomDomain}
    />
    </>
  );
}

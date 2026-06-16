import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { getAddOnBillingState } from "@/lib/dunning";
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
      }}
      platformDomain={process.env.PLATFORM_DOMAIN || "localtest.me"}
      providerIsDevStub={(process.env.DOMAIN_PROVIDER || "local").toLowerCase() === "local"}
      hasCustomDomainAddOn={hasCustomDomain}
    />
    </>
  );
}

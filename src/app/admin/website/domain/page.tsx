import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { DomainClient } from "./DomainClient";

export default async function DomainPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId ?? "";

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      slug: true,
      subdomain: true,
      customDomain: true,
      customDomainStatus: true,
      customDomainAddedAt: true,
      customDomainError: true,
    },
  });

  if (!r) return null;

  return (
    <DomainClient
      initial={{
        slug: r.slug,
        subdomain: r.subdomain ?? r.slug,
        customDomain: r.customDomain,
        customDomainStatus: r.customDomainStatus,
      }}
      platformDomain={process.env.PLATFORM_DOMAIN || "localtest.me"}
      providerIsDevStub={(process.env.DOMAIN_PROVIDER || "local").toLowerCase() === "local"}
    />
  );
}

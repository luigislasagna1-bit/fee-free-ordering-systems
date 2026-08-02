import "server-only";
import prisma from "@/lib/db";
import { bareHost, hostCandidates } from "@/lib/domains/host-candidates";

/**
 * Host → tenant resolution for the /.well-known/{assetlinks.json,
 * apple-app-site-association} deep-link routes (Luigi 2026-08-02).
 *
 * Deliberately mirrors the gates in the CANONICAL host resolver
 * (src/app/api/internal/resolve-host/route.ts) rather than re-deriving
 * them — that file documents a real cross-tenant hijack that was caught in
 * review (2026-07-30, see its comments) from exactly this kind of resolver
 * divergence: `isActive: true` (a deactivated/churned restaurant must not
 * keep answering) and, for custom domains, `customDomainStatus: "verified"`
 * (an unverified pending claim carries no ownership proof — DNS can point
 * here before verify-custom runs, or a stale claim can dangle after the
 * owner walks away). Both `.well-known` routes are PUBLIC and cacheable, so
 * getting this wrong publishes a deep-link vouching statement for a host the
 * claimant doesn't yet — or no longer — own.
 *
 * Subdomain suffix comes from PLATFORM_DOMAIN (same env var + fallback as
 * src/proxy.ts) instead of a hardcoded ".feefreeordering.com" — the
 * hardcode silently no-ops in local dev / any non-default platform domain.
 */
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "localtest.me";

export async function resolveWellKnownTenant(hostHeader: string) {
  const host = bareHost(hostHeader);
  if (!host) return null;

  const sub = host.endsWith(`.${PLATFORM_DOMAIN}`) ? host.slice(0, -(PLATFORM_DOMAIN.length + 1)) : null;
  const where = sub
    ? { subdomain: sub, isActive: true }
    : { customDomain: { in: hostCandidates(host) }, isActive: true, customDomainStatus: "verified" };

  return prisma.restaurant.findFirst({
    where: where as any,
    select: {
      brandedAppProject: {
        select: {
          platforms: {
            // A suspended app (billing lapse / policy takedown / owner
            // request — see status.ts) must stop vouching for the domain
            // the moment it's suspended; every other pipeline stage keeps
            // serving so testers can verify links pre-launch.
            where: { status: { not: "suspended" } },
            select: { platform: true, packageName: true, certSha256: true },
          },
          credentials: {
            where: { kind: "apple_asc_key", appleTeamId: { not: null } },
            select: { appleTeamId: true },
          },
        },
      },
    },
  });
}

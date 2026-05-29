/**
 * Domain provider abstraction. The admin domain UI talks to this interface,
 * not directly to any specific host. Swap the implementation via the
 * DOMAIN_PROVIDER env var without touching the UI.
 *
 *   DOMAIN_PROVIDER=vercel     → use Vercel Domains API (auto Let's Encrypt SSL)
 *   DOMAIN_PROVIDER=cloudflare → Cloudflare for SaaS (deferred — stub for now)
 *   DOMAIN_PROVIDER=local      → no-op dev stub (default when unset)
 */

export type DnsRecordType = "CNAME" | "A" | "TXT";

export interface DnsRecord {
  type: DnsRecordType;
  name: string;    // e.g. "@" or "www" or "_vercel"
  value: string;   // e.g. "cname.vercel-dns.com" or "76.76.21.21"
  ttl?: number;
}

export interface DomainStatus {
  verified: boolean;
  ssl: "issuing" | "active" | "error" | "unknown";
  error?: string;
}

export interface DomainProvider {
  name: string;
  isDevStub: boolean;
  /** Register the domain with the host so it knows to route + issue SSL. */
  addDomain(host: string): Promise<{ dnsRecords: DnsRecord[]; status: DomainStatus }>;
  /** Poll status — used while waiting for DNS to propagate and SSL to issue. */
  getDomainStatus(host: string): Promise<DomainStatus>;
  /** Force a verification check (some providers expose a manual re-check). */
  verifyDomain(host: string): Promise<DomainStatus>;
  /** Tell the host to stop accepting this domain. */
  removeDomain(host: string): Promise<void>;
}

import { localProvider } from "./local";
import { vercelProvider } from "./vercel";

export function getDomainProvider(): DomainProvider {
  const raw = process.env.DOMAIN_PROVIDER;
  const which = (raw || "local").toLowerCase();

  // In production we REFUSE to silently use the local stub. Missing the
  // env var or having a typo would otherwise mean customers / partners
  // think their domains are live (UI shows "verified") but Vercel was
  // never told about them — visitors get ERR_CONNECTION_CLOSED. This is
  // an actual production bug we hit 2026-05-28 (Luigi's reseller UAT).
  // Now we throw at the route handler level instead, surfacing a clear
  // 502/500 to the admin/reseller UI rather than the silent fake.
  if (process.env.NODE_ENV === "production" && which !== "vercel" && which !== "cloudflare") {
    throw new Error(
      `Domain provider misconfigured in production: DOMAIN_PROVIDER=${raw ?? "(unset)"}. ` +
      `Set it to "vercel" + provide VERCEL_TOKEN + VERCEL_PROJECT_ID.`,
    );
  }

  switch (which) {
    case "vercel":
      return vercelProvider;
    case "cloudflare":
      // Not yet implemented — fall back to local stub for safety in dev.
      // In prod we already threw above, so this branch is dev-only.
      console.warn("[domains] DOMAIN_PROVIDER=cloudflare requested but not implemented; using local stub");
      return localProvider;
    case "local":
    default:
      return localProvider;
  }
}

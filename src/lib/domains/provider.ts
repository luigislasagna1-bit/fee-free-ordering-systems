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
  const which = (process.env.DOMAIN_PROVIDER || "local").toLowerCase();
  switch (which) {
    case "vercel":
      return vercelProvider;
    case "cloudflare":
      // Not yet implemented — fall back to local stub for safety.
      console.warn("[domains] DOMAIN_PROVIDER=cloudflare requested but not implemented; using local stub");
      return localProvider;
    case "local":
    default:
      return localProvider;
  }
}

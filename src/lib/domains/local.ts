import type { DomainProvider, DomainStatus, DnsRecord } from "./provider";

/**
 * Local-dev stub for the domain provider. Lets the entire admin domain UX
 * work without a real Vercel/Cloudflare account, by simulating a successful
 * registration with a short fake delay. Logs the "what would have happened"
 * so it's obvious in the terminal that you're not actually shipping a domain.
 */
class LocalProvider implements DomainProvider {
  name = "local";
  isDevStub = true;

  async addDomain(host: string): Promise<{ dnsRecords: DnsRecord[]; status: DomainStatus }> {
    // SAFETY: the local stub MUST NEVER run in production. If it does,
    // it silently fakes successful domain operations — owners think
    // their custom domains are live, but Vercel was never told to route
    // them, so visitors get ERR_CONNECTION_CLOSED. We hit this exact
    // bug 2026-05-28 (Luigi's reseller UAT) when DOMAIN_PROVIDER wasn't
    // set in production env vars and we silently fell back to the stub.
    // Now we throw loudly instead — better a clear server error in the
    // admin UI than silently broken domains in customer-facing flows.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Domain provider is misconfigured: the local stub is active in production. " +
        "Set DOMAIN_PROVIDER=vercel + VERCEL_TOKEN + VERCEL_PROJECT_ID in Vercel env vars.",
      );
    }
    console.log(`[domains/local] addDomain ${host} — would have registered with provider`);
    // Mirror the apex-vs-subdomain distinction the real Vercel provider
    // makes so dev stub output is realistic. Apex (host.tld) → A record
    // at @ (CNAME forbidden by RFC 1035). Subdomain → CNAME at the
    // relative subdomain name.
    const isApex = host.split(".").length === 2;
    const apex = host.split(".").slice(-2).join(".");
    const relativeName = host === apex ? "@" : host.slice(0, -(apex.length + 1));
    return {
      dnsRecords: isApex
        ? [
            { type: "A", name: "@", value: "76.76.21.21" },
            { type: "TXT", name: "_verify", value: `feefree-verify-${host}` },
          ]
        : [
            { type: "CNAME", name: relativeName, value: "cname.<your-host-provider>.example" },
            { type: "TXT", name: "_verify", value: `feefree-verify-${host}` },
          ],
      status: { verified: false, ssl: "unknown" },
    };
  }

  async getDomainStatus(host: string): Promise<DomainStatus> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local domain provider stub is active in production. Set DOMAIN_PROVIDER=vercel.");
    }
    console.log(`[domains/local] getDomainStatus ${host} — pretending verified after first poll`);
    return { verified: true, ssl: "active" };
  }

  async verifyDomain(host: string): Promise<DomainStatus> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local domain provider stub is active in production. Set DOMAIN_PROVIDER=vercel.");
    }
    console.log(`[domains/local] verifyDomain ${host} — accepting verification`);
    return { verified: true, ssl: "active" };
  }

  async removeDomain(host: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      // For removal we don't throw — silently no-op is the safer behavior
      // since a misconfigured prod that THEN gets fixed shouldn't leave
      // orphan rows behind. The Disconnect button will appear to succeed
      // even though Vercel never had the domain registered.
      console.warn("[domains/local] removeDomain called in production with stub provider — no-op");
      return;
    }
    console.log(`[domains/local] removeDomain ${host}`);
  }
}

export const localProvider = new LocalProvider();

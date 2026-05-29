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
    console.log(`[domains/local] getDomainStatus ${host} — pretending verified after first poll`);
    return { verified: true, ssl: "active" };
  }

  async verifyDomain(host: string): Promise<DomainStatus> {
    console.log(`[domains/local] verifyDomain ${host} — accepting verification`);
    return { verified: true, ssl: "active" };
  }

  async removeDomain(host: string): Promise<void> {
    console.log(`[domains/local] removeDomain ${host}`);
  }
}

export const localProvider = new LocalProvider();

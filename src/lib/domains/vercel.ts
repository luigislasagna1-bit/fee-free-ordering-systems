import type { DomainProvider, DomainStatus, DnsRecord } from "./provider";

/**
 * Vercel Domains API implementation. Requires:
 *   VERCEL_TOKEN       — personal/team token with "domains:write" scope
 *   VERCEL_PROJECT_ID  — the project to bind tenant domains to
 *   VERCEL_TEAM_ID     — optional, only when the project lives under a team
 *
 * SSL is automatic via Let's Encrypt once the domain verifies.
 *
 * Endpoints used (docs: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project):
 *   POST   /v10/projects/{id}/domains             addDomain
 *   GET    /v10/projects/{id}/domains/{domain}    getDomainStatus
 *   POST   /v10/projects/{id}/domains/{domain}/verify
 *   DELETE /v10/projects/{id}/domains/{domain}    removeDomain
 */

const API_BASE = "https://api.vercel.com";

function teamQuery(): string {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : "";
}

function authHeaders(): HeadersInit {
  const token = process.env.VERCEL_TOKEN || "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function projectId(): string {
  const id = process.env.VERCEL_PROJECT_ID;
  if (!id) throw new Error("VERCEL_PROJECT_ID env var is missing");
  return id;
}

/**
 * Convert a fully-qualified host into the RELATIVE name a registrar UI
 * expects in its "Name" / "Host" field.
 *
 *   "login.luigiswings.com"  → "login"
 *   "app.partner.example.com" → "app.partner"
 *   "luigiswings.com"        → "@"            (apex sentinel)
 *
 * `inputHost` is the domain the reseller typed into our UI — we use it
 * to figure out the apex relative to which we're computing the name.
 * If `fqdn === inputHost` and it has exactly two labels, it's the apex.
 * Otherwise we strip the apex suffix from `fqdn` to get the relative
 * label(s).
 *
 * Known limitation: a 2-label heuristic mis-classifies .co.uk / .com.au
 * (where the apex is 3 labels). Public-suffix-list support is a
 * post-launch polish — for our launch customer base (mostly US/CA .com
 * + a handful of .ca) this is fine, and the misclassification mode is
 * "shows wrong Name field once" not "loses data."
 */
function isApex(host: string): boolean {
  // host.tld → 2 labels → apex
  return host.split(".").length === 2;
}

function toRegistrarName(fqdn: string, inputHost: string): string {
  if (fqdn === inputHost && isApex(inputHost)) return "@";

  // Figure out the apex (last two labels of inputHost), then strip it
  // from fqdn. If fqdn doesn't end with apex, surface the raw fqdn —
  // probably a verification host like `_vercel.example.com` that we
  // should let the registrar accept as-is.
  const apex = inputHost.split(".").slice(-2).join(".");
  if (fqdn === apex) return "@";
  if (fqdn.endsWith(`.${apex}`)) {
    return fqdn.slice(0, -(apex.length + 1));
  }
  return fqdn;
}

class VercelProvider implements DomainProvider {
  name = "vercel";
  isDevStub = false;

  async addDomain(host: string): Promise<{ dnsRecords: DnsRecord[]; status: DomainStatus }> {
    const url = `${API_BASE}/v10/projects/${projectId()}/domains${teamQuery()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: host }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Vercel addDomain failed (${res.status})`);

    // Vercel returns a `verification` array describing what TXT/CNAME the user
    // needs to add. For most hosts they need a single CNAME pointing at
    // cname.vercel-dns.com — we surface both forms so the UI can show whichever
    // applies.
    //
    // CRITICAL: registrars want the RELATIVE name (e.g. "login" for
    // login.luigiswings.com), not the FQDN Vercel returns. And RFC 1035 forbids
    // CNAME at the apex — so for an apex input we have to emit an A record at
    // "@" pointing at Vercel's anycast IP instead of the misleading
    // "CNAME @ → cname.vercel-dns.com" we used to show.
    const verification = (data.verification ?? []) as Array<{
      type: string; domain: string; value: string; reason?: string;
    }>;
    const dnsRecords: DnsRecord[] = verification.map((v) => ({
      type: (v.type as DnsRecordType) ?? "TXT",
      name: toRegistrarName(v.domain, host),
      value: v.value,
    }));
    if (dnsRecords.length === 0) {
      // No specific verification needed — typical case for a subdomain on a
      // platform that already has its apex registered with Vercel.
      if (isApex(host)) {
        // Apex domains can't have CNAME — use Vercel's anycast A record.
        // 76.76.21.21 is the documented Vercel A-record IP for apex domains.
        dnsRecords.push({ type: "A", name: "@", value: "76.76.21.21" });
      } else {
        dnsRecords.push({
          type: "CNAME",
          name: toRegistrarName(host, host),
          value: "cname.vercel-dns.com",
        });
      }
    }

    return {
      dnsRecords,
      status: { verified: data.verified === true, ssl: data.verified ? "issuing" : "unknown" },
    };
  }

  async getDomainStatus(host: string): Promise<DomainStatus> {
    const url = `${API_BASE}/v9/projects/${projectId()}/domains/${encodeURIComponent(host)}${teamQuery()}`;
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      return { verified: false, ssl: "error", error: data?.error?.message || `HTTP ${res.status}` };
    }
    return {
      verified: data.verified === true,
      ssl: data.verified ? "active" : "issuing",
    };
  }

  async verifyDomain(host: string): Promise<DomainStatus> {
    const url = `${API_BASE}/v9/projects/${projectId()}/domains/${encodeURIComponent(host)}/verify${teamQuery()}`;
    const res = await fetch(url, { method: "POST", headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      return { verified: false, ssl: "error", error: data?.error?.message || `HTTP ${res.status}` };
    }
    return {
      verified: data.verified === true,
      ssl: data.verified ? "active" : "issuing",
    };
  }

  async removeDomain(host: string): Promise<void> {
    const url = `${API_BASE}/v9/projects/${projectId()}/domains/${encodeURIComponent(host)}${teamQuery()}`;
    const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any)?.error?.message || `Vercel removeDomain failed (${res.status})`);
    }
  }
}

// Locally-typed alias so we don't depend on the broader DnsRecordType.
type DnsRecordType = "CNAME" | "A" | "TXT";

export const vercelProvider = new VercelProvider();

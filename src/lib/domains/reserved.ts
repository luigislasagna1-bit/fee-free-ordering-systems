/**
 * Reserved subdomain labels that tenants cannot claim. These are kept here in
 * one place so both client (subdomain picker) and server (save handler) reject
 * the same set, and so future product subdomains (e.g. `status.<platform>`)
 * stay safe to add.
 */
export const RESERVED_SUBDOMAINS = new Set<string>([
  // Platform / product routes
  "www", "app", "api", "admin", "kitchen", "login", "signup",
  "dashboard", "console", "portal", "marketing",
  // Infra / mail
  "mail", "email", "smtp", "imap", "pop", "ns", "ns1", "ns2",
  "mx", "mx1", "mx2", "dns", "cdn", "static", "assets", "media",
  "img", "images", "files", "uploads",
  // Common environment names
  "dev", "stage", "staging", "test", "qa", "preview", "preprod",
  "prod", "production", "demo", "sandbox", "beta", "alpha", "edge",
  // Brand / legal
  "help", "support", "docs", "blog", "press", "legal", "terms",
  "privacy", "billing", "pay", "payment", "payments", "checkout",
  "secure", "auth", "oauth", "sso",
  // Common tools we might add
  "status", "metrics", "monitor", "health", "ping",
  // Generic
  "root", "host", "server", "info", "about", "contact",
]);

export function isReservedSubdomain(value: string): boolean {
  return RESERVED_SUBDOMAINS.has(value.toLowerCase());
}

/** Format constraint: 3-63 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen. */
export const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

export function validateSubdomainFormat(value: string): { ok: true } | { ok: false; reason: string } {
  if (!value) return { ok: false, reason: "Required" };
  if (value.length < 3) return { ok: false, reason: "Must be at least 3 characters" };
  if (value.length > 63) return { ok: false, reason: "Must be 63 characters or fewer" };
  if (!SUBDOMAIN_RE.test(value)) {
    return { ok: false, reason: "Only lowercase letters, numbers, and hyphens — no leading or trailing hyphen" };
  }
  if (isReservedSubdomain(value)) return { ok: false, reason: "That subdomain is reserved" };
  return { ok: true };
}

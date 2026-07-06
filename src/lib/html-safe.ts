/**
 * Small HTML-safety helpers for the few places we build markup by hand
 * (email templates) or accept a URL from a restaurant owner (hosted-site CTA).
 * React auto-escapes children, so these are ONLY for the manual sinks.
 */

/** Escape a string for safe interpolation into HTML text or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * Allowlist an owner-supplied href to schemes that can't execute script.
 * Same-origin relative paths (/, #, ?) pass; http/https/mailto/tel pass;
 * everything else (javascript:, data:, vbscript:, ...) returns `fallback`.
 * The scheme is read as the chars before the first ':' with any non
 * scheme-character removed, so a tab/newline-obfuscated `java\tscript:`
 * collapses to `javascript` and is rejected (browsers ignore those chars
 * when parsing the scheme).
 */
export function sanitizeExternalHref(href: string | null | undefined, fallback = ""): string {
  if (typeof href !== "string") return fallback;
  const trimmed = href.trim();
  if (!trimmed) return fallback;
  if (/^[/#?]/.test(trimmed)) return trimmed; // same-origin relative / fragment / query
  const colon = trimmed.indexOf(":");
  if (colon === -1) return trimmed; // no scheme -> relative-ish, not a script-exec vector
  const scheme = trimmed.slice(0, colon).replace(/[^a-zA-Z0-9+.-]/g, "").toLowerCase();
  return ALLOWED_SCHEMES.has(scheme) ? trimmed : fallback;
}

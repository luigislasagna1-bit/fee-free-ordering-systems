/**
 * Branded Mobile App — wizard field validation + identifier derivation
 * (Luigi 2026-08-02). Pure module: shared verbatim by the wizard client
 * (instant feedback), the admin API routes (server truth — never trust the
 * client), and the build-manifest generator.
 *
 * Store limits enforced here (2026 rules):
 *  - App display name: 3–30 chars (both stores cap at 30)
 *  - Play short description ≤ 80
 *  - Full description ≤ 4000
 *  - Bundle ID / applicationId: Java-package rules — dot-separated segments,
 *    each starting with a letter, [a-z0-9_] after, ≥2 segments. Android
 *    additionally forbids uppercase in practice (Play convention) — we emit
 *    lowercase only.
 */

export type FieldError = { field: string; code: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHAR = new RegExp("[\\u0000-\\u001F\\u007F]");

export const APP_NAME_MIN = 3;
export const APP_NAME_MAX = 30;
export const SHORT_DESC_MAX = 80;
export const FULL_DESC_MAX = 4000;

export type BrandedAppDraft = {
  appName?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  supportEmail?: string | null;
  privacyPolicyUrl?: string | null;
  primaryColorHex?: string | null;
  platformsRequested?: string | null;
  appIconUrl?: string | null;
  splashIconUrl?: string | null;
};

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Same Vercel Blob hostname gate as menu/import-pdf/route.ts — icon/splash
 *  URLs are fetched server-side by build tooling (gen-customer-assets.js)
 *  and rendered in superadmin, so an unconstrained URL is an SSRF vector
 *  (internal metadata endpoints, LAN hosts). Only our own upload-url route
 *  can mint URLs on this host, so this also rejects any URL the owner didn't
 *  get from OUR uploader. */
export function isValidBlobUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && /^[a-z0-9.-]+\.public\.blob\.vercel-storage\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Control characters can break the string downstream in contexts that don't
 *  get to re-validate: Android XML resources, gradle args, App/Play Store
 *  metadata. Only ever applied to single-line fields (appName) — rejecting
 *  newline/tab too is correct there, not just the "truly dangerous" bytes.
 *  Built from \u escapes, never typed as literal bytes — a raw control byte
 *  inside this source file previously broke every text tool that touched it
 *  (git diff, grep, editors) by making the file look binary. */
export function hasControlChars(v: string): boolean {
  return CONTROL_CHAR.test(v);
}

/** Per-field validation of whatever the wizard has so far (partial saves OK —
 *  only provided fields are checked). */
export function validateDraft(d: BrandedAppDraft): FieldError[] {
  const errors: FieldError[] = [];
  if (d.appName != null && d.appName !== "") {
    const n = d.appName.trim();
    if (n.length < APP_NAME_MIN) errors.push({ field: "appName", code: "too_short" });
    else if (n.length > APP_NAME_MAX) errors.push({ field: "appName", code: "too_long" });
  }
  if (d.shortDescription != null && d.shortDescription.length > SHORT_DESC_MAX) {
    errors.push({ field: "shortDescription", code: "too_long" });
  }
  if (d.fullDescription != null && d.fullDescription.length > FULL_DESC_MAX) {
    errors.push({ field: "fullDescription", code: "too_long" });
  }
  if (d.supportEmail != null && d.supportEmail !== "" && !EMAIL.test(d.supportEmail.trim())) {
    errors.push({ field: "supportEmail", code: "invalid" });
  }
  if (d.privacyPolicyUrl != null && d.privacyPolicyUrl !== "" && !isValidHttpUrl(d.privacyPolicyUrl.trim())) {
    errors.push({ field: "privacyPolicyUrl", code: "invalid" });
  }
  if (d.primaryColorHex != null && d.primaryColorHex !== "" && !HEX_COLOR.test(d.primaryColorHex.trim())) {
    errors.push({ field: "primaryColorHex", code: "invalid" });
  }
  if (d.platformsRequested != null && !["android", "ios", "both"].includes(d.platformsRequested)) {
    errors.push({ field: "platformsRequested", code: "invalid" });
  }
  // appIconUrl/splashIconUrl are fetched server-side by build tooling and
  // rendered in superadmin — must be OUR uploader's URL, not attacker-chosen
  // (SSRF / arbitrary-image-in-store-listing otherwise).
  if (d.appIconUrl != null && d.appIconUrl !== "" && !isValidBlobUrl(d.appIconUrl.trim())) {
    errors.push({ field: "appIconUrl", code: "invalid" });
  }
  if (d.splashIconUrl != null && d.splashIconUrl !== "" && !isValidBlobUrl(d.splashIconUrl.trim())) {
    errors.push({ field: "splashIconUrl", code: "invalid" });
  }
  if (d.appName != null && d.appName !== "" && hasControlChars(d.appName)) {
    errors.push({ field: "appName", code: "invalid" });
  }
  return errors;
}

/** Fields that must ALL be present + valid before the owner may approve
 *  (approval freezes the config the pipeline builds from). */
export function approvalBlockers(d: BrandedAppDraft): FieldError[] {
  const errors = validateDraft(d);
  const required: Array<[keyof BrandedAppDraft, string]> = [
    ["appName", "required"],
    ["shortDescription", "required"],
    ["fullDescription", "required"],
    ["supportEmail", "required"],
    ["privacyPolicyUrl", "required"],
    ["appIconUrl", "required"],
  ];
  for (const [field, code] of required) {
    const v = d[field];
    if (v == null || String(v).trim() === "") errors.push({ field, code });
  }
  return errors;
}

// ── Bundle-ID / applicationId derivation ────────────────────────────────────

const SEGMENT = /^[a-z][a-z0-9_]*$/;

/** Java keywords that cannot be package segments (the ones that plausibly
 *  appear in domain names). */
const RESERVED = new Set([
  "abstract", "case", "catch", "class", "const", "default", "do", "else",
  "enum", "final", "for", "goto", "if", "import", "in", "int", "interface",
  "is", "native", "new", "package", "private", "public", "return", "static",
  "switch", "this", "try", "void", "while",
]);

function sanitizeSegment(raw: string): string | null {
  let s = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!s) return null;
  if (/^[0-9]/.test(s)) s = `x${s}`; // segments must start with a letter
  if (RESERVED.has(s)) s = `${s}app`;
  return SEGMENT.test(s) ? s : null;
}

/**
 * Derive a default bundle ID from the restaurant's own domain so the app is
 * branded as THEIRS inside their own store accounts (it lives there forever —
 * Apple 4.2.6). "luigis-lasagna.com" → "com.luigislasagna.orderapp".
 * Falls back to the platform namespace + slug when no custom domain exists:
 * "com.feefreeordering.customer.<slug>". Superadmin can override while the
 * platform row is still draft; immutable once live.
 */
export function deriveBundleId(opts: { customDomain?: string | null; slug: string }): string {
  const { customDomain, slug } = opts;
  if (customDomain) {
    const host = customDomain.trim().toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    if (parts.length >= 2) {
      // Reverse the registrable parts: luigis-lasagna.com → com.luigislasagna
      const reversed = [...parts].reverse().map(sanitizeSegment);
      if (reversed.every((p): p is string => p !== null)) {
        return [...reversed, "orderapp"].join(".");
      }
    }
  }
  const slugSeg = sanitizeSegment(slug) ?? "restaurant";
  return `com.feefreeordering.customer.${slugSeg}`;
}

/** Full validity check for a (possibly admin-overridden) bundle ID. */
export function isValidBundleId(id: string): boolean {
  if (id.length < 3 || id.length > 150) return false;
  const parts = id.split(".");
  if (parts.length < 2) return false;
  return parts.every((p) => SEGMENT.test(p) && !RESERVED.has(p));
}

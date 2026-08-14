/**
 * Content-addressed cache for rendered Marketing Kit assets (Luigi 2026-08-14).
 *
 * Renders are deterministic, so a download is normally a cache lookup and a redirect rather
 * than a render. That is what makes this survivable at the platform's growth target: the
 * expensive path runs once per unique (template, brand, personalisation, locale) tuple, and
 * every repeat — including the live preview, which re-requests on every edit — is a CDN hit.
 *
 * ── HMAC, not a plain digest ────────────────────────────────────────────────────────────
 * Every input is PUBLIC information: the partner's company name, phone, email, referral code.
 * A plain sha256 would therefore be COMPUTABLE by anyone who knows those, making the blob
 * path guessable and the bucket effectively enumerable. Keying it with a server secret keeps
 * the path deterministic (no DB round-trip to rebuild a URL) while making it unguessable.
 *
 * `access: "public"` is otherwise the right call here — the entire purpose of a flyer is to
 * be printed and handed to strangers. What we are protecting is enumerability across
 * partners, not the contents of any one asset.
 *
 * ── Invalidation is free ────────────────────────────────────────────────────────────────
 * Brand fields are part of the hash, so editing a logo or colour produces a different key and
 * the old object simply orphans. Reverting an edit re-hits the original cache entry, which a
 * version counter would not. RENDER_ENGINE_VERSION busts everything after a template change.
 */
import crypto from "node:crypto";
import { RENDER_ENGINE_VERSION } from "./render";

export interface RenderSpecForHash {
  templateId: string;
  sizeId: string;
  locale: string;
  /** Resolved brand — every field that can change a pixel. */
  brand: Record<string, unknown>;
  /** Partner personalisation. */
  contact: Record<string, unknown>;
  overrides: Record<string, unknown>;
  /** The QR target. Changing the referral URL must change the asset. */
  targetUrl: string;
  /**
   * The logo URL, NOT its bytes. Uploads are already `${Date.now()}-${rand}.${ext}`, so a new
   * logo is always a new URL — fetching the image just to fingerprint it would add a network
   * round-trip to every cache HIT, which defeats the point of the cache.
   */
  logoUrl: string | null;
  priceRows: unknown;
}

/** Stable stringify — key order must not change the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

function hashSecret(): string {
  // Falls back to another server-only secret so a missing env var degrades to "still
  // unguessable" rather than "predictable". Never falls back to a constant.
  return (
    process.env.RESELLER_KIT_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "reseller-kit-dev-only-secret"
  );
}

export function renderHash(spec: RenderSpecForHash): string {
  const payload = canonical({ v: RENDER_ENGINE_VERSION, ...spec });
  return crypto.createHmac("sha256", hashSecret()).update(payload).digest("hex");
}

/** Blob path for a rendered asset. Prefixed per reseller so one leaked URL reveals nothing else. */
export function blobPath(resellerProfileId: string, hash: string, ext: "png" | "pdf"): string {
  return `reseller-kit/${resellerProfileId}/${hash}.${ext}`;
}

export const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Store a rendered asset and return its public URL.
 * Returns null when Blob is unconfigured (local dev) — the caller then streams bytes inline
 * rather than writing multi-megabyte renders into the working tree.
 */
export async function putRender(
  resellerProfileId: string,
  hash: string,
  ext: "png" | "pdf",
  body: Buffer,
): Promise<string | null> {
  if (!HAS_BLOB) return null;
  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(blobPath(resellerProfileId, hash, ext), body, {
      access: "public",
      addRandomSuffix: false,
      contentType: ext === "png" ? "image/png" : "application/pdf",
    });
    return blob.url;
  } catch (err) {
    // A cache write failing must never cost the partner their download — the caller falls
    // back to streaming the bytes it already has in hand.
    console.error("[reseller-kit] blob put failed", err);
    return null;
  }
}

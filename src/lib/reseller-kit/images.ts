/**
 * Resolve remote images to data URIs BEFORE handing them to satori (Luigi 2026-08-14).
 *
 * Satori is never given a URL. Two reasons, both load-bearing:
 *
 *  1. Its own image fetch has NO timeout and NO size cap. A partner logo on a host that
 *     hangs would stall the render until the function is killed.
 *  2. Its supported image list is png/apng/jpeg/gif/svg. A WebP or AVIF source THROWS
 *     `Unsupported image type` mid-render — and because `ImageResponse` builds its
 *     `200 image/png` response BEFORE rendering, that throw would ship a truncated, broken
 *     file rather than an error. (Upload now rejects WebP logos for this reason; this is the
 *     second line of defence for logos uploaded before that fix, or via another path.)
 *
 * Generalised from the same guarded fetch used by the kitchen printer pipeline —
 * src/lib/kitchen-receipt-payload.ts:228 — which already had to solve this for receipt logos.
 *
 * Failure ALWAYS returns null rather than throwing, so a bad logo degrades to a monogram
 * tile and the partner still gets a usable flyer.
 */

const TIMEOUT_MS = 4000;
const MAX_BYTES = 2_000_000;

/** MIME types satori can actually rasterise. Deliberately excludes webp/avif. */
const SATORI_IMAGE_TYPES = /^image\/(png|jpe?g|gif|svg\+xml)$/i;

export interface SafeImageOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Fetch a remote image and return it as a `data:` URI satori can consume.
 * Returns null for: a missing/relative URL, a non-http(s) scheme, a network error or
 * timeout, a non-2xx, an unsupported content type, an oversized body, or an SVG without
 * intrinsic dimensions (satori throws `missing "viewBox"` on those).
 */
export async function safeImageDataUri(
  url: string | null | undefined,
  opts: SafeImageOptions = {},
): Promise<string | null> {
  const raw = url?.trim();
  if (!raw) return null;

  // Already inlined — trust it only if it is a type satori supports.
  if (raw.startsWith("data:")) {
    const m = raw.match(/^data:([^;,]+)[;,]/);
    return m && SATORI_IMAGE_TYPES.test(m[1]) ? raw : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  try {
    const res = await fetch(parsed.toString(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!SATORI_IMAGE_TYPES.test(contentType)) return null;

    // Trust Content-Length when present so an oversized body is rejected before download.
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > maxBytes) return null;

    if (/svg/i.test(contentType) && !svgHasIntrinsicSize(buf.toString("utf8"))) return null;

    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Satori throws `Failed to parse SVG from …: missing "viewBox"` when an SVG carries neither a
 * viewBox nor explicit width+height. Cheaper to detect here than to lose the whole render.
 */
export function svgHasIntrinsicSize(svg: string): boolean {
  const head = svg.slice(0, 4000);
  if (/\bviewBox\s*=/i.test(head)) return true;
  return /\bwidth\s*=/i.test(head) && /\bheight\s*=/i.test(head);
}

/**
 * Strip emoji from partner-entered text.
 *
 * NOT cosmetic. Satori's dynamic-asset loader wraps its language-font branch in a try/catch
 * but leaves the EMOJI branch uncaught, so a single flaky jsdelivr request throws straight
 * out of the render — which, per the note above, surfaces as a broken 200 rather than an
 * error. One partner typing "🍕" into a headline would break their own download with no
 * explanation.
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}]/gu, "")
    .replace(/‍/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sanitise one partner-entered field: strip emoji, collapse whitespace, cap length. */
export function sanitizeField(value: string | null | undefined, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const clean = stripEmoji(value.replace(/[\r\n\t]+/g, " ")).slice(0, maxLen).trim();
  return clean.length > 0 ? clean : null;
}

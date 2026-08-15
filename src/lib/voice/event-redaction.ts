/**
 * PII redaction for the per-call EVENT LOG (VoiceCallEvent.payload) — pure,
 * no imports, unit-tested in event-redaction.test.ts.
 *
 * The voice service ships every event verbatim (what the caller said, tool
 * inputs/outputs, the cart, the address). The app is the ONLY writer of
 * VoiceCallEvent, so this is the one chokepoint: everything goes through
 * `redactEventPayload` before it becomes a Json column value.
 *
 * Rules (applied to EVERY string anywhere in the payload, recursively):
 *   1. Phone-like runs (`+1 (416) 833-8405`, `4168338405`, `416.833.8405`)
 *      → keep the last 4: `***-8405`.
 *   2. Runs of 13–19 digits (card-number-shaped; the service never handles
 *      cards, but a caller CAN read one aloud) → `[redacted-number]`.
 *   3. Emails → `***@domain`.
 *   4. In fields NAMED street / address / deliveryAddress (any nesting) the
 *      leading street number keeps its first digit only: `1** Main St`.
 *
 * Skipped keys (never touched, values pass through as-is): hash, cartHash,
 * cartHashBefore, cartHashAfter, seq, ts, type, turn, toolUseId, versions,
 * hop, lang at any depth, plus `name` at the TOP level only (the tool name).
 * Redacting a hash would break the timeline's cart-hash matching; a tool
 * name is not PII.
 *
 * Deliberately conservative: it is better to over-mask a digit run in a tool
 * output than to keep a caller's number in a debug log for months.
 */

const SKIP_KEYS = new Set([
  "hash",
  "cartHash",
  "cartHashBefore",
  "cartHashAfter",
  "seq",
  "ts",
  "type",
  "turn",
  "toolUseId",
  "versions",
  "hop",
  "lang",
]);
/** `name` is the TOOL name only at the top level of a tool_use / tool_result
 *  payload; a nested `customer.name` is caller data and goes through the rules
 *  (a no-op for a real name, but a number read as a name still gets masked). */
const TOP_LEVEL_SKIP_KEYS = new Set(["name"]);

/** Field names whose value is a street address (leading number masked). */
const ADDRESS_KEYS = new Set(["street", "address", "deliveryaddress"]);

/** NANP-shaped phone: optional +1 (with its own separator), area code
 *  (optionally bracketed), 3, 4. The country-code separator is INSIDE the
 *  optional group so a bare "at 647-669-0808" doesn't swallow the space. */
const PHONE_RE = /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/g;
/** 13–19 consecutive digits (payment-card shaped). Checked BEFORE phones so a
 *  16-digit run isn't half-eaten by the phone rule. */
const LONG_DIGITS_RE = /\d{13,19}/g;
/** Good-enough email: local@domain.tld — we keep the domain only. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/** Leading street number: "123 Main St" → "1** Main St". Only at the very
 *  start of the value (after optional whitespace). */
const STREET_NUMBER_RE = /^(\s*)(\d)(\d+)/;

/** Depth guard — a hostile/buggy payload must not blow the stack. */
const MAX_DEPTH = 32;

/** Redact one free-text string. Exported for the transcript path if needed. */
export function redactString(s: string): string {
  if (!s) return s;
  let out = s.replace(LONG_DIGITS_RE, "[redacted-number]");
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    return `***-${digits.slice(-4)}`;
  });
  out = out.replace(EMAIL_RE, (_m, domain: string) => `***@${domain}`);
  return out;
}

/** Street-number masking for address-named fields, then the general rules. */
export function redactAddressString(s: string): string {
  if (!s) return s;
  const masked = s.replace(STREET_NUMBER_RE, (_m, ws: string, first: string, rest: string) => `${ws}${first}${"*".repeat(rest.length)}`);
  return redactString(masked);
}

function walk(v: unknown, keyLower: string | null, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[redacted-depth]";
  if (typeof v === "string") {
    return keyLower && ADDRESS_KEYS.has(keyLower) ? redactAddressString(v) : redactString(v);
  }
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => walk(x, keyLower, depth + 1));
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    if (SKIP_KEYS.has(k) || (depth === 0 && TOP_LEVEL_SKIP_KEYS.has(k))) {
      out[k] = src[k];
      continue;
    }
    out[k] = walk(src[k], k.toLowerCase(), depth + 1);
  }
  return out;
}

/**
 * Redact a whole event payload (or any JSON-ish value). Returns a NEW value —
 * the input is never mutated. Non-JSON values (functions, undefined) are
 * left to JSON.stringify to drop later.
 */
export function redactEventPayload<T = unknown>(payload: T): T {
  return walk(payload, null, 0) as T;
}

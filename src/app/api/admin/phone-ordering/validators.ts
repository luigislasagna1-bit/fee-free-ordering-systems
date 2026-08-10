/**
 * Pure validators + caps shared by the Nabil admin CRUD routes
 * (faqs / text-links / blocked-callers / upsells). No Prisma imports —
 * keeps this unit-testable (see validators.test.ts) and side-effect free.
 */
import { sanitizeExternalHref } from "@/lib/html-safe";

/** VoiceFaq.category — must mirror the schema comment exactly. */
export const FAQ_CATEGORIES = new Set([
  "dietary", "allergen", "business_info", "operational", "deflection", "escalation",
]);

/** VoiceTextLink.kind — must mirror the schema comment exactly. */
export const LINK_KINDS = new Set([
  "order_online", "menu", "reservation", "support", "custom",
]);

// Per-restaurant caps (enforced with 409 + a machine-readable `code`).
export const MAX_FAQS = 100;
export const MAX_TEXT_LINKS = 10;
export const MAX_BLOCKED_CALLERS = 500;
export const MAX_ACTIVE_UPSELLS = 5;

// Field length limits (server-authoritative; the UI mirrors them client-side).
export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_CHARS = 1000;
export const MAX_LABEL_CHARS = 60;
export const MAX_REASON_CHARS = 200;
export const MAX_NOTE_CHARS = 140;
export const MAX_URL_CHARS = 500;

/**
 * Strict http(s)-only URL validation for SMS-able text links. Builds on the
 * shared `sanitizeExternalHref` allowlist (which also admits relative paths,
 * mailto: and tel: — none of which make sense in an SMS body), then requires
 * an absolute, parseable http(s) URL. Returns null when invalid — never a
 * truncated string, because a sliced URL points somewhere else.
 */
export function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const safe = sanitizeExternalHref(raw, "");
  if (!safe || safe.length > MAX_URL_CHARS) return null;
  if (!/^https?:\/\//i.test(safe)) return null;
  try {
    new URL(safe);
  } catch {
    return null;
  }
  return safe;
}

/** Finite number → rounded int clamped to a sane range; anything else → null. */
export function parseSortOrder(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(100000, Math.max(-100000, Math.round(v)));
}

/** Max-5-active-upsells cap: `activeCount` EXCLUDES the row being activated. */
export function upsellCapReached(activeCount: number): boolean {
  return activeCount >= MAX_ACTIVE_UPSELLS;
}

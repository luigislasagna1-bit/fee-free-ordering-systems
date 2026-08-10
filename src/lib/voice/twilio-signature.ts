/**
 * X-Twilio-Signature validation — proves a webhook POST really came from
 * Twilio. Scheme (Twilio security docs): take the full URL Twilio requested,
 * append every POST param as key+value in alphabetical key order, HMAC-SHA1
 * with the account's auth token, base64. Uses the SAME auth token env var as
 * every other Twilio helper (FFOS_TWILIO_AUTH_TOKEN — src/lib/sms.ts).
 */
import crypto from "crypto";

/** True when the auth token is configured, i.e. signatures CAN be verified.
 *  Callers decide the fallback: routes allow unsigned requests only when this
 *  is false AND we're not in production (dev convenience), and reject
 *  otherwise — verifyTwilioSignature itself always fails without the token. */
export function shouldEnforceTwilioSignature(): boolean {
  return !!process.env.FFOS_TWILIO_AUTH_TOKEN;
}

/**
 * The URL forms Twilio might have signed for this request.
 *
 * Twilio signs the URL **as configured on the number**, which is not always
 * byte-identical to the host we see: a webhook saved against the apex domain
 * reaches us as `www.` (and vice-versa) once the platform redirect runs. A
 * single-candidate check would 403 every genuine call — the live line goes
 * dead at deploy with no warning.
 *
 * Trying both forms costs nothing in security: each candidate is still HMAC'd
 * with the account auth token, so a forger who can't produce a valid signature
 * for one URL can't produce one for the other either.
 */
export function twilioUrlCandidates(fullUrl: string): string[] {
  const out = [fullUrl];
  try {
    const u = new URL(fullUrl);
    const alt = u.host.startsWith("www.") ? u.host.slice(4) : `www.${u.host}`;
    const v = new URL(fullUrl);
    v.host = alt;
    out.push(v.toString());
  } catch {
    /* non-absolute URL — the single candidate stands */
  }
  return out;
}

/** True when the signature matches ANY plausible form of the request URL. */
export function verifyTwilioSignatureAny(
  urls: string[],
  params: Record<string, string>,
  signatureHeader: string | null,
): boolean {
  return urls.some((u) => verifyTwilioSignature(u, params, signatureHeader));
}

/**
 * Verify an X-Twilio-Signature header for a form-encoded POST.
 * @param fullUrl the exact URL Twilio was told to request (incl. any query)
 * @param params  the decoded POST body params
 */
export function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | null,
): boolean {
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  if (!token || !signatureHeader) return false;

  let data = fullUrl;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const expected = crypto.createHmac("sha1", token).update(data).digest();

  // Timing-safe compare on the raw bytes; a malformed/short header simply
  // fails the length check (Buffer.from(base64) never throws).
  const given = Buffer.from(signatureHeader, "base64");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

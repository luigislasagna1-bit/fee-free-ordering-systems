import { CONFIG } from "./config";

/**
 * Thin client for the Fee Free app. The voice service NEVER touches the DB —
 * every read goes through the x-internal-key-gated /api/internal/voice/* reads,
 * and every write reuses the existing public create routes so all validation +
 * pricing stays single-sourced (preview==charge, money path unchanged).
 */
const jsonHeaders = { "content-type": "application/json" };
const internalHeaders = { ...jsonHeaders, "x-internal-key": CONFIG.internalSecret };

async function getInternal<T = any>(path: string): Promise<T> {
  const res = await fetch(`${CONFIG.appBaseUrl}${path}`, {
    headers: { "x-internal-key": CONFIG.internalSecret },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function post(path: string, body: unknown, internal = false): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${CONFIG.appBaseUrl}${path}`, {
    method: "POST",
    headers: internal ? internalHeaders : jsonHeaders,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export const api = {
  // Reads (internal, single-sourced on existing libs)
  menu: (slug: string) => getInternal(`/api/internal/voice/menu?slug=${encodeURIComponent(slug)}`),
  context: (slug: string) => getInternal(`/api/internal/voice/context?slug=${encodeURIComponent(slug)}`),
  returningCaller: (slug: string, phone: string) =>
    getInternal(`/api/internal/voice/returning-caller?slug=${encodeURIComponent(slug)}&phone=${encodeURIComponent(phone)}`),
  availability: (slug: string, date: string, partySize: number) =>
    getInternal(
      `/api/internal/voice/reservation-availability?slug=${encodeURIComponent(slug)}&date=${encodeURIComponent(date)}&partySize=${partySize}`,
    ),
  /** Full build detail for ONE item — sizes, groups, pizza rules, combo slots.
   *  Fetched on demand so the huge pizza/combo trees stay OUT of the cached
   *  system prompt (they were 66% of the menu and $5/call). */
  itemOptions: (slug: string, itemId: string) =>
    getInternal(
      `/api/internal/voice/item-options?slug=${encodeURIComponent(slug)}&itemId=${encodeURIComponent(itemId)}`,
    ),

  /** Is this address deliverable, and what does it cost — answered mid-call,
   *  through the SAME resolveAddress + findZoneForPoint the charge uses, so a
   *  quote and a charge can never be two different answers. Also returns the
   *  coordinates it resolved, which place_order forwards so the ORDER lands in
   *  a real zone instead of "unverified". */
  checkAddress: (body: unknown) => post(`/api/internal/voice/check-address`, body, true),

  // Writes (reuse existing routes — server re-validates + re-prices)
  previewOrder: (body: unknown) => post(`/api/public/apply-promos`, body), // read-only preview (public)
  /** Priced preview through the SAME path that charges (dryRun short-circuits
   *  after pricing, before any write) — so preview == charge by construction. */
  dryRunOrder: (body: unknown) => post(`/api/orders`, { ...(body as object), dryRun: true }, true),
  /** Compiles a spoken pizza/combo INTENT into a validated order line. The
   *  model never assembles the wire format — see the compiler's header for the
   *  traps (half/half name prefixes, per-unit expansion, preset seeding). */
  buildLine: (body: unknown) => post(`/api/internal/voice/build-line`, body, true),
  placeOrder: (body: unknown) => post(`/api/orders`, body, true), // internal key → channel:"voice"
  bookReservation: (body: unknown) => post(`/api/public/reservations`, body), // already phone-only

  // Nabil-only internal endpoints (built in task #13 / call-log follow-up)
  sendSms: (body: unknown) => post(`/api/internal/voice/send-sms`, body, true),
  /** event:"start" — creates the VoiceCall stub (real startedAt, triggers recording). */
  logCallStart: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
  /** event:"end" — merges outcome/ids/transcript at hangup. */
  logCall: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
};

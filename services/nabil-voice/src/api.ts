import { CONFIG } from "./config";

/**
 * Thin client for the Fee Free app. The voice service NEVER touches the DB —
 * every read goes through the x-internal-key-gated /api/internal/voice/* reads,
 * and every write reuses the existing public create routes so all validation +
 * pricing stays single-sourced (preview==charge, money path unchanged).
 */
const jsonHeaders = { "content-type": "application/json" };
const internalHeaders = { ...jsonHeaders, "x-internal-key": CONFIG.internalSecret };

/**
 * 🚨 EVERY call here happens inside a tool hop, and a tool hop emits NO audio.
 * A request that hangs is therefore an open, silent phone line that the model
 * cannot narrate its way out of — and, worse, `finalize()` can end the call
 * while it is still in flight, so an order could be created after the caller
 * hung up. Nothing here had a timeout until 2026-08-13.
 *
 * 8s for reads and for anything we can safely retry or abandon.
 */
const READ_TIMEOUT_MS = 8_000;
/**
 * 20s for order placement, and deliberately longer: aborting the client does
 * NOT un-create an order. A short timeout here would just hide a ticket that is
 * already printing. On timeout the agent must tell the caller it may have gone
 * through and offer a person — never silently retry.
 */
const PLACE_TIMEOUT_MS = 20_000;
/** The hand-off write runs while the "putting you through" sentence plays; past
 *  this the session ends anyway (after-stream then dials the store from the row
 *  that exists, or falls back) — never hold a caller for a log line. */
const HANDOFF_TIMEOUT_MS = 2_500;

async function getInternal<T = any>(path: string): Promise<T> {
  const res = await fetch(`${CONFIG.appBaseUrl}${path}`, {
    headers: { "x-internal-key": CONFIG.internalSecret },
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function post(
  path: string,
  body: unknown,
  internal = false,
  timeoutMs: number = READ_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${CONFIG.appBaseUrl}${path}`, {
    method: "POST",
    headers: internal ? internalHeaders : jsonHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
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
  placeOrder: (body: unknown) => post(`/api/orders`, body, true, PLACE_TIMEOUT_MS), // internal key → channel:"voice"
  bookReservation: (body: unknown) => post(`/api/public/reservations`, body), // already phone-only

  // Nabil-only internal endpoints (built in task #13 / call-log follow-up)
  sendSms: (body: unknown) => post(`/api/internal/voice/send-sms`, body, true),
  /** event:"start" — creates the VoiceCall stub (real startedAt, triggers recording). */
  logCallStart: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
  /** event:"end" — merges outcome/ids/transcript at hangup. */
  logCall: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
  /** event:"events" — a mid-call flush of the event log (crash-safe observability). */
  logEvents: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
  /** event:"handoff" — the transfer reason, written BEFORE the relay session is
   *  ended so the <Connect action> route never races the end record (A1,
   *  2026-08-22: two callers sat for minutes while "still connecting"). Tight
   *  timeout: it overlaps the goodbye sentence already playing. */
  logHandoff: (body: unknown) => post(`/api/internal/voice/call-log`, body, true, HANDOFF_TIMEOUT_MS),
  /** A1b — a message for the store when a transfer is refused by its policy
   *  (VoiceCallbackRequest + an alert to the store's transfer/alert number). */
  leaveMessage: (body: unknown) => post(`/api/internal/voice/callback-request`, body, true),
};

/** The service's whole view of the app. `CallSession` takes one of these so
 *  the simulator can stand up an offline backend (menu snapshot + the real
 *  compiler in-process) and drive the REAL session against it. */
export type VoiceApi = typeof api;

/** Every store whose agent can take a call right now — feeds the prompt-cache
 *  warmer (warmup.ts). Deliberately NOT on the `api` object: the sim's offline
 *  backend implements VoiceApi and never warms. */
export function fetchActiveStores(): Promise<{ stores: Array<{ slug: string }> }> {
  return getInternal(`/api/internal/voice/active-stores`);
}

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

  // Writes (reuse existing routes — server re-validates + re-prices)
  previewOrder: (body: unknown) => post(`/api/public/apply-promos`, body), // read-only preview (public)
  placeOrder: (body: unknown) => post(`/api/orders`, body, true), // internal key → channel:"voice"
  bookReservation: (body: unknown) => post(`/api/public/reservations`, body), // already phone-only

  // Nabil-only internal endpoints (built in task #13 / call-log follow-up)
  sendSms: (body: unknown) => post(`/api/internal/voice/send-sms`, body, true),
  /** event:"start" — creates the VoiceCall stub (real startedAt, triggers recording). */
  logCallStart: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
  /** event:"end" — merges outcome/ids/transcript at hangup. */
  logCall: (body: unknown) => post(`/api/internal/voice/call-log`, body, true),
};

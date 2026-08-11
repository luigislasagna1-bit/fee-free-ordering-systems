import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer } from "ws";
import { CONFIG, verifyCallToken } from "./config";
import { CallSession } from "./session";

/**
 * Nabil AI voice service entry point. A single always-on process (Fly.io):
 *   - GET /health          → 200 (Fly health check)
 *   - WSS  /call?t=<token>  → Twilio ConversationRelay connects here
 *
 * The TwiML route (/api/twilio/voice) points ConversationRelay at
 * NABIL_VOICE_WSS_URL (= wss://<host>/call) with a short-lived signed token in
 * ?t=. We verify it on connect, then hand the socket to a CallSession.
 */
const anthropic = new Anthropic({ apiKey: CONFIG.anthropicKey });

/**
 * 🚨 IS THE API KEY REAL? (2026-08-11)
 *
 * The ANTHROPIC_API_KEY secret was once overwritten with a 22-character
 * placeholder ending "HERE". Nothing complained: the process booted, health
 * returned 200, Fly reported the machine healthy, the deploy went green — and
 * then EVERY caller was told "sorry, I didn't catch that" because every model
 * turn 401'd. The outage was invisible for a day and looked like a
 * speech-recognition problem.
 *
 * So the key is now checked once at boot with the cheapest possible call, and
 * an invalid key makes /health FAIL. Fly's health check then refuses to mark
 * the machine good, the deploy goes red, and the fault is obvious in seconds
 * instead of being discovered by a customer on the phone.
 *
 * Deliberately narrow: only a 401/403 is treated as fatal. A network blip or
 * an Anthropic outage at boot must NOT block a deploy — it resolves to
 * "unknown" and the service runs.
 */
type KeyState = "checking" | "ok" | "invalid" | "unknown";
let keyState: KeyState = "checking";

async function checkAnthropicKey(): Promise<void> {
  const key = CONFIG.anthropicKey;
  // Catch the obvious shapes before spending a request on them.
  if (!key || key.length < 40 || !key.startsWith("sk-ant-")) {
    keyState = "invalid";
    console.error(
      `[nabil-voice] FATAL: ANTHROPIC_API_KEY is not a real key (length ${key?.length ?? 0}). ` +
        `Set it: fly secrets set ANTHROPIC_API_KEY=... --app nabil-voice`,
    );
    return;
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      keyState = "invalid";
      console.error(
        `[nabil-voice] FATAL: Anthropic rejected the API key (${res.status}). Every call will fail. ` +
          `Set a valid key: fly secrets set ANTHROPIC_API_KEY=... --app nabil-voice`,
      );
      return;
    }
    keyState = res.ok ? "ok" : "unknown";
    if (!res.ok) console.warn(`[nabil-voice] key check inconclusive (HTTP ${res.status}) — starting anyway`);
    else console.log(`[nabil-voice] Anthropic key OK → model ${CONFIG.model}`);
  } catch (e) {
    // Network/timeout — do NOT block the service on Anthropic being slow.
    keyState = "unknown";
    console.warn("[nabil-voice] key check could not complete — starting anyway:", e instanceof Error ? e.message : e);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    // An invalid key means the service cannot do its ONE job. Say so, loudly,
    // where the platform can see it — a green health check on a service that
    // fails every call is worse than no health check at all.
    const bad = keyState === "invalid";
    res.writeHead(bad ? 503 : 200, { "content-type": "text/plain" });
    res.end(bad ? "anthropic key invalid" : "ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/call" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/call", "wss://placeholder.local");
  const token = url.searchParams.get("t") || "";
  const payload = verifyCallToken(token);
  if (!payload) {
    ws.close(1008, "unauthorized");
    return;
  }
  const session = new CallSession(ws, payload, anthropic);
  ws.on("message", (data) => session.onMessage(data.toString()));
  ws.on("close", () => session.onClose());
  ws.on("error", (e) => console.error("[nabil-voice] ws error", e));
});

server.listen(CONFIG.port, () => {
  console.log(`[nabil-voice] listening on :${CONFIG.port} (WSS /call, health /health) → model ${CONFIG.model}`);
  // Fire after listening so the port is open immediately — Fly's health check
  // grace period covers the few hundred ms this takes.
  void checkAnthropicKey();
});

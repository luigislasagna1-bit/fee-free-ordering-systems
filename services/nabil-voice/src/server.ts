import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer } from "ws";
import { CONFIG, verifyCallToken } from "./config";
import { CallSession } from "./session";
import { fallbackMapStatus, fallbackTwiml, handleFallback, startFallbackRefresh } from "./fallback";

/**
 * Nabil AI voice service entry point. A single always-on process (Fly.io):
 *   - GET  /health          → 200 (Fly health check)
 *   - POST /twiml/fallback  → Twilio VoiceFallbackUrl (see fallback.ts)
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

/**
 * Live calls on THIS machine. The drain needs to know what it is waiting for and
 * the capacity guard needs to know how many there are — and both need it to be
 * per-process, which it is: nothing here is shared across machines, which is why
 * `fly scale count 2` needs no Redis and no session affinity.
 */
const active = new Set<CallSession>();
let draining = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    // Three states, each with its own body so an uptime monitor can say WHICH.
    // An invalid key means the service cannot do its ONE job — say so loudly
    // where the platform can see it, because a green health check on a service
    // that fails every call is worse than no health check at all. Draining is
    // also 503, deliberately: that is how Fly is told to stop routing new calls
    // here while the ones in flight finish.
    const m = fallbackMapStatus();
    if (draining) {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end(`draining ${active.size} call(s)`);
      return;
    }
    if (keyState === "invalid") {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("anthropic key invalid");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`ok calls=${active.size}/${CONFIG.maxSessions} fallback=${m.live}+${m.env} age=${m.ageSeconds ?? "never"}`);
    return;
  }

  // Twilio VoiceFallbackUrl. Fires only when the primary webhook on Vercel
  // failed, so it must answer from memory alone — see fallback.ts.
  if (req.method === "POST" && (req.url === "/twiml/fallback" || req.url?.startsWith("/twiml/fallback?"))) {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      if (tooBig) return;
      body += chunk;
      // Twilio's form body is well under 8 KB; anything larger is not Twilio.
      if (body.length > 16_384) {
        tooBig = true;
        body = "";
      }
    });
    req.on("end", () => {
      const { status, xml } = handleFallback(tooBig ? "" : body, req.headers["x-twilio-signature"] as string | null);
      res.writeHead(status, { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store" });
      res.end(xml);
    });
    req.on("error", () => {
      // Even a broken request gets valid TwiML — this is the no-dead-air path.
      res.writeHead(200, { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store" });
      res.end(fallbackTwiml(null));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/call" });

wss.on("connection", (ws, req) => {
  // Refuse FAST rather than accepting a call we can't serve. 1013 = "try again
  // later"; Twilio treats a relay that never connects exactly like one that
  // ended, so <Connect action> fires and the handoff route rings the store —
  // within a second, instead of after Fly queues an upgrade that times out
  // while the caller listens to silence.
  if (draining) {
    ws.close(1013, "draining");
    return;
  }
  if (active.size >= CONFIG.maxSessions) {
    console.error(
      `[nabil-voice] AT CAPACITY (${active.size}/${CONFIG.maxSessions}) — refusing a call; it will ring the store instead`,
    );
    ws.close(1013, "at capacity");
    return;
  }

  const url = new URL(req.url || "/call", "wss://placeholder.local");
  const token = url.searchParams.get("t") || "";
  const payload = verifyCallToken(token);
  if (!payload) {
    ws.close(1008, "unauthorized");
    return;
  }
  const session = new CallSession(ws, payload, anthropic);
  active.add(session);
  ws.on("message", (data) => session.onMessage(data.toString()));
  ws.on("close", () => {
    active.delete(session);
    session.onClose();
  });
  ws.on("error", (e) => console.error("[nabil-voice] ws error", e));
});

/**
 * Graceful shutdown. Fly sends SIGTERM before replacing a machine; until this
 * existed nothing listened, so a deploy killed the process outright — every live
 * call cut mid-sentence AND `finalize()` killed in flight, losing the call
 * record, transcript, cost and revenue attribution for whatever was in progress.
 *
 * Order matters: flip `draining` FIRST so /health turns 503 and Fly stops
 * sending new calls here, then wait for the ones in flight, and only warm-
 * transfer the stragglers that outlast the deadline.
 *
 * ⚠️ fly.toml's kill_timeout must exceed CONFIG.drainMs, or the platform kills
 * the process mid-drain and this is decorative.
 */
async function drain(signal: string): Promise<void> {
  if (draining) return;
  draining = true;
  console.log(`[nabil-voice] ${signal}: draining, ${active.size} live call(s)`);

  const deadline = Date.now() + CONFIG.drainMs;
  while (active.size > 0 && Date.now() < deadline) await sleep(1000);

  if (active.size > 0) {
    // maxCallSeconds defaults to 600, so a 4-minute drain will not always be
    // enough. These callers get a sentence and a warm transfer, not a dead line.
    console.warn(`[nabil-voice] drain deadline reached — warm-transferring ${active.size} call(s)`);
    await Promise.all([...active].map((s) => s.shutdownTransfer("service_restart").catch(() => undefined)));
    await sleep(3000); // let the finalize() writes land before the process goes
  }

  console.log("[nabil-voice] drain complete");
  server.close(() => process.exit(0));
  // Backstop: never hang forever on a socket that refuses to close.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => void drain("SIGTERM"));
process.on("SIGINT", () => void drain("SIGINT"));

server.listen(CONFIG.port, () => {
  console.log(`[nabil-voice] listening on :${CONFIG.port} (WSS /call, health /health) → model ${CONFIG.model}`);
  // Fire after listening so the port is open immediately — Fly's health check
  // grace period covers the few hundred ms this takes.
  void checkAnthropicKey();
  // Seed the fallback number map (env floor + first bulk load, then every 15
  // min). Deliberately NOT awaited and never fatal: the fallback handler is a
  // safety net, and a safety net must not be able to stop the service booting.
  startFallbackRefresh();
});

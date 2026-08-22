// FIRST: config validation (throws loudly on a missing required var) + Sentry
// when SENTRY_DSN is set + the process crash handlers. See sentry.ts.
import "./sentry";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer } from "ws";
import { CONFIG, verifyCallToken, type CallToken } from "./config";
import { agentVersion } from "./versions";
import { flagOn } from "./feature-flags";
import { CallSession } from "./session";
import { fallbackMapStatus, fallbackTwiml, handleFallback, startFallbackRefresh } from "./fallback";
import { startCacheWarm } from "./warmup";
import { captureError, createRefractory, flushObservability, hasErrorSink } from "./observability";
import { createMediaSession, type MediaSessionHandle } from "./media/media-session";
import { createDeepgramStt } from "./media/stt";
import { createElevenLabsTts } from "./media/tts";
import { loadBed } from "./media/bed";

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
    captureError(new Error("ANTHROPIC_API_KEY is not a real key"), { where: "boot.key-check" });
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
      captureError(new Error(`Anthropic rejected the API key (${res.status})`), { where: "boot.key-check", extra: { status: res.status } });
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
const capacityAlert = createRefractory(30 * 60_000);

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
    // `channel` + `agent` answer "which lane is this, and which build is it
    // running?" from a curl — the question a promotion/rollback has to settle
    // before anyone places a test call (Luigi 2026-08-22).
    res.end(`ok calls=${active.size}/${CONFIG.maxSessions} fallback=${m.live}+${m.env} age=${m.ageSeconds ?? "never"} sentry=${hasErrorSink() ? "on" : "off"} channel=${CONFIG.channel} agent=${agentVersion()}`);
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

// ws v8.21 `abortHandshake(socket, 400)` bug: when TWO WebSocketServer
// instances share an HTTP server via `{ server, path }`, the non-matching
// WSS destroys the already-upgraded socket — killing every connection to
// the matching WSS within milliseconds. This broke ALL Nabil calls for
// ~3 hours on 2026-08-18/19. Fix: `noServer` + a single manual upgrade
// router that hands each socket to exactly ONE WSS.
const wss = new WebSocketServer({ noServer: true });

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
    // One alert per half hour, not one per refused caller.
    if (capacityAlert.fire()) captureError(new Error(`AT CAPACITY ${active.size}/${CONFIG.maxSessions}`), { where: "capacity" });
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
  // LANE CHECK (2026-08-22): a token minted for the other lane means a
  // NABIL_VOICE_*_WSS_URL points at the wrong app. Refuse loudly — Twilio's
  // <Connect action> then rings the store — rather than let a staging build
  // answer a live customer (or vice versa) in silence.
  if (payload.ch && payload.ch !== CONFIG.channel) {
    console.warn(`[nabil-voice] /call token for lane "${payload.ch}" reached the "${CONFIG.channel}" app — refusing callSid=${payload.callSid}`);
    ws.close(1008, "wrong lane");
    return;
  }
  const connectedAt = Date.now();
  console.log(`[nabil-voice] /call connected: ${payload.callSid} from=${payload.from} to=${payload.to} active=${active.size}`);
  const session = new CallSession(ws, payload, anthropic);
  active.add(session);
  ws.on("message", (data) => {
    const raw = data.toString();
    try { const m = JSON.parse(raw); if (m.type === "setup") console.log(`[nabil-voice] setup received: ${payload.callSid}`); }
    catch {}
    session.onMessage(raw);
  });
  ws.on("close", (code, reason) => {
    console.log(`[nabil-voice] /call closed: ${payload.callSid} code=${code} reason=${reason?.toString() ?? ""} after=${Date.now() - connectedAt}ms active=${active.size - 1}`);
    active.delete(session);
    session.onClose();
  });
  ws.on("error", (e) => {
    console.error("[nabil-voice] ws error", e);
    captureError(e, { where: "ws", callSid: payload.callSid, restaurantId: payload.restaurantId });
  });
});

// ── /media — Twilio Media Streams path (ambient bed pipeline) ─────────────
//
// Same capacity/drain/token logic as /call. The MediaSession adapter
// translates Media Streams events to ConversationRelay-shaped messages
// so CallSession works unchanged.

const mediaWss = new WebSocketServer({ noServer: true });

mediaWss.on("connection", (ws, req) => {
  console.log(`[nabil-voice] /media upgrade received from ${req.socket?.remoteAddress ?? "?"}`);
  if (draining) { ws.close(1013, "draining"); return; }
  if (active.size >= CONFIG.maxSessions) {
    console.error(`[nabil-voice] AT CAPACITY (${active.size}/${CONFIG.maxSessions}) — refusing media call`);
    if (capacityAlert.fire()) captureError(new Error(`AT CAPACITY ${active.size}/${CONFIG.maxSessions}`), { where: "capacity" });
    ws.close(1013, "at capacity");
    return;
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!deepgramKey || !elevenLabsKey) {
    console.error("[nabil-voice] DEEPGRAM_API_KEY or ELEVENLABS_API_KEY not set — refusing media call");
    ws.close(1011, "missing keys");
    return;
  }

  // Auth deferred to the Twilio "start" event — Media Streams strips URL
  // query params, so the token rides as a <Parameter> in the TwiML and
  // arrives in start.customParameters.token.
  let mediaHandle: MediaSessionHandle | null = null;
  let session: CallSession | null = null;
  let callPayload: CallToken | null = null;
  let authenticated = false;

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      console.warn("[nabil-voice] /media auth timeout — no start event within 10 s");
      ws.close(1008, "auth timeout");
    }
  }, 10_000);

  function authHandler(raw: Buffer | string) {
    if (authenticated) return;
    const data = typeof raw === "string" ? raw : raw.toString("utf-8");
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.event === "connected") return;
    if (msg.event !== "start") return;

    const params = (msg.start as Record<string, unknown>)?.customParameters as Record<string, string> | undefined;
    const tokenStr = params?.token || "";
    callPayload = verifyCallToken(tokenStr);
    if (!callPayload) {
      console.warn(`[nabil-voice] /media token rejected (param-len=${tokenStr.length})`);
      ws.close(1008, "unauthorized");
      clearTimeout(authTimer);
      return;
    }
    // LANE CHECK — same rule as /call (see above).
    if (callPayload.ch && callPayload.ch !== CONFIG.channel) {
      console.warn(`[nabil-voice] /media token for lane "${callPayload.ch}" reached the "${CONFIG.channel}" app — refusing callSid=${callPayload.callSid}`);
      ws.close(1008, "wrong lane");
      clearTimeout(authTimer);
      callPayload = null;
      return;
    }

    authenticated = true;
    clearTimeout(authTimer);
    ws.removeListener("message", authHandler);

    const payload = callPayload;
    console.log(`[nabil-voice] /media connected: ${payload.callSid} from=${payload.from} to=${payload.to} active=${active.size}`);

    let voiceId = "cgSgspJ2msm6clMCkdEj";
    let stability = 0.35;
    let similarity = 0.75;
    let speed = 1.0;
    let ttsModel = "eleven_turbo_v2_5";
    if (payload.ttsVoice) {
      const parts = payload.ttsVoice.split("-");
      if (parts.length >= 1) voiceId = parts[0];
      if (parts.length >= 2) {
        // ConversationRelay uses Twilio's short model names (e.g. "turbo_v2_5");
        // the ElevenLabs API requires the "eleven_" prefix.
        const raw = parts[1];
        ttsModel = raw.startsWith("eleven_") ? raw : `eleven_${raw}`;
      }
      if (parts.length >= 3) {
        const nums = parts[2].split("_").map(Number);
        if (nums.length >= 1 && !isNaN(nums[0])) speed = nums[0];
        if (nums.length >= 2 && !isNaN(nums[1])) stability = nums[1];
        if (nums.length >= 3 && !isNaN(nums[2])) similarity = nums[2];
      }
    }

    const stt = createDeepgramStt(
      { apiKey: deepgramKey!, language: payload.lang ?? undefined },
      {
        onTranscript: (t) => mediaHandle?.handleTranscript(t),
        onUtteranceEnd: () => mediaHandle?.handleUtteranceEnd(),
        onOpen: () => console.log(`[nabil-voice] STT open for ${payload.callSid}`),
        onError: (err) => captureError(err, { where: "media-stt", callSid: payload.callSid }),
        onClose: () => {},
      },
    );

    // language_code is only accepted by multilingual models; turbo/flash
    // models are English-only and REJECT the parameter (1008 unsupported_language).
    const isMultilingual = ttsModel.includes("multilingual");
    const tts = createElevenLabsTts(
      { apiKey: elevenLabsKey!, voiceId, modelId: ttsModel, stability, similarity, speed, languageCode: isMultilingual ? (payload.lang ?? undefined) : undefined },
      {
        onAudio: (chunk) => mediaHandle?.handleTtsAudio(chunk),
        onDone: () => mediaHandle?.handleTtsDone(),
        onError: (err) => captureError(err, { where: "media-tts", callSid: payload.callSid }),
      },
    );

    const shimWs = Object.create(ws);
    shimWs.send = (sendData: string) => {
      try {
        const m = JSON.parse(sendData);
        if (m.type === "text") {
          mediaHandle?.sendText(m.token ?? "", !!m.last);
        } else if (m.type === "end") {
          // A1 (2026-08-22): by the time the session sends `end`, the hand-off
          // reason is ALREADY on the call row (session.runEndTransfer writes it
          // first). The media session stops listening at once, lets the goodbye
          // sentence finish (≤3 s), then cleanup → onEnd below closes the
          // Twilio socket, and Twilio's <Connect action> POST to after-stream
          // dials the store. No fixed timer racing a DB write any more.
          const reason = (() => {
            try { return JSON.parse(m.handoffData || "{}").reason ?? ""; } catch { return ""; }
          })();
          mediaHandle?.end(reason);
        }
      } catch { /* non-JSON passthrough */ }
    };

    mediaHandle = createMediaSession({
      token: payload,
      twilioWs: ws,
      stt,
      tts,
      greeting: params?.greeting || "",
      onSetup: () => {
        session = new CallSession(shimWs, payload, anthropic);
        active.add(session);
        session.setGreeting(params?.greeting || "");
        session.onMessage(JSON.stringify({ type: "setup" }));
      },
      onPrompt: (text, lang, meta) => {
        session?.onMessage(JSON.stringify({ type: "prompt", voicePrompt: text, lang, asrMeta: meta ?? null }));
      },
      onAsrDropped: (d) => {
        session?.noteAsrDropped(d);
      },
      // A8b: dropping is a promoted behaviour per lane; the numbers are
      // always recorded so the thresholds are tuned on real calls first.
      backgroundRejection: flagOn("background_rejection", CONFIG.channel, process.env.NABIL_FLAGS_CURRENT),
      onSpeechActivity: () => {
        session?.noteCallerAudio();
      },
      onInterrupt: (utteranceUntilInterrupt) => {
        session?.onMessage(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt }));
      },
      onDtmf: (digit) => {
        session?.onMessage(JSON.stringify({ type: "dtmf", digit }));
      },
      onEnd: () => {
        if (session) {
          active.delete(session);
          session.onClose();
          session = null;
        }
        // Close the Twilio leg ourselves (a hand-off, the time cap, a pipeline
        // death). When Twilio closed first (caller hung up) this is a no-op.
        if (ws.readyState === 1) {
          try {
            ws.close(1000, "ended");
          } catch {
            /* ignore */
          }
        }
      },
    });

    // Re-emit the "start" message so the media session's own handler
    // processes it (extracts streamSid, starts the pacer + greeting).
    console.log(`[nabil-voice] /media re-emitting start for ${payload.callSid}`);
    ws.emit("message", raw);
  }

  ws.on("message", authHandler);
  ws.on("close", (code: number, reason: Buffer) => {
    console.log(`[nabil-voice] /media closed: ${callPayload?.callSid ?? "pre-auth"} code=${code} reason=${reason?.toString() ?? ""}`);
  });
  ws.on("error", (e) => {
    console.error("[nabil-voice] media ws error", e);
    if (callPayload) captureError(e, { where: "media-ws", callSid: callPayload.callSid, restaurantId: callPayload.restaurantId });
  });
});

// Manual upgrade router — each request goes to exactly ONE WSS.
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "/").split("?")[0];
  if (pathname === "/call") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else if (pathname === "/media") {
    mediaWss.handleUpgrade(req, socket, head, (ws) => mediaWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
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
  await flushObservability(2000);
  server.close(() => process.exit(0));
  // Backstop: never hang forever on a socket that refuses to close.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => void drain("SIGTERM"));
process.on("SIGINT", () => void drain("SIGINT"));

// Load the ambient bed once at boot (shared across all calls).
// Default to the bundled file when NABIL_BED_PATH is not set.
const DEFAULT_BED = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/ambience/restaurant-bed.pcm");
const bedPath = process.env.NABIL_BED_PATH || (existsSync(DEFAULT_BED) ? DEFAULT_BED : "");
if (bedPath) {
  try {
    loadBed(bedPath);
    console.log(`[nabil-voice] ambient bed loaded: ${bedPath}`);
  } catch (e) {
    console.warn(`[nabil-voice] ambient bed not loaded (${e instanceof Error ? e.message : e}) — media calls will have no ambience`);
  }
} else {
  console.warn("[nabil-voice] no ambient bed file found — media calls will have no ambience");
}

server.listen(CONFIG.port, () => {
  console.log(`[nabil-voice] listening on :${CONFIG.port} (WSS /call + /media, health /health) → model ${CONFIG.model}`);
  // Fire after listening so the port is open immediately — Fly's health check
  // grace period covers the few hundred ms this takes.
  void checkAnthropicKey();
  // Seed the fallback number map (env floor + first bulk load, then every 15
  // min). Deliberately NOT awaited and never fatal: the fallback handler is a
  // safety net, and a safety net must not be able to stop the service booting.
  startFallbackRefresh();
  // Keep every active store's 1h prompt-cache entry hot (boot + every 50 min)
  // so the first caller after a deploy or a quiet hour gets a warm prefix.
  // Same policy: fire-and-forget, warn-never-crash (warmup.ts).
  startCacheWarm(anthropic);
});

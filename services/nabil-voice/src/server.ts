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

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
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
});

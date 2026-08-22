/**
 * Deepgram Nova-3 streaming STT over WebSocket.
 *
 * Accepts raw µ-law 8 kHz frames from Twilio Media Streams and emits
 * transcript events that MediaSession maps to ConversationRelay-shaped
 * `prompt` / `interrupt` messages for the unchanged CallSession.
 *
 * The Deepgram WS stays open for the entire call (always-on audio is
 * required for barge-in detection while the agent speaks). KeepAlive
 * every 5 s prevents idle disconnect.
 */
import { WebSocket } from "ws";
import { captureError } from "../observability";

export interface SttTranscript {
  text: string;
  isFinal: boolean;
  speechFinal: boolean;
  confidence: number;
  language?: string;
  /** Segment timing in SECONDS since the stream started (Deepgram `start` +
   *  `duration`). A8b maps these onto the inbound frame-energy buffer to tell
   *  the caller from a radio in the background. Absent on providers without it. */
  start?: number;
  duration?: number;
  /** Per-word confidence + timing — min/mean word confidence is a sharper
   *  background signal than the utterance-level number. */
  words?: Array<{ word: string; start: number; end: number; confidence: number }>;
}

export interface SttEvents {
  onTranscript: (t: SttTranscript) => void;
  onUtteranceEnd: () => void;
  onOpen: () => void;
  onError: (err: Error) => void;
  onClose: (code: number, reason: string) => void;
}

export interface SttProvider {
  send(mulawFrame: Buffer): void;
  close(): void;
  readonly ready: boolean;
}

export interface DeepgramSttOpts {
  apiKey: string;
  model?: string;
  language?: string;
  sampleRate?: number;
  hints?: string[];
  smartFormat?: boolean;
}

const KEEPALIVE_MS = 5_000;
const DEEPGRAM_WSS = "wss://api.deepgram.com/v1/listen";

export function createDeepgramStt(opts: DeepgramSttOpts, events: SttEvents): SttProvider {
  const params = new URLSearchParams({
    encoding: "mulaw",
    sample_rate: String(opts.sampleRate ?? 8000),
    channels: "1",
    model: opts.model ?? "nova-3-general",
    interim_results: "true",
    endpointing: "300",
    utterance_end_ms: "1200",
    vad_events: "true",
    punctuate: "true",
    filler_words: "false",
    mip_opt_out: "true",
  });

  if (opts.language) {
    params.set("language", opts.language);
  } else {
    params.set("language", "multi");
  }

  if (opts.smartFormat !== undefined) {
    params.set("smart_format", String(opts.smartFormat));
  }

  if (opts.hints?.length) {
    // A8 (2026-08-22): nova-3 takes `keyterm` (phrase prompting); `keywords`
    // is the nova-2 boost parameter and is ignored by nova-3 — the menu terms
    // never reached the recogniser on the Media Streams path.
    const nova3 = (opts.model ?? "nova-3-general").startsWith("nova-3");
    for (const h of opts.hints.slice(0, 100)) {
      if (nova3) params.append("keyterm", h);
      else params.append("keywords", `${h}:2`);
    }
  }

  const url = `${DEEPGRAM_WSS}?${params}`;
  let ws: WebSocket | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let isReady = false;

  try {
    ws = new WebSocket(url, {
      headers: { Authorization: `Token ${opts.apiKey}` },
    });
    ws.binaryType = "arraybuffer";
  } catch (err) {
    events.onError(err instanceof Error ? err : new Error(String(err)));
    return { send() {}, close() {}, get ready() { return false; } };
  }

  ws.on("open", () => {
    isReady = true;
    keepalive = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, KEEPALIVE_MS);
    events.onOpen();
  });

  ws.on("message", (raw: Buffer | ArrayBuffer | string) => {
    try {
      const data = JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw as ArrayBufferLike).toString("utf-8"));

      if (data.type === "Results" && data.channel?.alternatives?.[0]) {
        const alt = data.channel.alternatives[0];
        const t: SttTranscript = {
          text: (alt.transcript ?? "").trim(),
          isFinal: !!data.is_final,
          speechFinal: !!data.speech_final,
          confidence: alt.confidence ?? 0,
          language: data.channel?.detected_language ?? undefined,
          start: typeof data.start === "number" ? data.start : undefined,
          duration: typeof data.duration === "number" ? data.duration : undefined,
          words: Array.isArray(alt.words)
            ? (alt.words as Array<Record<string, unknown>>).map((w) => ({
                word: String(w.word ?? ""),
                start: Number(w.start ?? 0),
                end: Number(w.end ?? 0),
                confidence: Number(w.confidence ?? 0),
              }))
            : undefined,
        };
        if (t.text) events.onTranscript(t);
      } else if (data.type === "UtteranceEnd") {
        events.onUtteranceEnd();
      }
    } catch {
      // ignore unparseable messages
    }
  });

  ws.on("error", (err: Error) => {
    captureError(err, { where: "deepgram-stt" });
    events.onError(err);
  });

  ws.on("close", (code: number, reason: Buffer) => {
    isReady = false;
    if (keepalive) clearInterval(keepalive);
    events.onClose(code, reason.toString("utf-8"));
  });

  return {
    send(mulawFrame: Buffer) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(mulawFrame);
      }
    },
    close() {
      isReady = false;
      if (keepalive) clearInterval(keepalive);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "CloseStream" }));
        ws.close(1000);
      }
      ws = null;
    },
    get ready() { return isReady; },
  };
}

/**
 * Fake STT for unit tests — emits scripted transcripts at scripted times.
 */
export interface FakeSttScript {
  delayMs: number;
  text: string;
  isFinal?: boolean;
  speechFinal?: boolean;
}

export function createFakeStt(script: FakeSttScript[], events: SttEvents): SttProvider {
  let closed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  setTimeout(() => {
    if (!closed) events.onOpen();
  }, 10);

  for (const entry of script) {
    const timer = setTimeout(() => {
      if (closed) return;
      events.onTranscript({
        text: entry.text,
        isFinal: entry.isFinal ?? true,
        speechFinal: entry.speechFinal ?? true,
        confidence: 0.95,
      });
    }, entry.delayMs);
    timers.push(timer);
  }

  return {
    send() {},
    close() {
      closed = true;
      for (const t of timers) clearTimeout(t);
    },
    get ready() { return !closed; },
  };
}

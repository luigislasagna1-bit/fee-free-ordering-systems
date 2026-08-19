/**
 * ElevenLabs streaming TTS over WebSocket.
 *
 * Opens a stream-input WebSocket per utterance (or per turn — the adapter
 * decides), sends text incrementally, and receives µ-law 8 kHz audio chunks
 * with per-chunk character alignment for barge-in prefix accounting.
 *
 * The connection is opened at turn start IN PARALLEL with the model request
 * so its handshake is hidden behind TTFT.
 */
import { WebSocket } from "ws";
import { captureError } from "../observability";

export interface TtsChunk {
  audio: Buffer;
  alignment?: TtsAlignment;
}

export interface TtsAlignment {
  chars: string[];
  charStartTimesMs: number[];
  charDurationsMs: number[];
}

export interface TtsEvents {
  onAudio: (chunk: TtsChunk) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface TtsProvider {
  sendText(text: string): void;
  flush(): void;
  close(): void;
  readonly ready: boolean;
}

export interface ElevenLabsTtsOpts {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  languageCode?: string;
  stability?: number;
  similarity?: number;
  speed?: number;
}

const ELEVENLABS_WSS = "wss://api.elevenlabs.io/v1/text-to-speech";

export function createElevenLabsTts(opts: ElevenLabsTtsOpts, events: TtsEvents): TtsProvider {
  const model = opts.modelId ?? "eleven_turbo_v2_5";
  const format = opts.outputFormat ?? "ulaw_8000";
  const url = `${ELEVENLABS_WSS}/${opts.voiceId}/stream-input?model_id=${model}&output_format=${format}${opts.languageCode ? `&language_code=${opts.languageCode}` : ""}`;

  let ws: WebSocket | null = null;
  let isReady = false;

  try {
    ws = new WebSocket(url);
  } catch (err) {
    events.onError(err instanceof Error ? err : new Error(String(err)));
    return { sendText() {}, flush() {}, close() {}, get ready() { return false; } };
  }

  ws.on("open", () => {
    isReady = true;
    // Send the BOS (beginning of stream) message with voice settings
    ws!.send(JSON.stringify({
      text: " ",
      voice_settings: {
        stability: opts.stability ?? 0.35,
        similarity_boost: opts.similarity ?? 0.75,
        speed: opts.speed ?? 1.0,
      },
      xi_api_key: opts.apiKey,
      generation_config: {
        chunk_length_schedule: [120, 160, 250, 290],
      },
      flush: true,
    }));
  });

  ws.on("message", (raw: Buffer | ArrayBuffer | string) => {
    try {
      const data = JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw as ArrayBufferLike).toString("utf-8"));

      if (data.audio) {
        const audioBuffer = Buffer.from(data.audio, "base64");
        const chunk: TtsChunk = { audio: audioBuffer };

        if (data.alignment) {
          chunk.alignment = {
            chars: data.alignment.chars ?? [],
            charStartTimesMs: data.alignment.char_start_times_ms ?? [],
            charDurationsMs: data.alignment.char_durations_ms ?? [],
          };
        }

        events.onAudio(chunk);
      }

      if (data.isFinal) {
        events.onDone();
      }
    } catch {
      // ignore unparseable messages
    }
  });

  ws.on("error", (err: Error) => {
    captureError(err, { where: "elevenlabs-tts" });
    events.onError(err);
  });

  ws.on("close", () => {
    isReady = false;
  });

  return {
    sendText(text: string) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text, flush: false }));
      }
    },
    flush() {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text: "", flush: true }));
      }
    },
    close() {
      isReady = false;
      if (ws?.readyState === WebSocket.OPEN) {
        // Send EOS (end of stream)
        ws.send(JSON.stringify({ text: "" }));
        ws.close(1000);
      }
      ws = null;
    },
    get ready() { return isReady; },
  };
}

/**
 * A cache for pre-rendered µ-law audio (greetings, fillers).
 * Key = hash(text, voiceId, model, speed, stability, similarity, lang).
 * ~50 KB per entry (3-4s of µ-law 8kHz).
 */
const audioCache = new Map<string, Buffer>();
const MAX_CACHE_ENTRIES = 200;

export function getCachedAudio(key: string): Buffer | undefined {
  return audioCache.get(key);
}

export function setCachedAudio(key: string, audio: Buffer): void {
  if (audioCache.size >= MAX_CACHE_ENTRIES) {
    const first = audioCache.keys().next().value;
    if (first !== undefined) audioCache.delete(first);
  }
  audioCache.set(key, audio);
}

export function audioCacheKey(text: string, voiceId: string, model: string, speed: number, stability: number, similarity: number, lang?: string): string {
  return `${voiceId}:${model}:${speed}:${stability}:${similarity}:${lang ?? ""}:${text}`;
}

/**
 * Render text to µ-law audio using ElevenLabs HTTP streaming API.
 * Used for pre-caching greetings and fillers.
 */
export async function renderToAudio(opts: ElevenLabsTtsOpts, text: string): Promise<Buffer> {
  const model = opts.modelId ?? "eleven_turbo_v2_5";
  const format = opts.outputFormat ?? "ulaw_8000";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/stream?model_id=${model}&output_format=${format}${opts.languageCode ? `&language_code=${opts.languageCode}` : ""}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": opts.apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: opts.stability ?? 0.35,
        similarity_boost: opts.similarity ?? 0.75,
        speed: opts.speed ?? 1.0,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS HTTP ${res.status}: ${await res.text()}`);
  }

  const chunks: Buffer[] = [];
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

/**
 * Fake TTS for unit tests — renders text as a fixed-length tone.
 */
export function createFakeTts(events: TtsEvents): TtsProvider {
  let closed = false;
  const BYTES_PER_CHAR = 40; // ~5ms per char at 8kHz µ-law

  return {
    sendText(text: string) {
      if (closed) return;
      const audio = Buffer.alloc(text.length * BYTES_PER_CHAR, 0xFF);
      events.onAudio({ audio });
    },
    flush() {
      if (!closed) events.onDone();
    },
    close() {
      closed = true;
    },
    get ready() { return !closed; },
  };
}

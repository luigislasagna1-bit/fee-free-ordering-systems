/**
 * MediaSession — adapter between Twilio Media Streams and the unchanged
 * CallSession. Synthesises ConversationRelay-shaped events (setup, prompt,
 * interrupt, dtmf) so session.ts needs zero changes.
 *
 * Inbound:  Twilio µ-law → Deepgram STT → transcript → prompt / interrupt
 * Outbound: session text → ElevenLabs TTS → FramePacer (voice + bed mix) → Twilio
 */
import { WebSocket } from "ws";
import type { CallToken } from "../config";
import type { SttProvider, SttTranscript } from "./stt";
import type { TtsProvider, TtsChunk } from "./tts";
import { getBed, BedReader } from "./bed";
import { DuckRamp } from "./mixer";
import { FramePacer } from "./pacer";

const BARGE_MIN_WORDS = 2;
const BACKCHANNEL_RE = /^(?:mm-?hmm|yeah|okay|right|uh-?huh|sure|mhm|yep)[.!,]?$/i;

export interface MediaSessionOpts {
  token: CallToken;
  twilioWs: WebSocket;
  stt: SttProvider;
  tts: TtsProvider;
  bedGainDb?: number;
  bedDuckDb?: number;
  greeting?: string;
  onSetup: () => void;
  onPrompt: (text: string, lang?: string) => void;
  onInterrupt: (utteranceUntilInterrupt: string) => void;
  onDtmf: (digit: string) => void;
  onEnd: () => void;
}

export interface MediaSessionHandle {
  sendText(text: string, last: boolean): void;
  end(reason: string): void;
  destroy(): void;
  handleTranscript(t: SttTranscript): void;
  handleUtteranceEnd(): void;
  handleTtsAudio(chunk: TtsChunk): void;
  handleTtsDone(): void;
}

export function createMediaSession(opts: MediaSessionOpts): MediaSessionHandle {
  const { twilioWs, stt, tts } = opts;

  let streamSid: string | null = null;
  let destroyed = false;
  let isSpeaking = false;
  let currentSpokenText = "";
  let markSeq = 0;

  // ── Pacer (handles voice + bed mixing internally) ────────────────────
  const bedBuf = getBed();
  const bedReader = bedBuf ? new BedReader(bedBuf) : null;
  const duckRamp = new DuckRamp();
  const pacer = new FramePacer({
    bedReader,
    gainDb: opts.bedGainDb ?? -20,
    duckDb: opts.bedDuckDb ?? -3,
    duckRamp,
  });

  let pendingTranscript = "";

  // ── Twilio Media Streams events ──────────────────────────────────────

  twilioWs.on("message", (raw: Buffer | string) => {
    if (destroyed) return;
    try {
      const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
      handleTwilioMessage(msg);
    } catch {
      // ignore malformed
    }
  });

  twilioWs.on("close", () => {
    if (!destroyed) cleanup();
  });

  function handleTwilioMessage(msg: any) {
    switch (msg.event) {
      case "connected":
        break;

      case "start":
        streamSid = msg.start?.streamSid;
        // Start the pacer — ambient bed plays immediately
        pacer.onFrame((frame) => {
          if (destroyed || !streamSid) return;
          sendMediaToTwilio(frame);
        });
        opts.onSetup();
        {
          const greetingText = opts.greeting || msg.start?.customParameters?.greeting || "";
          if (greetingText) speakText(greetingText);
        }
        break;

      case "media":
        if (msg.media?.payload) {
          const audioBytes = Buffer.from(msg.media.payload, "base64");
          stt.send(audioBytes);
        }
        break;

      case "dtmf":
        if (msg.dtmf?.digit) {
          opts.onDtmf(msg.dtmf.digit);
        }
        break;

      case "mark":
        break;

      case "stop":
        cleanup();
        break;
    }
  }

  // ── STT events ──────────────────────────────────────────────────────

  function handleTranscript(t: SttTranscript) {
    if (destroyed) return;

    if (isSpeaking) {
      const words = t.text.split(/\s+/).filter(Boolean);
      if (words.length >= BARGE_MIN_WORDS && !BACKCHANNEL_RE.test(t.text)) {
        if (!isEchoOfOwnSpeech(t.text)) {
          bargeIn(t.text);
        }
      }
      return;
    }

    if (t.isFinal) {
      pendingTranscript += (pendingTranscript ? " " : "") + t.text;
    }

    if (t.speechFinal && pendingTranscript) {
      emitPrompt(pendingTranscript, t.language);
      pendingTranscript = "";
    }
  }

  function handleUtteranceEnd() {
    if (destroyed) return;
    if (pendingTranscript && !isSpeaking) {
      emitPrompt(pendingTranscript);
      pendingTranscript = "";
    }
  }

  // ── Outbound: text → TTS → pacer → Twilio ──────────────────────────

  function speakText(text: string) {
    isSpeaking = true;
    currentSpokenText = text;
    tts.sendText(text);
    tts.flush();
  }

  function handleTtsAudio(chunk: TtsChunk) {
    if (destroyed) return;
    pacer.enqueueVoice(chunk.audio);
  }

  function handleTtsDone() {
    isSpeaking = false;
    currentSpokenText = "";
    sendMark(`speech_${markSeq++}`);
  }

  // ── Barge-in ────────────────────────────────────────────────────────

  function bargeIn(callerText: string) {
    pacer.clearVoice();
    isSpeaking = false;
    tts.close();

    const utteranceUntilInterrupt = currentSpokenText;
    currentSpokenText = "";

    opts.onInterrupt(utteranceUntilInterrupt);
    pendingTranscript = callerText;
  }

  function isEchoOfOwnSpeech(text: string): boolean {
    if (!currentSpokenText) return false;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const spoken = norm(currentSpokenText);
    const heard = norm(text);
    return spoken.startsWith(heard) || heard.length <= 3;
  }

  // ── Twilio outbound helpers ─────────────────────────────────────────

  function sendMediaToTwilio(mulaw: Uint8Array) {
    if (twilioWs.readyState !== WebSocket.OPEN || !streamSid) return;
    twilioWs.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: Buffer.from(mulaw).toString("base64") },
    }));
  }

  function sendMark(name: string) {
    if (twilioWs.readyState !== WebSocket.OPEN || !streamSid) return;
    twilioWs.send(JSON.stringify({
      event: "mark",
      streamSid,
      mark: { name },
    }));
  }

  function emitPrompt(text: string, lang?: string) {
    pendingTranscript = "";
    opts.onPrompt(text, lang);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    pacer.destroy();
    stt.close();
    tts.close();
    opts.onEnd();
  }

  // ── Public interface ────────────────────────────────────────────────

  return {
    sendText(text: string, _last: boolean) {
      if (destroyed) return;
      speakText(text);
    },
    end(_reason: string) {
      const maxWaitMs = 8_000;
      const start = Date.now();
      const drain = () => {
        if (pacer.voiceQueueLength === 0 || Date.now() - start > maxWaitMs) {
          cleanup();
        } else {
          setTimeout(drain, 100);
        }
      };
      drain();
    },
    destroy() {
      cleanup();
    },
    handleTranscript,
    handleUtteranceEnd,
    handleTtsAudio,
    handleTtsDone,
  };
}

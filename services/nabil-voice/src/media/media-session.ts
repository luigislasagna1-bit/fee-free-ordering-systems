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
import { mulawDecode } from "./mulaw";

const BARGE_MIN_WORDS = 2;
const BACKCHANNEL_RE = /^(?:mm-?hmm|yeah|okay|right|uh-?huh|sure|mhm|yep)[.!,]?$/i;
/** A7: one word that IS a barge-in — the caller stopping us. Multilingual on
 *  purpose (the recogniser runs `language=multi`); anything not here still
 *  needs BARGE_MIN_WORDS. */
const INTERJECTION_RE =
  /^(?:no|nope|wait|stop|hold on|hang on|sorry|actually|excuse me|pardon|non|nein|nee|nej|nie|ne|não|nao|nu|όχι|нет|ні|لا|לא|不|不是|不对|いいえ|違う|아니|아니요|espera|espere|attends|attendez|warte|aspetta|alto|arrête|arrete|stopp|para|fermati|halt)[.!,?]*$/i;

/**
 * A8b — BACKGROUND-SPEECH REJECTION (Luigi 2026-08-22: "the AI is listening to
 * the radio, not the customer"). Call cmt4peul: a personal-injury radio ad
 * behind the caller became four caller turns and four barge-ins. Deepgram
 * transcribes whatever it hears; only WE know how loud the caller is. Every
 * inbound 20 ms frame's RMS (dBFS) goes into a 30 s ring; a transcript's
 * segment energy is compared with the call's noise floor (10th percentile of
 * all frames) and the caller's own level (90th percentile of accepted
 * segments). Thresholds here are the calibration defaults — every `asr` event
 * carries the numbers so they are tuned on real calls, and dropping only
 * happens behind the `background_rejection` channel flag.
 */
export type GateThresholds = {
  /** Utterance confidence below this is not the caller. */
  minConfidence: number;
  /** Mean per-word confidence below this is not the caller. */
  minWordConfidence: number;
  /** A segment less than this many dB above the noise floor is background. */
  minAboveFloorDb: number;
  /** A segment more than this many dB below the caller's level is background. */
  maxBelowCallerDb: number;
};
export const DEFAULT_GATE: GateThresholds = { minConfidence: 0.55, minWordConfidence: 0.5, minAboveFloorDb: 6, maxBelowCallerDb: 15 };
const FRAME_WINDOW = 1500; // 30 s of 20 ms frames
const MIN_FRAMES_FOR_FLOOR = 50; // 1 s of audio before the floor means anything
const MIN_SEGMENTS_FOR_CALLER = 2;
const MAX_CALLER_SEGMENTS = 50;
const SEGMENT_PAD_MS = 100; // Deepgram vs Twilio clock slack

export type AsrDropReason = "low_energy" | "low_confidence" | "other_speaker";
export type AsrMeta = {
  confidence: number;
  rmsDb: number | null;
  noiseFloorDb: number | null;
  callerLevelDb: number | null;
  /** What the gate WOULD have done had rejection been on (calibration). */
  wouldDropReason: AsrDropReason | null;
};
export type AsrDropped = { text: string; reason: AsrDropReason; confidence: number; rmsDb: number | null; noiseFloorDb: number | null; callerLevelDb: number | null };

/** RMS of one µ-law frame in dBFS (−100 dB floor for digital silence). */
export function frameDb(mulaw: Uint8Array): number {
  const pcm = mulawDecode(mulaw);
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, pcm.length));
  return 20 * Math.log10(Math.max(rms, 1e-5));
}

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[i];
}

export interface MediaSessionOpts {
  token: CallToken;
  twilioWs: WebSocket;
  stt: SttProvider;
  tts: TtsProvider;
  bedGainDb?: number;
  bedDuckDb?: number;
  greeting?: string;
  onSetup: () => void;
  /** `meta` (A8b) = ASR confidence + the segment's energy vs floor/caller
   *  level, for the `asr` event. Absent only when the provider gave nothing. */
  onPrompt: (text: string, lang?: string, meta?: AsrMeta) => void;
  onInterrupt: (utteranceUntilInterrupt: string) => void;
  onDtmf: (digit: string) => void;
  onEnd: () => void;
  /** Fired on EVERY STT transcript event, interims included — live "the
   *  caller is speaking right now" evidence. The session uses it to hold a
   *  due filler instead of talking over them (session.noteCallerAudio). */
  onSpeechActivity?: () => void;
  /** A8b: a final the gate kept away from the model (radio/TV/other room). */
  onAsrDropped?: (d: AsrDropped) => void;
  /** A8b: when true, background-classified transcripts are DROPPED (never a
   *  prompt, never a barge-in). When false they pass through, but every
   *  `asr` event still carries the numbers + `wouldDropReason` for calibration. */
  backgroundRejection?: boolean;
  gate?: Partial<GateThresholds>;
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
  /** A1 (2026-08-22): set the moment the session hands off. From here the
   *  caller belongs to the human side — transcripts are discarded (never a
   *  prompt, never a barge-in), STT is closed at once, and only the TTS tail
   *  is allowed to finish before the socket closes. */
  let ending = false;
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

  // ── A8b: inbound energy + the background gate ────────────────────────
  const G: GateThresholds = { ...DEFAULT_GATE, ...(opts.gate ?? {}) };
  const frames: Array<{ ts: number; db: number }> = [];
  let fallbackTs = 0;
  const callerSegments: number[] = [];
  let pendingMeta: AsrMeta | null = null;

  function noteFrame(mulaw: Uint8Array, twilioTs: unknown) {
    const ts = Number(twilioTs);
    frames.push({ ts: Number.isFinite(ts) ? ts : fallbackTs, db: frameDb(mulaw) });
    fallbackTs += 20;
    if (frames.length > FRAME_WINDOW + 100) frames.splice(0, frames.length - FRAME_WINDOW);
  }
  function noiseFloor(): number | null {
    if (frames.length < MIN_FRAMES_FOR_FLOOR) return null;
    const sorted = frames.map((f) => f.db).sort((a, b) => a - b);
    return percentile(sorted, 0.1);
  }
  function callerLevel(): number | null {
    if (callerSegments.length < MIN_SEGMENTS_FOR_CALLER) return null;
    return percentile([...callerSegments].sort((a, b) => a - b), 0.9);
  }
  /** Power-mean dB of the frames a transcript segment covers; null when the
   *  provider gave no timing or the window has moved past it. */
  function segmentDb(startSec: number | undefined, durationSec: number | undefined): number | null {
    if (typeof startSec !== "number" || !Number.isFinite(startSec)) return null;
    const from = startSec * 1000 - SEGMENT_PAD_MS;
    const to = startSec * 1000 + (typeof durationSec === "number" && durationSec > 0 ? durationSec * 1000 : 0) + SEGMENT_PAD_MS;
    let sum = 0;
    let n = 0;
    for (const f of frames) {
      if (f.ts >= from && f.ts <= to) {
        sum += Math.pow(10, f.db / 10);
        n++;
      }
    }
    if (!n) return null;
    return 10 * Math.log10(sum / n);
  }
  type Classification = { background: boolean; reason: AsrDropReason | null; rmsDb: number | null; noiseFloorDb: number | null; callerLevelDb: number | null };
  function classify(t: SttTranscript): Classification {
    const rmsDb = segmentDb(t.start, t.duration);
    const noiseFloorDb = noiseFloor();
    const callerLevelDb = callerLevel();
    const wordConf = t.words?.length ? t.words.reduce((a, w) => a + w.confidence, 0) / t.words.length : null;
    let reason: AsrDropReason | null = null;
    if (t.confidence < G.minConfidence || (wordConf !== null && wordConf < G.minWordConfidence)) reason = "low_confidence";
    else if (rmsDb !== null && noiseFloorDb !== null && rmsDb < noiseFloorDb + G.minAboveFloorDb) reason = "low_energy";
    else if (rmsDb !== null && callerLevelDb !== null && rmsDb < callerLevelDb - G.maxBelowCallerDb) reason = "low_energy";
    return { background: !!opts.backgroundRejection && reason !== null, reason, rmsDb, noiseFloorDb, callerLevelDb };
  }
  function mergeMeta(c: Classification, confidence: number) {
    if (!pendingMeta) {
      pendingMeta = { confidence, rmsDb: c.rmsDb, noiseFloorDb: c.noiseFloorDb, callerLevelDb: c.callerLevelDb, wouldDropReason: c.reason };
      return;
    }
    pendingMeta.confidence = Math.min(pendingMeta.confidence, confidence);
    if (c.rmsDb !== null) pendingMeta.rmsDb = pendingMeta.rmsDb === null ? c.rmsDb : Math.max(pendingMeta.rmsDb, c.rmsDb);
    pendingMeta.noiseFloorDb = c.noiseFloorDb ?? pendingMeta.noiseFloorDb;
    pendingMeta.callerLevelDb = c.callerLevelDb ?? pendingMeta.callerLevelDb;
    pendingMeta.wouldDropReason = pendingMeta.wouldDropReason ?? c.reason;
  }
  function noteCallerSegment(db: number) {
    callerSegments.push(db);
    if (callerSegments.length > MAX_CALLER_SEGMENTS) callerSegments.shift();
  }

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
        console.log(`[media-session] start: streamSid=${streamSid} bedReader=${!!bedReader}`);
        pacer.onFrame((frame) => {
          if (destroyed || !streamSid) return;
          sendMediaToTwilio(frame);
        });
        opts.onSetup();
        {
          const greetingText = opts.greeting || msg.start?.customParameters?.greeting || "";
          console.log(`[media-session] greeting=${greetingText.length > 0 ? greetingText.slice(0, 40) + "..." : "(none)"}`);
          if (greetingText) speakText(greetingText);
        }
        break;

      case "media":
        if (msg.media?.payload) {
          const audioBytes = Buffer.from(msg.media.payload, "base64");
          noteFrame(audioBytes, msg.media.timestamp);
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
    if (destroyed || ending) return;
    const cls = classify(t);
    // Background speech is not "the caller is talking" — it must not hold a
    // due filler either.
    if (!cls.background) opts.onSpeechActivity?.();

    if (isSpeaking) {
      const words = t.text.split(/\s+/).filter(Boolean);
      if (cls.background || BACKCHANNEL_RE.test(t.text) || isEchoOfOwnSpeech(t.text)) return;
      // A radio ad can never cut the agent off (cmt4peul: four barge-ins).
      // A7: one word cuts us off only when it is an interjection ("no",
      // "wait", "stop") and a FINAL — an interim "no" is too often "no
      // problem" still being said.
      const interjection = words.length === 1 && t.isFinal && INTERJECTION_RE.test(t.text.trim());
      if (words.length >= BARGE_MIN_WORDS || interjection) {
        bargeIn(t.text);
        return;
      }
      // A7 (C27: "Pickup." over the tail of the question was LOST): a short
      // final that is not a barge-in is still the caller's answer — keep it
      // and hand it over the moment we stop speaking.
      if (t.isFinal) {
        pendingTranscript += (pendingTranscript ? " " : "") + t.text;
        mergeMeta(cls, t.confidence);
        if (cls.rmsDb !== null) noteCallerSegment(cls.rmsDb);
      }
      return;
    }

    if (t.isFinal) {
      if (cls.background) {
        opts.onAsrDropped?.({ text: t.text, reason: cls.reason!, confidence: t.confidence, rmsDb: cls.rmsDb, noiseFloorDb: cls.noiseFloorDb, callerLevelDb: cls.callerLevelDb });
        return;
      }
      pendingTranscript += (pendingTranscript ? " " : "") + t.text;
      mergeMeta(cls, t.confidence);
      if (cls.rmsDb !== null) noteCallerSegment(cls.rmsDb);
    }

    if (t.speechFinal && pendingTranscript) {
      emitPrompt(pendingTranscript, t.language);
    }
  }

  function handleUtteranceEnd() {
    if (destroyed || ending) return;
    if (pendingTranscript && !isSpeaking) {
      emitPrompt(pendingTranscript);
    }
  }

  // ── Outbound: text → TTS → pacer → Twilio ──────────────────────────

  let drainTimer: ReturnType<typeof setTimeout> | null = null;

  function watchForDrain() {
    if (drainTimer) clearTimeout(drainTimer);
    const check = () => {
      if (destroyed) return;
      if (pacer.voiceQueueLength === 0) {
        drainTimer = setTimeout(() => {
          if (destroyed) return;
          if (pacer.voiceQueueLength === 0) {
            isSpeaking = false;
            currentSpokenText = "";
            sendMark(`speech_${markSeq++}`);
            drainTimer = null;
            flushHeldAfterSpeech();
          } else {
            check();
          }
        }, 200);
      } else {
        drainTimer = setTimeout(check, 50);
      }
    };
    drainTimer = setTimeout(check, 400);
  }

  function speakText(text: string) {
    isSpeaking = true;
    currentSpokenText = text;
    tts.sendText(text);
    tts.flush();
    watchForDrain();
  }

  function streamToken(text: string, last: boolean) {
    isSpeaking = true;
    currentSpokenText += text;
    tts.sendText(text);
    if (last) {
      tts.flush();
      watchForDrain();
    }
  }

  function handleTtsAudio(chunk: TtsChunk) {
    if (destroyed) return;
    pacer.enqueueVoice(chunk.audio);
  }

  function handleTtsDone() {
    isSpeaking = false;
    currentSpokenText = "";
    sendMark(`speech_${markSeq++}`);
    flushHeldAfterSpeech();
  }

  /** A7: a final kept while we were speaking goes to the session as soon as
   *  the line is the caller's again (a short beat so a continuation that is
   *  mid-flight joins it). */
  let heldFlushTimer: ReturnType<typeof setTimeout> | null = null;
  function flushHeldAfterSpeech() {
    if (heldFlushTimer) clearTimeout(heldFlushTimer);
    if (!pendingTranscript) return;
    heldFlushTimer = setTimeout(() => {
      heldFlushTimer = null;
      if (destroyed || ending || isSpeaking || !pendingTranscript) return;
      emitPrompt(pendingTranscript);
    }, 250);
  }

  // ── Barge-in ────────────────────────────────────────────────────────

  function bargeIn(callerText: string) {
    if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
    pacer.clearVoice();
    isSpeaking = false;
    tts.interrupt();
    // A7: Twilio buffers audio we already sent — tell it to drop that too, or
    // the caller hears another second of us after they cut in.
    sendClear();

    const utteranceUntilInterrupt = currentSpokenText;
    currentSpokenText = "";

    opts.onInterrupt(utteranceUntilInterrupt);
    // Anything short we held while speaking belongs to the same utterance.
    pendingTranscript = pendingTranscript && !callerText.startsWith(pendingTranscript) ? `${pendingTranscript} ${callerText}` : callerText;
  }

  /** A7: an ECHO is our own sentence coming back off a speakerphone — a
   *  prefix of what we are saying, at least three words (or twelve
   *  characters) long. A one-word "no" is never an echo. */
  function isEchoOfOwnSpeech(text: string): boolean {
    if (!currentSpokenText) return false;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const spoken = norm(currentSpokenText);
    const heard = norm(text);
    if (!heard) return true; // punctuation-only noise
    const words = heard.split(" ").length;
    if (words < 3 && heard.length < 12) return false;
    return spoken.startsWith(heard);
  }

  function sendClear() {
    if (twilioWs.readyState !== WebSocket.OPEN || !streamSid) return;
    twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
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
    const meta = pendingMeta;
    pendingTranscript = "";
    pendingMeta = null;
    opts.onPrompt(text, lang, meta ?? undefined);
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
    sendText(text: string, last: boolean) {
      if (destroyed) return;
      streamToken(text, last);
    },
    end(_reason: string) {
      if (destroyed || ending) return;
      ending = true;
      // Stop LISTENING immediately — a transcript after the hand-off decision
      // must never become a prompt (the 2026-08-21 "still connecting…" loop).
      try {
        stt.close();
      } catch {
        /* already closed */
      }
      pendingTranscript = "";
      // Let the goodbye sentence finish playing, then close. 3 s is plenty for
      // one sentence; the old 8 s ceiling just delayed the store's phone ringing.
      const maxWaitMs = 3_000;
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

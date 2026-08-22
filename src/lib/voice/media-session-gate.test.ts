/**
 * A8b — background-speech rejection in the Media Streams adapter
 * (services/nabil-voice/src/media/media-session.ts).
 *
 * 2026-08-22, call cmt4peul: a radio ad behind the caller ("Did you know that
 * from the second you accident, the countdown begins? In Ontario, the law
 * limits…") was transcribed as the caller four times, barged in four times and
 * merged with the caller's real words; the caller asked for an employee.
 * Deepgram cannot know who is talking; the frame energy can. These tests feed
 * the adapter synthetic µ-law frames (loud caller, quiet radio, room silence)
 * and transcripts with Deepgram-style timing, and pin the gate's behaviour in
 * both modes: instrumentation-only (numbers on every prompt) and rejection
 * (never a prompt, never a barge-in).
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createMediaSession, frameDb, type AsrDropped, type AsrMeta } from "../../../services/nabil-voice/src/media/media-session";
import { mulawEncode } from "../../../services/nabil-voice/src/media/mulaw";

const FRAME = 160; // 20 ms at 8 kHz

/** One µ-law frame of a sine at the given peak amplitude (0..32767). */
function toneFrame(amplitude: number, phase = 0): Uint8Array {
  const pcm = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) pcm[i] = Math.round(amplitude * Math.sin(phase + (2 * Math.PI * 440 * i) / 8000));
  return mulawEncode(pcm);
}
const LOUD = 6000; // ≈ −17 dBFS — a caller on a handset
const QUIET = 150; // ≈ −49 dBFS — a radio across the room
const SILENCE = 12; // room tone

class FakeTwilioWs extends EventEmitter {
  readyState = 1;
  sent: unknown[] = [];
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
}

function build(opts: { backgroundRejection: boolean }) {
  const ws = new FakeTwilioWs();
  const prompts: Array<{ text: string; meta?: AsrMeta }> = [];
  const dropped: AsrDropped[] = [];
  const interrupts: string[] = [];
  const stt = { send() {}, close() {}, get ready() { return true; } };
  const tts = { sendText() {}, flush() {}, interrupt() {}, close() {}, get ready() { return true; } };
  const handle = createMediaSession({
    token: { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+1", from: "+2" },
    twilioWs: ws as never,
    stt,
    tts,
    onSetup: () => {},
    onPrompt: (text, _lang, meta) => prompts.push({ text, meta }),
    onInterrupt: (u) => interrupts.push(u),
    onDtmf: () => {},
    onEnd: () => {},
    onAsrDropped: (d) => dropped.push(d),
    backgroundRejection: opts.backgroundRejection,
  });
  ws.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1" } }));
  // inbound audio: ts 0–1999 silence, 2000–2999 caller, 3000–3499 silence,
  // 3500–4499 caller, 4500–4999 silence, 5000–5999 radio
  const feed = (fromMs: number, toMs: number, amp: number) => {
    for (let ts = fromMs; ts < toMs; ts += 20) {
      ws.emit("message", JSON.stringify({ event: "media", media: { payload: Buffer.from(toneFrame(amp, ts)).toString("base64"), timestamp: String(ts) } }));
    }
  };
  feed(0, 2000, SILENCE);
  feed(2000, 3000, LOUD);
  feed(3000, 3500, SILENCE);
  feed(3500, 4500, LOUD);
  feed(4500, 5000, SILENCE);
  feed(5000, 6000, QUIET);
  return { ws, handle, prompts, dropped, interrupts };
}

const final = (text: string, startSec: number, durationSec: number, confidence = 0.92) => ({
  text,
  isFinal: true,
  speechFinal: true,
  confidence,
  start: startSec,
  duration: durationSec,
});

describe("frameDb", () => {
  it("orders loud > quiet > silence", () => {
    expect(frameDb(toneFrame(LOUD))).toBeGreaterThan(frameDb(toneFrame(QUIET)) + 20);
    expect(frameDb(toneFrame(QUIET))).toBeGreaterThan(frameDb(toneFrame(SILENCE)) + 10);
  });
});

describe("instrumentation-only (flag off): everything passes, numbers ride along", () => {
  it("attaches confidence + energy to each prompt and names what WOULD have been dropped", () => {
    const { handle, prompts, dropped } = build({ backgroundRejection: false });
    handle.handleTranscript(final("One medium cheese pizza.", 2.0, 1.0));
    handle.handleTranscript(final("For pickup.", 3.5, 1.0));
    handle.handleTranscript(final("The countdown begins.", 5.0, 1.0));
    expect(dropped).toHaveLength(0);
    expect(prompts.map((p) => p.text)).toEqual(["One medium cheese pizza.", "For pickup.", "The countdown begins."]);
    const caller = prompts[0].meta!;
    expect(caller.confidence).toBe(0.92);
    expect(caller.rmsDb).toBeGreaterThan(-25);
    expect(caller.noiseFloorDb).toBeLessThan(-50);
    expect(caller.wouldDropReason).toBeNull();
    const radio = prompts[2].meta!;
    expect(radio.rmsDb).toBeLessThan(caller.rmsDb! - 15);
    expect(radio.callerLevelDb).toBeGreaterThan(-25);
    expect(radio.wouldDropReason).toBe("low_energy");
    handle.destroy();
  });
});

describe("rejection (flag on)", () => {
  it("drops the quiet radio segment once the caller's level is known, never prompting the model", () => {
    const { handle, prompts, dropped } = build({ backgroundRejection: true });
    handle.handleTranscript(final("One medium cheese pizza.", 2.0, 1.0));
    handle.handleTranscript(final("For pickup.", 3.5, 1.0));
    handle.handleTranscript(final("In Ontario, the law limits the amount of time you have to file a claim.", 5.0, 1.0));
    expect(prompts.map((p) => p.text)).toEqual(["One medium cheese pizza.", "For pickup."]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ reason: "low_energy", confidence: 0.92 });
    expect(dropped[0].rmsDb).toBeLessThan(dropped[0].callerLevelDb! - 15);
    handle.destroy();
  });

  it("drops a low-confidence final regardless of energy", () => {
    const { handle, prompts, dropped } = build({ backgroundRejection: true });
    handle.handleTranscript(final("I have to separate out of this field.", 2.0, 1.0, 0.31));
    expect(prompts).toHaveLength(0);
    expect(dropped[0]).toMatchObject({ reason: "low_confidence", confidence: 0.31 });
    handle.destroy();
  });

  it("a transcript with no timing is judged on confidence alone (never dropped for energy it cannot measure)", () => {
    const { handle, prompts, dropped } = build({ backgroundRejection: true });
    handle.handleTranscript({ text: "Pickup.", isFinal: true, speechFinal: true, confidence: 0.9 });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].meta?.rmsDb).toBeNull();
    expect(dropped).toHaveLength(0);
    handle.destroy();
  });

  it("background speech can never barge in, a real caller still can", () => {
    const { handle, interrupts } = build({ backgroundRejection: true });
    handle.handleTranscript(final("One medium cheese pizza.", 2.0, 1.0));
    handle.handleTranscript(final("For pickup.", 3.5, 1.0));
    handle.sendText("Let's see. A medium cheese pizza, coming right up.", true); // agent is speaking
    handle.handleTranscript({ text: "the countdown begins", isFinal: false, speechFinal: false, confidence: 0.9, start: 5.0, duration: 0.8 });
    expect(interrupts).toHaveLength(0);
    handle.handleTranscript({ text: "actually make it large", isFinal: false, speechFinal: false, confidence: 0.9, start: 3.6, duration: 0.8 });
    expect(interrupts).toHaveLength(1);
    handle.destroy();
  });
});

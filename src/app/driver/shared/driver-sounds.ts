/**
 * driver-sounds.ts — self-contained WebAudio sounds for the driver app
 * (Luigi 2026-07-17: "there should be some sound... when we get a new order
 * (until we accept), and when we do something like click start driving").
 *
 * PURE WebAudio synthesis, NO HTMLAudioElement anywhere. The kitchen iOS
 * investigation (cmrkvs5r) proved audio ELEMENTS are what create the phantom
 * lock-screen "Now Playing" media session on iOS — synth-only Web Audio does
 * not. Same technique as the kitchen's synthBellOnce, deliberately NOT the
 * same code: zero coupling to the kitchen display (GOLDEN, do-not-touch).
 *
 * Lifecycle:
 *  - The AudioContext is created LAZILY and only ever inside/after the first
 *    user gesture. `armAudioUnlock()` (called once by DriverApp) installs a
 *    once-only pointerdown listener; until it fires, a requested new-order
 *    chime is QUEUED (pendingChime) and plays right after the unlock tap —
 *    so a driver opening the app to a waiting job still hears it.
 *  - Everything no-ops cleanly during SSR, when muted, or when the context
 *    can't start (old WebView, autoplay policy, etc.). Sounds are a nicety;
 *    they must never throw into the queue poll path.
 *
 * Mute is persisted in localStorage ("ffd-sounds-muted", default UNMUTED)
 * and read at play time, so the Profile toggle needs no event plumbing.
 *
 * Testability: every ACTUALLY-played sound is recorded on
 * `window.__ffdLastSound = { kind, at }` so an E2E can assert sounds fired
 * without audio capture.
 */

type SoundKind = "newOrder" | "tick";

const MUTE_KEY = "ffd-sounds-muted";

let audioCtx: AudioContext | null = null;
let unlocked = false;
let pendingChime = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  // Best-effort resume — allowed without a fresh gesture once the page has
  // been unlocked (same rule the kitchen relies on).
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Whether driver-app sounds are muted (persisted; default UNMUTED). */
export function isSoundsMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the mute flag (Profile toggle writes here). */
export function setSoundsMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* storage unavailable (private mode) — sounds simply stay unmuted */
  }
}

function recordLastSound(kind: SoundKind): void {
  try {
    (window as unknown as { __ffdLastSound?: { kind: SoundKind; at: number } }).__ffdLastSound = {
      kind,
      at: Date.now(),
    };
  } catch {
    /* noop */
  }
}

/** One enveloped sine tone — quick attack, exponential decay, self-cleaning. */
function tone(ctx: AudioContext, freq: number, at: number, dur: number, peak: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* noop */
    }
  };
}

/**
 * Pleasant two-tone ascending chime (~0.6s) — "a new job is waiting".
 * Queued until the unlock gesture if requested before it.
 */
export function playNewOrderChime(): void {
  if (typeof window === "undefined" || isSoundsMuted()) return;
  if (!unlocked) {
    // Autoplay policy would block it anyway — remember it and let the
    // unlock gesture play it (driver opens app → taps anywhere → hears it).
    pendingChime = true;
    return;
  }
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    tone(ctx, 880, t0, 0.42, 0.4); // A5
    tone(ctx, 1174.66, t0 + 0.18, 0.42, 0.4); // D6 — total ≈ 0.6s
    recordLastSound("newOrder");
  } catch {
    /* never throw into callers */
  }
}

/** Short soft confirmation blip (~0.15s) — "your action landed". */
export function playTick(): void {
  if (typeof window === "undefined" || isSoundsMuted() || !unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    tone(ctx, 1318.5, ctx.currentTime, 0.14, 0.3); // E6
    recordLastSound("tick");
  } catch {
    /* never throw into callers */
  }
}

/**
 * Install the once-only pointerdown unlock listener. Returns a cleanup
 * (safe under React StrictMode double-mount). The AudioContext is created
 * INSIDE the gesture so it starts in the "running" state.
 */
export function armAudioUnlock(): () => void {
  if (typeof window === "undefined" || unlocked) return () => {};
  const unlock = () => {
    unlocked = true;
    getCtx();
    if (pendingChime) {
      pendingChime = false;
      playNewOrderChime();
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  return () => window.removeEventListener("pointerdown", unlock);
}

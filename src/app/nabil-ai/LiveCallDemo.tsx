"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Phone, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

/* ── Transcript data ──────────────────────────────────────────────────── */

type OrderItem = {
  name: string;
  price: string;
  details?: string[];
};

type OrderUpdate = {
  items: OrderItem[];
  discount?: { label: string; amount: string };
  deliveryFee?: { label: string; amount: string };
  total?: string;
};

type Line = {
  speaker: "nabil" | "caller";
  text: string;
  /** Audio second when speech begins (original, pre-compression). */
  at: number;
  /** If present, the order summary updates to this state. */
  order?: OrderUpdate;
};

const TRANSCRIPT: Line[] = [
  // Original recorded demo call, compressed to remove AI processing pauses.
  // Both voices are real: Nabil = ElevenLabs, Caller = real person.
  {
    speaker: "nabil",
    text: "Thanks for calling Luigi's Lasagna & Pizzeria in Milton, Ontario. Is this for pick up or delivery?",
    at: 0.5,
  },
  {
    speaker: "caller",
    text: "It's for delivery.",
    at: 7.5,
  },
  {
    speaker: "nabil",
    text: "Great, I can do delivery for you. Could I get the delivery address, please?",
    at: 11.4,
  },
  {
    speaker: "caller",
    text: "150 Mary Street, Milton.",
    at: 16.8,
  },
  {
    speaker: "nabil",
    text: "Delivery to a hundred fifty Mary Street works, and that fee is seven dollars and ninety-nine cents — or free once your order's over thirty dollars. Could I get the postal code there?",
    at: 20.2,
  },
  {
    speaker: "caller",
    text: "Yeah, the postal code is L9T 6Z5.",
    at: 30.7,
  },
  {
    speaker: "nabil",
    text: "Got it, thanks. So what can I get started for you today?",
    at: 35.5,
  },
  {
    speaker: "caller",
    text: "Do you have any specials?",
    at: 39.1,
  },
  {
    speaker: "nabil",
    text: "We've got several combo deals — things like the Large and Wings Combo with a large three-topping pizza and twenty wings for thirty-nine ninety-nine, a Double Large Combo with two large three-topping pizzas and two dips for thirty-nine ninety-nine, and a Family Feast with an extra-large pizza, wings, mozzarella sticks, fries, pop and dips for fifty-nine ninety-nine. There's also a medium one-topping pizza with a lava cake for twenty-four ninety-nine. Would any of those sound good, or would you like to hear more?",
    at: 41.2,
  },
  {
    speaker: "caller",
    text: "You know what? The large and wings combo sounded good.",
    at: 57.8,
  },
  {
    speaker: "nabil",
    text: "Good choice — that comes with a large three-topping pizza and twenty wings. What toppings would you like on the pizza, and how would you like the wings done — a sauce mixed in or on the side, and which flavor?",
    at: 61.8,
  },
  {
    speaker: "caller",
    text: "Can I get pepperoni, mushroom, and green peppers on one half?",
    at: 69.6,
  },
  {
    speaker: "nabil",
    text: "Sure, pepperoni, mushroom and green peppers on one half — and what would you like on the other half?",
    at: 74.1,
  },
  {
    speaker: "caller",
    text: "And chicken, green pepper, and onions on the other half.",
    at: 79.1,
  },
  {
    speaker: "nabil",
    text: "Got it — and how would you like the wings, mixed in or on the side, and what flavor: honey garlic, hot, BBQ, mild, or sweet heat?",
    at: 84.0,
  },
  {
    speaker: "caller",
    text: "I'll get BBQ sauce on the side.",
    at: 87.9,
  },
  {
    speaker: "nabil",
    text: "You've got a Large and Wings Combo with a large pizza — half pepperoni and mushrooms, half chicken and onions, green peppers on the whole thing — plus a twenty piece Chicken Wings with BBQ on the side. Anything else for you?",
    at: 91.5,
    order: {
      items: [
        {
          name: "1× Large & Wings Combo",
          price: "$39.99",
          details: [
            "Pizza: half Pepperoni & Mushrooms, half Chicken & Onions",
            "Green Peppers on the whole thing",
            "20pc Wings — BBQ on the side",
          ],
        },
      ],
    },
  },
  {
    speaker: "caller",
    text: "Yeah, can I get two garlic dips as well?",
    at: 108.5,
  },
  {
    speaker: "nabil",
    text: "Two garlic dipping sauces, got it. Anything else?",
    at: 112.5,
    order: {
      items: [
        {
          name: "1× Large & Wings Combo",
          price: "$39.99",
          details: [
            "Pizza: half Pepperoni & Mushrooms, half Chicken & Onions",
            "Green Peppers on the whole thing",
            "20pc Wings — BBQ on the side",
          ],
        },
        { name: "2× Garlic Dipping Sauce", price: "$3.00" },
      ],
    },
  },
  {
    speaker: "caller",
    text: "No, just what's my total?",
    at: 115.5,
  },
  {
    speaker: "nabil",
    text: "Before I get you the total, could I get a name for the order?",
    at: 118.4,
  },
  {
    speaker: "caller",
    text: "Yeah, it's for Sam.",
    at: 123.0,
  },
  {
    speaker: "nabil",
    text: "Thanks, Sam. So that's a Large and Wings Combo with a large pizza — half pepperoni and mushrooms, half chicken and onions, green peppers on the whole thing — plus a twenty piece Chicken Wings, BBQ on the side, and two garlic dipping sauces, delivered to you. Your total comes to forty-eight dollars and fifty-eight cents, tax included. Shall I go ahead and place that?",
    at: 125.9,
    order: {
      items: [
        {
          name: "1× Large & Wings Combo",
          price: "$39.99",
          details: [
            "Pizza: half Pepperoni & Mushrooms, half Chicken & Onions",
            "Green Peppers on the whole thing",
            "20pc Wings — BBQ on the side",
          ],
        },
        { name: "2× Garlic Dipping Sauce", price: "$3.00" },
      ],
      deliveryFee: { label: "Delivery", amount: "FREE" },
      total: "$48.58",
    },
  },
  {
    speaker: "caller",
    text: "Sure.",
    at: 147.5,
  },
  {
    speaker: "nabil",
    text: "All set, Sam! Just a heads up, this was a demo call, so nothing's actually being cooked up — but that's exactly how a real order would go from start to finish. If you'd like to see more, check out feefreeordering.com/nabil-ai. Thanks so much for trying it out!",
    at: 148.9,
  },
];

const SILENCE_GAPS: { start: number; end: number }[] = [];

const GAP_KEEP = 0.4;

const TOTAL_DURATION = 157;

const TOTAL_SAVED = SILENCE_GAPS.reduce(
  (sum, g) => sum + Math.max(0, g.end - g.start - GAP_KEEP),
  0,
);
const COMPRESSED_DURATION = TOTAL_DURATION - TOTAL_SAVED;

const WORDS_PER_SEC_NABIL = 2.8;
const WORDS_PER_SEC_CALLER = 3.5;

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function compressedTime(audioTime: number): number {
  let saved = 0;
  for (const g of SILENCE_GAPS) {
    const gapDur = g.end - g.start - GAP_KEEP;
    if (gapDur <= 0) continue;
    if (audioTime >= g.end) {
      saved += gapDur;
    } else if (audioTime > g.start + GAP_KEEP) {
      saved += audioTime - g.start - GAP_KEEP;
    }
  }
  return audioTime - saved;
}

function speechDuration(line: Line, nextAt: number | null): number {
  const wps = line.speaker === "nabil" ? WORDS_PER_SEC_NABIL : WORDS_PER_SEC_CALLER;
  const wordCount = line.text.split(/\s+/).length;
  const estimated = wordCount / wps;
  const maxDur = nextAt != null ? Math.max(0.5, nextAt - line.at - 0.2) : estimated;
  return Math.min(estimated, maxDur);
}

/* ── Component ────────────────────────────────────────────────────────── */

export function LiveCallDemo({
  heading,
  subheading,
  playLabel,
  replayLabel,
  pauseLabel,
  liveLabel,
  orderHeading,
  audioSrc,
}: {
  heading: string;
  subheading: string;
  playLabel: string;
  replayLabel: string;
  pauseLabel: string;
  liveLabel: string;
  orderHeading: string;
  audioSrc?: string;
}) {
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [currentOrder, setCurrentOrder] = useState<OrderUpdate | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioReady, setAudioReady] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [wordProgress, setWordProgress] = useState<number[]>([]);

  const startRef = useRef(0);
  const pausedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioSrc) return;
    const audio = new Audio(audioSrc);
    audio.preload = "auto";
    audio.volume = volume;
    audio.addEventListener("canplaythrough", () => setAudioReady(true), { once: true });
    audio.addEventListener("error", () => setAudioReady(false));
    audio.addEventListener("ended", () => setState("done"));
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, [audioSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [muted, volume]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      const audio = audioRef.current;
      let secs: number;

      if (audio && !audio.paused) {
        for (const g of SILENCE_GAPS) {
          if (audio.currentTime >= g.start + GAP_KEEP && audio.currentTime < g.end) {
            audio.currentTime = g.end;
            break;
          }
        }
        secs = audio.currentTime;
      } else {
        secs = (performance.now() - startRef.current) / 1000;
      }

      setElapsed(secs);

      let count = 0;
      let lastOrder: OrderUpdate | null = null;
      const wp: number[] = [];
      for (let i = 0; i < TRANSCRIPT.length; i++) {
        const line = TRANSCRIPT[i];
        if (secs >= line.at) {
          count++;
          if (line.order) lastOrder = line.order;
          const nextAt = i + 1 < TRANSCRIPT.length ? TRANSCRIPT[i + 1].at : null;
          const dur = speechDuration(line, nextAt);
          const totalWords = line.text.split(/\s+/).length;
          const timeSinceStart = secs - line.at;
          const wordsShown = Math.min(totalWords, Math.ceil((timeSinceStart / dur) * totalWords));
          wp.push(wordsShown);
        } else {
          break;
        }
      }
      setVisibleCount(count);
      setWordProgress(wp);
      if (lastOrder) setCurrentOrder(lastOrder);

      if (secs >= TOTAL_DURATION) {
        stopTimer();
        setState("done");
        setVisibleCount(TRANSCRIPT.length);
        setWordProgress(TRANSCRIPT.map((l) => l.text.split(/\s+/).length));
      }
    }, 50);
  }, [stopTimer]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (state === "idle" || state === "done") {
      setVisibleCount(0);
      setWordProgress([]);
      setCurrentOrder(null);
      setElapsed(0);
      startRef.current = performance.now();
      if (audio && audioReady) { audio.currentTime = 0; void audio.play(); }
      setState("playing");
      startTimer();
    } else if (state === "paused") {
      startRef.current += performance.now() - pausedAtRef.current;
      if (audio && audioReady) void audio.play();
      setState("playing");
      startTimer();
    }
  }, [state, startTimer, audioReady]);

  const pause = useCallback(() => {
    if (state === "playing") {
      stopTimer();
      pausedAtRef.current = performance.now();
      if (audioRef.current) audioRef.current.pause();
      setState("paused");
    }
  }, [state, stopTimer]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (audioRef.current) audioRef.current.pause();
    };
  }, [stopTimer]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleCount]);

  const isPlaying = state === "playing";
  const isDone = state === "done";
  const cTime = compressedTime(elapsed);
  const progress = Math.min(100, (cTime / COMPRESSED_DURATION) * 100);

  return (
    <div>
      <div className="text-center mb-8 md:mb-12">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.08]">
          {heading}
        </h2>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">{subheading}</p>
      </div>

      <div className="max-w-5xl mx-auto grid lg:grid-cols-5 gap-6 lg:gap-8">
        {/* ── Transcript panel ─────────────────────────────────────── */}
        <div className="lg:col-span-3 rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {isPlaying && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
              {isPlaying ? liveLabel : "Nabil AI"}
              {(isPlaying || state === "paused") && (
                <span className="ml-1 tabular-nums">{formatTimer(cTime)}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
          </div>

          {/* Progress bar */}
          {state !== "idle" && (
            <div className="h-0.5 bg-gray-100">
              <div
                className="h-full bg-emerald-400 transition-[width] duration-200 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Chat area */}
          <div className="h-[380px] sm:h-[420px] overflow-y-auto p-4 sm:p-5 space-y-3">
            {state === "idle" ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center ring-1 ring-emerald-100">
                  <Phone className="w-7 h-7" />
                </div>
                <p className="text-gray-500 text-sm max-w-xs">
                  {subheading}
                </p>
              </div>
            ) : (
              <>
                {TRANSCRIPT.slice(0, visibleCount).map((line, i) => {
                  const words = line.text.split(/\s+/);
                  const shown = wordProgress[i] ?? words.length;
                  const visibleText = words.slice(0, shown).join(" ");
                  const isTyping = shown < words.length;

                  return (
                    <div
                      key={i}
                      className={`flex ${line.speaker === "caller" ? "justify-start" : "justify-end"}`}
                      style={i === visibleCount - 1 && shown <= 1 ? { animation: "fadeSlideIn 0.25s ease-out" } : undefined}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          line.speaker === "caller"
                            ? "bg-gray-100 text-gray-800 rounded-bl-sm"
                            : "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100 rounded-br-sm"
                        }`}
                      >
                        <div
                          className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
                            line.speaker === "caller" ? "text-gray-400" : "text-emerald-600"
                          }`}
                        >
                          {line.speaker === "caller" ? "Caller" : "Nabil"}
                        </div>
                        <span>{visibleText}</span>
                        {isTyping && (
                          <span className="inline-block w-[3px] h-[14px] bg-current opacity-60 ml-0.5 align-text-bottom animate-blink" />
                        )}
                      </div>
                    </div>
                  );
                })}
                {isPlaying && visibleCount > 0 && visibleCount < TRANSCRIPT.length && (() => {
                  const lastShown = wordProgress[visibleCount - 1];
                  const lastTotal = TRANSCRIPT[visibleCount - 1].text.split(/\s+/).length;
                  if (lastShown >= lastTotal) {
                    return (
                      <div className={`flex ${TRANSCRIPT[visibleCount].speaker === "caller" ? "justify-start" : "justify-end"}`}>
                        <div className={`rounded-2xl rounded-br-sm px-4 py-3 ${
                          TRANSCRIPT[visibleCount].speaker === "caller"
                            ? "bg-gray-100"
                            : "bg-emerald-50 ring-1 ring-emerald-100"
                        }`}>
                          <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>

          {/* Play controls */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-center gap-3">
            {state === "idle" && (
              <button
                onClick={play}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition duration-200 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)]"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                {playLabel}
              </button>
            )}
            {isPlaying && (
              <button
                onClick={pause}
                className="inline-flex items-center gap-2 bg-gray-200 text-gray-700 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-gray-300 transition duration-200"
              >
                <Pause className="w-4 h-4" />
                {pauseLabel}
              </button>
            )}
            {state === "paused" && (
              <button
                onClick={play}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition duration-200 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)]"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                {playLabel}
              </button>
            )}
            {isDone && (
              <button
                onClick={play}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition duration-200 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)]"
              >
                <RotateCcw className="w-4 h-4" />
                {replayLabel}
              </button>
            )}
          </div>

          {/* Volume control */}
          {audioReady && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3">
              <button
                onClick={() => setMuted((m) => !m)}
                className="text-gray-400 hover:text-gray-600 transition"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (v > 0 && muted) setMuted(false);
                }}
                className="w-24 h-1 accent-emerald-500"
                aria-label="Volume"
              />
            </div>
          )}
        </div>

        {/* ── Order summary panel ──────────────────────────────────── */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)] self-start">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {orderHeading}
            </div>
          </div>
          <div className="p-4 sm:p-5 min-h-[200px]">
            {!currentOrder ? (
              <div className="flex items-center justify-center h-[160px] text-gray-300 text-sm">
                {state === "idle"
                  ? "Press play to start"
                  : "Waiting for items…"}
              </div>
            ) : (
              <div className="space-y-3" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
                {currentOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-start gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                      {item.details?.map((d, j) => (
                        <div key={j} className="text-xs text-gray-500 ml-2">{d}</div>
                      ))}
                    </div>
                    <div className="text-sm font-semibold text-gray-700 flex-shrink-0">{item.price}</div>
                  </div>
                ))}

                {currentOrder.discount && (
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-dashed border-gray-200">
                    <div className="text-sm text-emerald-700 font-medium">{currentOrder.discount.label}</div>
                    <div className="text-sm text-emerald-700 font-semibold">{currentOrder.discount.amount}</div>
                  </div>
                )}

                {currentOrder.deliveryFee && (
                  <div className="flex justify-between items-center gap-2">
                    <div className="text-sm text-gray-600">{currentOrder.deliveryFee.label}</div>
                    <div className="text-sm text-gray-600">{currentOrder.deliveryFee.amount}</div>
                  </div>
                )}

                {currentOrder.total && (
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-200">
                    <div className="text-sm font-bold text-gray-900">Total</div>
                    <div className="text-base font-bold text-gray-900">{currentOrder.total}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 0.7s step-end infinite;
        }
      `}</style>
    </div>
  );
}

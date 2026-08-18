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
  /** Cumulative seconds into the call when this line appears. */
  at: number;
  /** If present, the order summary updates to this state. */
  order?: OrderUpdate;
};

const TRANSCRIPT: Line[] = [
  // Real call to the Nabil AI demo line, 2026-08-17.
  // Timestamps synced to the Twilio recording (offset ~8s for greeting).
  // "Mhm."/"Right." voice fillers omitted from bubbles (audible only).
  {
    speaker: "caller",
    text: "It's for delivery.",
    at: 8,
  },
  {
    speaker: "nabil",
    text: "Great, I can do delivery for you. Could I get the delivery address, please?",
    at: 10,
  },
  {
    speaker: "caller",
    text: "It's one fifty Mary Street in Milton.",
    at: 19,
  },
  {
    speaker: "nabil",
    text: "Delivery to a hundred fifty Mary Street works, and that fee is seven dollars and ninety-nine cents — or free once your order's over thirty dollars. Could I get the postal code there?",
    at: 23,
  },
  {
    speaker: "caller",
    text: "Yeah, the postal code is L9T 6Z5.",
    at: 40,
  },
  {
    speaker: "nabil",
    text: "Got it, thanks. So what can I get started for you today?",
    at: 44,
  },
  {
    speaker: "caller",
    text: "Do you have any specials?",
    at: 50,
  },
  {
    speaker: "nabil",
    text: "We've got several combo deals — the Large and Wings Combo with a large three-topping pizza and twenty wings for thirty-nine ninety-nine, a Double Large Combo with two large pizzas and two dips for thirty-nine ninety-nine, and a Family Feast for fifty-nine ninety-nine. Would any of those sound good?",
    at: 54,
  },
  {
    speaker: "caller",
    text: "The large and wings combo sounds good.",
    at: 70,
  },
  {
    speaker: "nabil",
    text: "Good choice — that comes with a large three-topping pizza and twenty wings. What toppings would you like on the pizza, and how would you like the wings done?",
    at: 74,
  },
  {
    speaker: "caller",
    text: "Can I get pepperoni, mushroom, and green peppers on one half?",
    at: 91,
  },
  {
    speaker: "nabil",
    text: "Sure, pepperoni, mushroom and green peppers on one half — and what would you like on the other half?",
    at: 93,
  },
  {
    speaker: "caller",
    text: "Chicken, green pepper, and onions on the other half.",
    at: 96,
  },
  {
    speaker: "nabil",
    text: "Got it — and how would you like the wings? Honey garlic, hot, BBQ, mild, or sweet heat?",
    at: 99,
  },
  {
    speaker: "caller",
    text: "I'll get barbecue sauce on the side.",
    at: 111,
  },
  {
    speaker: "nabil",
    text: "You've got a Large and Wings Combo with a large pizza — half pepperoni and mushrooms, half chicken and onions, green peppers on the whole thing — plus twenty piece Chicken Wings with BBQ on the side. Anything else for you?",
    at: 116,
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
    at: 135,
  },
  {
    speaker: "nabil",
    text: "Two garlic dipping sauces, got it. Anything else?",
    at: 139,
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
    at: 146,
  },
  {
    speaker: "nabil",
    text: "Before I get you the total, could I get a name for the order?",
    at: 148,
  },
  {
    speaker: "caller",
    text: "Yeah, it's for Sam.",
    at: 153,
  },
  {
    speaker: "nabil",
    text: "Thanks, Sam. So that's a Large and Wings Combo with a large pizza — half pepperoni and mushrooms, half chicken and onions, green peppers on the whole thing — plus twenty piece Chicken Wings, BBQ on the side, and two garlic dipping sauces, delivered to you. Your total comes to forty-eight dollars and fifty-eight cents, tax included. Shall I go ahead and place that?",
    at: 158,
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
    at: 180,
  },
  {
    speaker: "nabil",
    text: "All set, Sam! This was a demo call, so nothing's actually being cooked up — but that's exactly how a real order would go from start to finish.",
    at: 184,
  },
];

const TOTAL_DURATION = 195; // seconds — real call with audio

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [visibleLines, setVisibleLines] = useState(0);
  const [currentOrder, setCurrentOrder] = useState<OrderUpdate | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [audioReady, setAudioReady] = useState(false);

  const startRef = useRef(0);
  const pausedAtRef = useRef(0);
  const rafRef = useRef(0);
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

  const tick = useCallback(() => {
    const audio = audioRef.current;
    const secs = audio && audioReady
      ? audio.currentTime
      : (performance.now() - startRef.current) / 1000;
    setElapsed(secs);

    let lines = 0;
    let lastOrder: OrderUpdate | null = null;
    for (const line of TRANSCRIPT) {
      if (secs >= line.at) {
        lines++;
        if (line.order) lastOrder = line.order;
      } else break;
    }
    setVisibleLines(lines);
    if (lastOrder) setCurrentOrder(lastOrder);

    if (secs >= TOTAL_DURATION) {
      setState("done");
      setVisibleLines(TRANSCRIPT.length);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [audioReady]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (state === "idle" || state === "done") {
      setVisibleLines(0);
      setCurrentOrder(null);
      setElapsed(0);
      startRef.current = performance.now();
      if (audio && audioReady) { audio.currentTime = 0; void audio.play(); }
      setState("playing");
      rafRef.current = requestAnimationFrame(tick);
    } else if (state === "paused") {
      startRef.current += performance.now() - pausedAtRef.current;
      if (audio && audioReady) void audio.play();
      setState("playing");
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [state, tick, audioReady]);

  const pause = useCallback(() => {
    if (state === "playing") {
      cancelAnimationFrame(rafRef.current);
      pausedAtRef.current = performance.now();
      if (audioRef.current) audioRef.current.pause();
      setState("paused");
    }
  }, [state]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleLines]);

  const isPlaying = state === "playing";
  const isDone = state === "done";

  return (
    <div>
      {/* Header + controls */}
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
                <span className="ml-1 tabular-nums">{formatTimer(elapsed)}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
          </div>

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
                {TRANSCRIPT.slice(0, visibleLines).map((line, i) => (
                  <div
                    key={i}
                    className={`flex ${line.speaker === "caller" ? "justify-start" : "justify-end"}`}
                    style={{
                      animation: "fadeSlideIn 0.3s ease-out",
                    }}
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
                      {line.text}
                    </div>
                  </div>
                ))}
                {isPlaying && visibleLines < TRANSCRIPT.length && (
                  <div className="flex justify-end">
                    <div className="bg-emerald-50 ring-1 ring-emerald-100 rounded-2xl rounded-br-sm px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
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

          {/* Volume control — only shown when audio is available */}
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
              <div className="space-y-3">
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

      {/* Inline keyframes — no animation library */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
